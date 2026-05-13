// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::cmp::Ordering;
use std::io::{Read, copy};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(debug_assertions)]
use tauri::Manager;

use serde::Serialize;

const PRIMARY_LOG_FILE_HINT: &str = "maa.log / maa.bak*.log / maafw.log / maafw.bak*.log";

#[derive(Clone, Copy, PartialEq, Eq)]
enum PrimaryLogKind {
    Main,
    Bak,
}

#[derive(Clone)]
struct PrimaryLogCandidate {
    path: String,
    dir_path: String,
    kind: PrimaryLogKind,
    rotated_timestamp_hint: Option<String>,
}

struct LoadedPrimaryLogSegment {
    path: String,
    name: String,
    kind: PrimaryLogKind,
    rotated_timestamp_hint: Option<String>,
    content_timestamp: Option<String>,
    content: String,
}

#[derive(Serialize)]
struct LoadedPrimaryLogFileDto {
    path: String,
    name: String,
    content: String,
}

#[derive(Serialize)]
struct ArchiveExtractResult {
    content: String,
    primary_log_files: Vec<LoadedPrimaryLogFileDto>,
    error_images: HashMap<String, String>,
    vision_images: HashMap<String, String>,
    wait_freezes_images: HashMap<String, String>,
}

#[tauri::command]
fn extract_zip_log(path: String) -> Result<ArchiveExtractResult, String> {
    let lower = path.to_lowercase();
    if !lower.ends_with(".zip") {
        return Err(format!("Tauri 桌面端目前仅支持 ZIP 格式。7z 和 RAR 请使用 Web 版本。"));
    }

    let file = std::fs::File::open(&path).map_err(|e| format!("无法打开文件: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("无法读取 ZIP: {e}"))?;
    let temp_dir = create_zip_temp_dir(&path)?;
    let mut temp_seq: u64 = 0;

    // Collect all file names
    let names: Vec<String> = (0..archive.len())
        .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
        .collect();

    let selected_logs = select_primary_log_group(&names);
    if selected_logs.is_empty() {
        return Err(format!("ZIP 中未找到主日志文件（{PRIMARY_LOG_FILE_HINT}）"));
    }

    let base = selected_logs[0].dir_path.clone();
    let selected_log_lookup: HashMap<String, PrimaryLogCandidate> = selected_logs
        .into_iter()
        .map(|candidate| (candidate.path.to_lowercase(), candidate))
        .collect();
    let on_error_prefix = join_path(&base, "on_error/");
    let vision_prefix = join_path(&base, "vision/");

    let mut log_segments: Vec<LoadedPrimaryLogSegment> = Vec::new();
    let mut error_images: HashMap<String, String> = HashMap::new();
    let mut vision_images: HashMap<String, String> = HashMap::new();
    let mut wait_freezes_images: HashMap<String, String> = HashMap::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("读取条目失败: {e}"))?;
        let name = entry.name().replace('\\', "/");
        let lower = name.to_lowercase();

        if let Some(candidate) = selected_log_lookup.get(&lower) {
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf).map_err(|e| format!("读取失败: {e}"))?;
            let content = decode_content(&buf);
            log_segments.push(LoadedPrimaryLogSegment {
                path: candidate.path.clone(),
                name: candidate.path.rsplit('/').next().unwrap_or(&candidate.path).to_string(),
                kind: candidate.kind,
                rotated_timestamp_hint: candidate.rotated_timestamp_hint.clone(),
                content_timestamp: extract_first_log_timestamp(&content),
                content,
            });
        } else if lower.starts_with(&on_error_prefix.to_lowercase()) && lower.ends_with(".png") {
            // Extract filename
            let file_name = name.rsplit('/').next().unwrap_or("");
            if let Some(key) = parse_error_image_key(file_name) {
                let saved_path = save_zip_entry_to_temp_file(&mut entry, &temp_dir, &mut temp_seq, "png")?;
                error_images.insert(key, saved_path);
            }
        } else if lower.starts_with(&vision_prefix.to_lowercase()) && lower.ends_with(".jpg") {
            let file_name = name.rsplit('/').next().unwrap_or("");
            if let Some(key) = parse_wait_freezes_key(file_name) {
                let saved_path = save_zip_entry_to_temp_file(&mut entry, &temp_dir, &mut temp_seq, "jpg")?;
                wait_freezes_images.insert(key, saved_path);
            } else if let Some(key) = parse_vision_image_key(file_name) {
                let saved_path = save_zip_entry_to_temp_file(&mut entry, &temp_dir, &mut temp_seq, "jpg")?;
                // 同一 key 覆盖（取最后出现的文件）
                vision_images.insert(key, saved_path);
            }
        }
    }

    log_segments.sort_by(compare_loaded_log_segments);
    let primary_log_files: Vec<LoadedPrimaryLogFileDto> = log_segments
        .into_iter()
        .filter(|segment| !segment.content.is_empty())
        .map(|segment| LoadedPrimaryLogFileDto {
            path: segment.path,
            name: segment.name,
            content: segment.content,
        })
        .collect();

    if primary_log_files.is_empty() {
        return Err("ZIP 中未找到有效的日志内容".to_string());
    }

    Ok(ArchiveExtractResult {
        content: String::new(),
        primary_log_files,
        error_images,
        vision_images,
        wait_freezes_images,
    })
}

fn create_zip_temp_dir(zip_path: &str) -> Result<PathBuf, String> {
    let stem = Path::new(zip_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("zip")
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>();

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("获取系统时间失败: {e}"))?
        .as_millis();

    let mut dir = std::env::temp_dir();
    dir.push(format!("maa-log-analyzer-zip-{stem}-{ts}"));
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建临时目录失败: {e}"))?;
    Ok(dir)
}

fn save_zip_entry_to_temp_file(
    entry: &mut zip::read::ZipFile<'_>,
    temp_dir: &Path,
    seq: &mut u64,
    ext: &str,
) -> Result<String, String> {
    *seq += 1;
    let path = temp_dir.join(format!("{:08}.{ext}", *seq));
    let mut output = std::fs::File::create(&path).map_err(|e| format!("创建临时文件失败: {e}"))?;
    copy(entry, &mut output).map_err(|e| format!("写入临时文件失败: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

fn normalize_timestamp_milliseconds(value: &str) -> Option<String> {
    let dot_pos = value.rfind('.')?;
    let ms = &value[dot_pos + 1..];
    if ms.is_empty() || ms.len() > 3 || !ms.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    Some(format!("{}.{:0<3}", &value[..dot_pos], ms))
}

fn looks_like_rotation_timestamp(value: &str) -> bool {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() < 21 || chars.len() > 23 {
        return false;
    }
    for (idx, ch) in chars.iter().enumerate() {
        let expected_sep = match idx {
            4 | 7 | 13 | 16 => Some('.'),
            10 => Some('-'),
            _ => None,
        };
        if let Some(sep) = expected_sep {
            if *ch != sep {
                return false;
            }
        } else if !ch.is_ascii_digit() {
            return false;
        }
    }
    true
}

fn parse_primary_log_candidate(raw_path: &str) -> Option<PrimaryLogCandidate> {
    let normalized = raw_path.replace('\\', "/");
    let file_name = normalized.rsplit('/').next()?.to_string();
    let lower = file_name.trim().to_ascii_lowercase();

    let (kind, rotated_timestamp_hint) = if lower == "maa.log" || lower == "maafw.log" {
        (PrimaryLogKind::Main, None)
    } else if lower == "maa.bak.log" || lower == "maafw.bak.log" {
        (PrimaryLogKind::Bak, None)
    } else if let Some(rest) = lower
        .strip_prefix("maa.bak.")
        .or_else(|| lower.strip_prefix("maafw.bak."))
    {
        let timestamp = rest.strip_suffix(".log")?;
        if !looks_like_rotation_timestamp(timestamp) {
            return None;
        }
        (PrimaryLogKind::Bak, normalize_timestamp_milliseconds(timestamp))
    } else {
        return None;
    };

    let dir_path = match normalized.rfind('/') {
        Some(idx) => normalized[..idx].to_string(),
        None => String::new(),
    };

    Some(PrimaryLogCandidate {
        path: normalized,
        dir_path,
        kind,
        rotated_timestamp_hint,
    })
}

fn select_primary_log_group(paths: &[String]) -> Vec<PrimaryLogCandidate> {
    let mut groups: HashMap<String, Vec<PrimaryLogCandidate>> = HashMap::new();
    for path in paths {
        if let Some(candidate) = parse_primary_log_candidate(path) {
            groups
                .entry(candidate.dir_path.clone())
                .or_default()
                .push(candidate);
        }
    }

    let mut ranked_groups: Vec<(String, Vec<PrimaryLogCandidate>)> = groups.into_iter().collect();
    ranked_groups.sort_by(|(dir_a, group_a), (dir_b, group_b)| {
        let main_count_a = group_a.iter().filter(|entry| entry.kind == PrimaryLogKind::Main).count();
        let main_count_b = group_b.iter().filter(|entry| entry.kind == PrimaryLogKind::Main).count();
        let has_main_a = main_count_a > 0;
        let has_main_b = main_count_b > 0;
        if has_main_a != has_main_b {
            return if has_main_a { Ordering::Less } else { Ordering::Greater };
        }

        let depth_a = if dir_a.is_empty() { 0 } else { dir_a.split('/').filter(|part| !part.is_empty()).count() };
        let depth_b = if dir_b.is_empty() { 0 } else { dir_b.split('/').filter(|part| !part.is_empty()).count() };
        if depth_a != depth_b {
            return depth_a.cmp(&depth_b);
        }

        if main_count_a != main_count_b {
            return main_count_b.cmp(&main_count_a);
        }

        if group_a.len() != group_b.len() {
            return group_b.len().cmp(&group_a.len());
        }

        dir_a.cmp(dir_b)
    });

    ranked_groups.into_iter().next().map(|(_, group)| group).unwrap_or_default()
}

fn extract_first_log_timestamp(content: &str) -> Option<String> {
    let start = content.find('[')?;
    let rest = &content[start + 1..];
    let end = rest.find(']')?;
    normalize_timestamp_milliseconds(&rest[..end])
}

fn compare_optional_strings(a: Option<&String>, b: Option<&String>) -> Ordering {
    match (a, b) {
        (Some(left), Some(right)) => left.cmp(right),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    }
}

fn compare_loaded_log_segments(a: &LoadedPrimaryLogSegment, b: &LoadedPrimaryLogSegment) -> Ordering {
    let chrono_a = a.content_timestamp.as_ref().or(a.rotated_timestamp_hint.as_ref());
    let chrono_b = b.content_timestamp.as_ref().or(b.rotated_timestamp_hint.as_ref());
    let chrono_cmp = compare_optional_strings(chrono_a, chrono_b);
    if chrono_cmp != Ordering::Equal {
        return chrono_cmp;
    }

    let content_cmp = compare_optional_strings(a.content_timestamp.as_ref(), b.content_timestamp.as_ref());
    if content_cmp != Ordering::Equal {
        return content_cmp;
    }

    if a.kind != b.kind {
        return if a.kind == PrimaryLogKind::Bak {
            Ordering::Less
        } else {
            Ordering::Greater
        };
    }

    a.path.cmp(&b.path)
}

/// Join base path and file name
fn join_path(base: &str, name: &str) -> String {
    if base.is_empty() {
        name.to_string()
    } else {
        format!("{base}/{name}")
    }
}

/// Parse error image filename into a normalized key
/// e.g. "2026.03.08-13.12.30.216_CCUpdate.png" -> "2026.03.08-13.12.30.216_CCUpdate"
fn parse_error_image_key(file_name: &str) -> Option<String> {
    // Pattern: YYYY.MM.DD-HH.MM.SS.ms_NodeName.png
    let name = file_name.strip_suffix(".png")?;
    let re_like = name.find('_')?;
    let timestamp_part = &name[..re_like];
    let node_name = &name[re_like + 1..];

    // Validate timestamp format roughly: YYYY.MM.DD-HH.MM.SS.ms
    if timestamp_part.len() < 19 {
        return None;
    }

    // Pad milliseconds to 3 digits
    let dot_pos = timestamp_part.rfind('.')?;
    let ms = &timestamp_part[dot_pos + 1..];
    if ms.is_empty() || ms.len() > 3 || !ms.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let padded_ms = format!("{:0<3}", ms);
    let base_ts = &timestamp_part[..dot_pos];

    Some(format!("{base_ts}.{padded_ms}_{node_name}"))
}

/// Parse wait_freezes image filename into a normalized key
/// e.g. "2026.03.11-06.30.46.881_AwardBox_wait_freezes.jpg" -> "2026.03.11-06.30.46.881_AwardBox_wait_freezes"
fn parse_wait_freezes_key(file_name: &str) -> Option<String> {
    let name = file_name.strip_suffix(".jpg").or_else(|| file_name.strip_suffix(".JPG"))?;

    // Must end with _wait_freezes
    if !name.ends_with("_wait_freezes") {
        return None;
    }

    // Find the first underscore after the timestamp
    let first_underscore = name.find('_')?;
    let timestamp_part = &name[..first_underscore];

    // Validate timestamp and pad ms
    let dot_pos = timestamp_part.rfind('.')?;
    let ms = &timestamp_part[dot_pos + 1..];
    if ms.is_empty() || ms.len() > 3 || !ms.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let padded_ms = format!("{:0<3}", ms);
    let base_ts = &timestamp_part[..dot_pos];

    let rest = &name[first_underscore..]; // _NodeName_wait_freezes
    Some(format!("{base_ts}.{padded_ms}{rest}"))
}

/// Parse vision image filename into a normalized key
/// e.g. "2026.03.11-06.22.54.941_HomeFlagFirst_400000002.jpg" -> "2026.03.11-06.22.54.941_HomeFlagFirst_400000002"
/// Files without reco_id (e.g. "StartUp_wait_freezes.jpg") return None
fn parse_vision_image_key(file_name: &str) -> Option<String> {
    let name = file_name.strip_suffix(".jpg").or_else(|| file_name.strip_suffix(".JPG"))?;

    // Must have a reco_id (9+ digit number) at the end
    let last_underscore = name.rfind('_')?;
    let reco_str = &name[last_underscore + 1..];
    if reco_str.len() < 9 || !reco_str.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }

    // Pad milliseconds to 3 digits in timestamp part
    // Format: YYYY.MM.DD-HH.MM.SS.ms_NodeName_RecoId
    // Find the first underscore after the timestamp
    let first_underscore = name.find('_')?;
    let timestamp_part = &name[..first_underscore];

    // Validate timestamp and pad ms
    let dot_pos = timestamp_part.rfind('.')?;
    let ms = &timestamp_part[dot_pos + 1..];
    if ms.is_empty() || ms.len() > 3 || !ms.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let padded_ms = format!("{:0<3}", ms);
    let base_ts = &timestamp_part[..dot_pos];

    let rest = &name[first_underscore..]; // _NodeName_RecoId
    Some(format!("{base_ts}.{padded_ms}{rest}"))
}

/// Decode file content, trying UTF-8 first
fn decode_content(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        Err(_) => {
            // Fallback: try to decode as lossy UTF-8
            String::from_utf8_lossy(bytes).into_owned()
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![extract_zip_log])
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                let window = _app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
