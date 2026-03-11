// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::io::Read;

#[cfg(debug_assertions)]
use tauri::Manager;

use serde::Serialize;

#[derive(Serialize)]
struct ZipExtractResult {
    content: String,
    error_images: HashMap<String, Vec<u8>>,
    vision_images: HashMap<String, Vec<u8>>,
    wait_freezes_images: HashMap<String, Vec<u8>>,
}

#[tauri::command]
fn extract_zip_log(path: String) -> Result<ZipExtractResult, String> {
    let file = std::fs::File::open(&path).map_err(|e| format!("无法打开文件: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("无法读取 ZIP: {e}"))?;

    // Collect all file names
    let names: Vec<String> = (0..archive.len())
        .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
        .collect();

    // Find base directory containing maa.log
    let base = find_base_directory(&names).ok_or("ZIP 中未找到 maa.log 文件")?;

    let bak_log_path = join_path(&base, "maa.bak.log");
    let main_log_path = join_path(&base, "maa.log");
    let on_error_prefix = join_path(&base, "on_error/");
    let vision_prefix = join_path(&base, "vision/");

    let mut content = String::new();
    let mut error_images: HashMap<String, Vec<u8>> = HashMap::new();
    let mut vision_images: HashMap<String, Vec<u8>> = HashMap::new();
    let mut wait_freezes_images: HashMap<String, Vec<u8>> = HashMap::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("读取条目失败: {e}"))?;
        let name = entry.name().replace('\\', "/");
        let lower = name.to_lowercase();

        if lower == bak_log_path.to_lowercase() {
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf).map_err(|e| format!("读取失败: {e}"))?;
            content.push_str(&decode_content(&buf));
        } else if lower == main_log_path.to_lowercase() {
            if !content.is_empty() && !content.ends_with('\n') {
                content.push('\n');
            }
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf).map_err(|e| format!("读取失败: {e}"))?;
            content.push_str(&decode_content(&buf));
        } else if lower.starts_with(&on_error_prefix.to_lowercase()) && lower.ends_with(".png") {
            // Extract filename
            let file_name = name.rsplit('/').next().unwrap_or("");
            if let Some(key) = parse_error_image_key(file_name) {
                let mut buf = Vec::new();
                entry.read_to_end(&mut buf).map_err(|e| format!("读取截图失败: {e}"))?;
                error_images.insert(key, buf);
            }
        } else if lower.starts_with(&vision_prefix.to_lowercase()) && lower.ends_with(".jpg") {
            let file_name = name.rsplit('/').next().unwrap_or("");
            if let Some(key) = parse_wait_freezes_key(file_name) {
                let mut buf = Vec::new();
                entry.read_to_end(&mut buf).map_err(|e| format!("读取截图失败: {e}"))?;
                wait_freezes_images.insert(key, buf);
            } else if let Some(key) = parse_vision_image_key(file_name) {
                let mut buf = Vec::new();
                entry.read_to_end(&mut buf).map_err(|e| format!("读取截图失败: {e}"))?;
                // 同一 key 覆盖（取最后出现的文件）
                vision_images.insert(key, buf);
            }
        }
    }

    if content.is_empty() {
        return Err("ZIP 中未找到有效的日志内容".to_string());
    }

    Ok(ZipExtractResult {
        content,
        error_images,
        vision_images,
        wait_freezes_images,
    })
}

/// Find the base directory containing maa.log
fn find_base_directory(paths: &[String]) -> Option<String> {
    for p in paths {
        let normalized = p.replace('\\', "/");
        let lower = normalized.to_lowercase();
        if lower.ends_with("/maa.log") || lower == "maa.log" {
            let last_slash = normalized.rfind('/');
            return Some(match last_slash {
                Some(idx) => normalized[..idx].to_string(),
                None => String::new(),
            });
        }
    }
    None
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
