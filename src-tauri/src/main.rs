// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};
use std::sync::Mutex;

use tauri::Manager;
use tauri_plugin_fs::FsExt;

use serde::Serialize;

mod archive_safety;

use archive_safety::{
    canonicalize_archive_entry_path, create_private_child_directory,
    create_private_output_file, create_private_temp_directory, inspect_zip_directory,
    validate_archive_entry_path, validate_authorized_archive_paths, ArchivePreflightBudget,
    ArchiveEntryReader, ArchiveSnapshotWorkspace, ARCHIVE_LIMITS,
};

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
    resource_token: Option<String>,
}

#[derive(Clone)]
struct ZipEntryMetadata {
    name: String,
    is_file: bool,
}

#[derive(Default)]
struct ArchiveExtractionState {
    extraction_in_progress: AtomicBool,
    assets: Mutex<ArchiveAssetStore>,
}

#[derive(Default)]
struct ArchiveAssetStore {
    root: Option<PathBuf>,
    resources: HashMap<String, PathBuf>,
    next_resource_id: u64,
}

struct PendingArchiveResource {
    token: String,
    directory: PathBuf,
    committed: bool,
}

impl Drop for PendingArchiveResource {
    fn drop(&mut self) {
        if !self.committed {
            let _ = std::fs::remove_dir_all(&self.directory);
        }
    }
}

impl ArchiveExtractionState {
    fn try_start_extraction(&self) -> Result<ArchiveExtractionGuard<'_>, String> {
        self.extraction_in_progress
            .compare_exchange(
                false,
                true,
                AtomicOrdering::Acquire,
                AtomicOrdering::Relaxed,
            )
            .map_err(|_| "Another ZIP extraction is already in progress".to_string())?;
        Ok(ArchiveExtractionGuard {
            in_progress: &self.extraction_in_progress,
        })
    }

    fn create_pending_resource(
        &self,
        app: &tauri::AppHandle,
    ) -> Result<PendingArchiveResource, String> {
        let mut assets = self
            .assets
            .lock()
            .map_err(|_| "Archive asset state is unavailable".to_string())?;
        if assets.root.is_none() {
            let root = create_private_temp_directory("assets")?;
            if let Err(error) = app.asset_protocol_scope().allow_directory(&root, true) {
                let _ = std::fs::remove_dir_all(&root);
                return Err(format!("Failed to authorize extracted image root: {error}"));
            }
            assets.root = Some(root);
        }

        assets.next_resource_id = assets
            .next_resource_id
            .checked_add(1)
            .ok_or_else(|| "Archive resource token sequence overflowed".to_string())?;
        let token = format!("resource-{:016x}", assets.next_resource_id);
        let root = assets
            .root
            .as_ref()
            .ok_or_else(|| "Archive asset root is unavailable".to_string())?;
        let directory = create_private_child_directory(root, &token)?;
        Ok(PendingArchiveResource {
            token,
            directory,
            committed: false,
        })
    }

    fn commit_resource(&self, mut resource: PendingArchiveResource) -> Result<String, String> {
        let mut assets = self
            .assets
            .lock()
            .map_err(|_| "Archive asset state is unavailable".to_string())?;
        if assets.resources.contains_key(&resource.token) {
            return Err("Archive resource token already exists".to_string());
        }
        assets
            .resources
            .insert(resource.token.clone(), resource.directory.clone());
        resource.committed = true;
        Ok(resource.token.clone())
    }

    fn release_resource(&self, token: &str) -> Result<(), String> {
        let directory = {
            let mut assets = self
                .assets
                .lock()
                .map_err(|_| "Archive asset state is unavailable".to_string())?;
            assets.resources.remove(token)
        };
        let Some(directory) = directory else {
            return Ok(());
        };

        match std::fs::remove_dir_all(&directory) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => {
                if let Ok(mut assets) = self.assets.lock() {
                    assets.resources.insert(token.to_string(), directory);
                }
                Err(format!("Failed to remove archive resource: {error}"))
            }
        }
    }
}

impl Drop for ArchiveExtractionState {
    fn drop(&mut self) {
        if let Ok(assets) = self.assets.get_mut() {
            if let Some(root) = assets.root.take() {
                let _ = std::fs::remove_dir_all(root);
            }
            assets.resources.clear();
        }
    }
}

struct ArchiveExtractionGuard<'a> {
    in_progress: &'a AtomicBool,
}

impl Drop for ArchiveExtractionGuard<'_> {
    fn drop(&mut self) {
        self.in_progress.store(false, AtomicOrdering::Release);
    }
}

fn parse_mxu_zip_volume_name(file_name: &str) -> Option<(String, usize)> {
    let lower = file_name.to_ascii_lowercase();
    let stem_end = lower.strip_suffix(".zip")?.len();
    let stem = &file_name[..stem_end];
    let lower_stem = &lower[..stem_end];
    let marker = lower_stem.rfind("-part")?;
    let base_name = &stem[..marker];
    let digits = &stem[marker + "-part".len()..];
    if base_name.is_empty() || digits.len() < 2 || !digits.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }

    let index = digits.parse::<usize>().ok()?;
    if index == 0 {
        return None;
    }
    Some((base_name.to_string(), index))
}

fn archive_path_key(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        normalized.to_lowercase()
    } else {
        normalized
    }
}

fn resolve_archive_paths(
    anchor: &Path,
    provided_paths: Option<Vec<String>>,
) -> Result<Vec<PathBuf>, String> {
    if !anchor.is_absolute() {
        return Err("Archive anchor path must be absolute".to_string());
    }

    let raw_paths = provided_paths.unwrap_or_else(|| vec![anchor.to_string_lossy().into_owned()]);
    if raw_paths.is_empty() {
        return Err("Archive path list must not be empty".to_string());
    }

    let mut seen_paths = HashSet::new();
    let mut paths = Vec::with_capacity(raw_paths.len());
    for raw_path in raw_paths {
        let candidate = PathBuf::from(raw_path);
        if !candidate.is_absolute() {
            return Err(format!(
                "Archive volume path must be absolute: {}",
                candidate.display()
            ));
        }
        if !candidate
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
        {
            return Err(format!(
                "Archive volume is not a ZIP file: {}",
                candidate.display()
            ));
        }
        if seen_paths.insert(archive_path_key(&candidate)) {
            paths.push(candidate);
        }
    }

    if paths.len() as u64 > ARCHIVE_LIMITS.max_volumes {
        return Err(format!(
            "Archive volume-count exceeds the configured limit ({} > {})",
            paths.len(),
            ARCHIVE_LIMITS.max_volumes
        ));
    }
    let anchor_key = archive_path_key(anchor);
    if !seen_paths.contains(&anchor_key) {
        return Err("Archive path list does not contain its anchor".to_string());
    }
    if paths.len() == 1 {
        return Ok(paths);
    }

    let anchor_parent = anchor
        .parent()
        .ok_or_else(|| "Archive anchor has no parent directory".to_string())?;
    let anchor_name = anchor
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Archive anchor filename is not valid UTF-8".to_string())?;
    let (anchor_base, _) = parse_mxu_zip_volume_name(anchor_name)
        .ok_or_else(|| "Multiple ZIP files must be MXU part volumes".to_string())?;
    let parent_key = archive_path_key(anchor_parent);
    let mut seen_indices = HashSet::new();
    let mut volumes = Vec::with_capacity(paths.len());

    for candidate in paths {
        let candidate_parent = candidate
            .parent()
            .ok_or_else(|| "Archive volume has no parent directory".to_string())?;
        if archive_path_key(candidate_parent) != parent_key {
            return Err("Archive volumes must share the same parent directory".to_string());
        }
        let candidate_name = candidate
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "Archive volume filename is not valid UTF-8".to_string())?;
        let (candidate_base, index) = parse_mxu_zip_volume_name(candidate_name)
            .ok_or_else(|| "Multiple ZIP files must be MXU part volumes".to_string())?;
        if !candidate_base.eq_ignore_ascii_case(&anchor_base) {
            return Err("Archive volumes must share the same MXU base name".to_string());
        }
        if !seen_indices.insert(index) {
            return Err(format!("Archive volume index is duplicated: {index}"));
        }
        volumes.push((index, candidate_name.to_string(), candidate));
    }

    volumes.sort_by(|left, right| {
        left.0.cmp(&right.0).then_with(|| {
            left.1
                .to_ascii_lowercase()
                .cmp(&right.1.to_ascii_lowercase())
        })
    });
    Ok(volumes.into_iter().map(|(_, _, path)| path).collect())
}

fn validate_zip_entry(entry: &zip::read::ZipFile<'_>) -> Result<(), String> {
    validate_archive_entry_path(entry.name())?;
    if entry.enclosed_name().is_none() {
        return Err(format!(
            "ZIP contains an unsafe entry path: {}",
            entry.name()
        ));
    }
    if entry.encrypted() {
        return Err(format!("ZIP contains an encrypted entry: {}", entry.name()));
    }
    if entry.is_symlink() {
        return Err(format!(
            "ZIP contains a symbolic link entry: {}",
            entry.name()
        ));
    }

    if let Some(mode) = entry.unix_mode() {
        let file_type = mode & 0o170000;
        if file_type != 0 && file_type != 0o040000 && file_type != 0o100000 {
            return Err(format!(
                "ZIP contains a special file entry: {}",
                entry.name()
            ));
        }
    }
    Ok(())
}

fn register_archive_entry_path(
    seen_entry_paths: &mut HashSet<String>,
    raw_name: &str,
) -> Result<String, String> {
    let name = canonicalize_archive_entry_path(raw_name)?;
    if !seen_entry_paths.insert(name.to_lowercase()) {
        return Err(format!(
            "ZIP volumes contain a duplicate or aliased entry path: {raw_name}"
        ));
    }
    Ok(name)
}

#[tauri::command]
fn extract_zip_log(
    app: tauri::AppHandle,
    resources: tauri::State<'_, ArchiveExtractionState>,
    path: String,
    paths: Option<Vec<String>>,
) -> Result<ArchiveExtractResult, String> {
    let _operation_guard = resources.try_start_extraction()?;
    extract_zip_log_inner(&app, &resources, &path, paths)
}

#[tauri::command]
fn release_archive_resource(
    resources: tauri::State<'_, ArchiveExtractionState>,
    token: String,
) -> Result<(), String> {
    resources.release_resource(&token)
}

fn extract_zip_log_inner(
    app: &tauri::AppHandle,
    resources: &ArchiveExtractionState,
    path: &str,
    paths: Option<Vec<String>>,
) -> Result<ArchiveExtractResult, String> {
    let lower = path.to_lowercase();
    if !lower.ends_with(".zip") {
        return Err(format!(
            "Tauri 桌面端目前仅支持 ZIP 格式。7z 和 RAR 请使用 Web 版本。"
        ));
    }

    let archive_paths = resolve_archive_paths(Path::new(path), paths)?;
    validate_authorized_archive_paths(&archive_paths, |candidate| {
        app.fs_scope().is_allowed(candidate)
    })?;
    let snapshot_workspace = ArchiveSnapshotWorkspace::create(path)?;
    let mut snapshots = Vec::with_capacity(archive_paths.len());
    for (index, archive_path) in archive_paths.into_iter().enumerate() {
        let snapshot = snapshot_workspace.snapshot_source(&archive_path, index)?;
        snapshots.push(snapshot);
    }

    let mut directory_infos = Vec::with_capacity(snapshots.len());
    for snapshot in &mut snapshots {
        let info = inspect_zip_directory(&mut snapshot.file).map_err(|error| {
            format!("无法预检 ZIP [{}]: {error}", snapshot.source_path.display())
        })?;
        directory_infos.push(info);
    }

    let mut archives = Vec::with_capacity(snapshots.len());
    let mut archive_entries = Vec::with_capacity(snapshots.len());
    let mut names = Vec::new();
    let mut seen_entry_paths = HashSet::new();
    let mut preflight_budget = ArchivePreflightBudget::default();
    for (snapshot, directory_info) in snapshots.into_iter().zip(directory_infos) {
        let archive_path = snapshot.source_path;
        let mut archive = zip::ZipArchive::new(snapshot.file)
            .map_err(|e| format!("无法读取 ZIP [{}]: {e}", archive_path.display()))?;
        if archive.len() as u64 != directory_info.entries {
            return Err(format!(
                "ZIP directory entry count changed after preflight [{}]",
                archive_path.display()
            ));
        }
        let mut entries = Vec::with_capacity(archive.len());
        for index in 0..archive.len() {
            let entry = archive
                .by_index(index)
                .map_err(|e| format!("读取条目失败 [{}]: {e}", archive_path.display()))?;
            validate_zip_entry(&entry)?;
            preflight_budget
                .add_directory_entry(entry.name_raw().len() as u64, ARCHIVE_LIMITS)
                .map_err(|error| error.to_string())?;

            let name = register_archive_entry_path(&mut seen_entry_paths, entry.name())?;
            names.push(name.clone());
            entries.push(ZipEntryMetadata {
                name,
                is_file: entry.is_file(),
            });
        }
        archives.push((archive_path, archive));
        archive_entries.push(entries);
    }

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
    let on_error_prefix_lower = on_error_prefix.to_lowercase();
    let vision_prefix_lower = vision_prefix.to_lowercase();

    let mut has_selected_images = false;
    for entry in archive_entries
        .iter()
        .flatten()
        .filter(|entry| entry.is_file)
    {
        let lower = entry.name.to_lowercase();
        let is_log = selected_log_lookup.contains_key(&lower);
        let is_image = (lower.starts_with(&on_error_prefix_lower) && lower.ends_with(".png"))
            || (lower.starts_with(&vision_prefix_lower) && lower.ends_with(".jpg"));
        if is_log || is_image {
            has_selected_images |= is_image;
        }
    }

    let mut pending_resource = if has_selected_images {
        Some(resources.create_pending_resource(app)?)
    } else {
        None
    };
    let mut temp_seq: u64 = 0;
    let mut entry_reader = ArchiveEntryReader;

    let mut log_segments: Vec<LoadedPrimaryLogSegment> = Vec::new();
    let mut error_images: HashMap<String, String> = HashMap::new();
    let mut vision_images: HashMap<String, String> = HashMap::new();
    let mut wait_freezes_images: HashMap<String, String> = HashMap::new();

    for (archive_path, archive) in &mut archives {
        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| format!("读取条目失败 [{}]: {e}", archive_path.display()))?;
            let name = entry.name().replace('\\', "/");
            let lower = name.to_lowercase();

            if let Some(candidate) = selected_log_lookup.get(&lower) {
                let expected_size = entry.size();
                let buf = entry_reader.read_to_end(&mut entry, expected_size)?;
                let content = decode_content(&buf);
                log_segments.push(LoadedPrimaryLogSegment {
                    path: candidate.path.clone(),
                    name: candidate
                        .path
                        .rsplit('/')
                        .next()
                        .unwrap_or(&candidate.path)
                        .to_string(),
                    kind: candidate.kind,
                    rotated_timestamp_hint: candidate.rotated_timestamp_hint.clone(),
                    content_timestamp: extract_first_log_timestamp(&content),
                    content,
                });
            } else if lower.starts_with(&on_error_prefix_lower) && lower.ends_with(".png") {
                // Extract filename
                let file_name = name.rsplit('/').next().unwrap_or("");
                if let Some(key) = parse_error_image_key(file_name) {
                    let saved_path = save_zip_entry_to_temp_file(
                        &mut entry,
                        pending_resource
                            .as_ref()
                            .map(|resource| resource.directory.as_path())
                            .ok_or_else(|| "ZIP image directory is unavailable".to_string())?,
                        &mut temp_seq,
                        "png",
                        &mut entry_reader,
                    )?;
                    error_images.insert(key, saved_path);
                }
            } else if lower.starts_with(&vision_prefix_lower) && lower.ends_with(".jpg") {
                let file_name = name.rsplit('/').next().unwrap_or("");
                if let Some(key) = parse_wait_freezes_key(file_name) {
                    let saved_path = save_zip_entry_to_temp_file(
                        &mut entry,
                        pending_resource
                            .as_ref()
                            .map(|resource| resource.directory.as_path())
                            .ok_or_else(|| "ZIP image directory is unavailable".to_string())?,
                        &mut temp_seq,
                        "jpg",
                        &mut entry_reader,
                    )?;
                    wait_freezes_images.insert(key, saved_path);
                } else if let Some(key) = parse_vision_image_key(file_name) {
                    let saved_path = save_zip_entry_to_temp_file(
                        &mut entry,
                        pending_resource
                            .as_ref()
                            .map(|resource| resource.directory.as_path())
                            .ok_or_else(|| "ZIP image directory is unavailable".to_string())?,
                        &mut temp_seq,
                        "jpg",
                        &mut entry_reader,
                    )?;
                    // 同一 key 覆盖（取最后出现的文件）
                    vision_images.insert(key, saved_path);
                }
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

    let has_extracted_images =
        !error_images.is_empty() || !vision_images.is_empty() || !wait_freezes_images.is_empty();
    let resource_token = if has_extracted_images {
        let resource = pending_resource
            .take()
            .ok_or_else(|| "ZIP image resource is unavailable".to_string())?;
        Some(resources.commit_resource(resource)?)
    } else {
        None
    };

    Ok(ArchiveExtractResult {
        content: String::new(),
        primary_log_files,
        error_images,
        vision_images,
        wait_freezes_images,
        resource_token,
    })
}

fn save_zip_entry_to_temp_file(
    entry: &mut zip::read::ZipFile<'_>,
    temp_dir: &Path,
    seq: &mut u64,
    ext: &str,
    entry_reader: &mut ArchiveEntryReader,
) -> Result<String, String> {
    *seq += 1;
    let path = temp_dir.join(format!("{:08}.{ext}", *seq));
    let mut output = create_private_output_file(&path)?;
    let expected_size = entry.size();
    entry_reader.copy_to(entry, &mut output, expected_size)?;
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
        let depth_a = if dir_a.is_empty() { 0 } else { dir_a.split('/').filter(|part| !part.is_empty()).count() };
        let depth_b = if dir_b.is_empty() { 0 } else { dir_b.split('/').filter(|part| !part.is_empty()).count() };
        if depth_a != depth_b {
            return depth_a.cmp(&depth_b);
        }

        if has_main_a != has_main_b {
            return if has_main_a { Ordering::Less } else { Ordering::Greater };
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
        .manage(ArchiveExtractionState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            extract_zip_log,
            release_archive_resource
        ])
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

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Write};

    use zip::write::SimpleFileOptions;
    use zip::{CompressionMethod, ZipArchive, ZipWriter};

    use super::{
        create_private_child_directory, create_private_temp_directory, parse_mxu_zip_volume_name,
        register_archive_entry_path, resolve_archive_paths, validate_zip_entry,
        ArchiveExtractionState, PendingArchiveResource,
    };

    fn archive_with_file(name: &str) -> ZipArchive<Cursor<Vec<u8>>> {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        writer.start_file(name, options).unwrap();
        writer.write_all(b"content").unwrap();
        ZipArchive::new(writer.finish().unwrap()).unwrap()
    }

    #[test]
    fn parses_two_and_three_digit_mxu_zip_volumes() {
        assert_eq!(
            parse_mxu_zip_volume_name("project-logs-20260717-120000-part01.zip"),
            Some(("project-logs-20260717-120000".to_string(), 1)),
        );
        assert_eq!(
            parse_mxu_zip_volume_name("project-logs-20260717-120000-part001.ZIP"),
            Some(("project-logs-20260717-120000".to_string(), 1)),
        );
    }

    #[test]
    fn rejects_invalid_mxu_zip_volume_numbers() {
        assert_eq!(
            parse_mxu_zip_volume_name("project-logs-20260717-120000-part1.zip"),
            None,
        );
        assert_eq!(
            parse_mxu_zip_volume_name("project-logs-20260717-120000-part000.zip"),
            None,
        );
    }

    #[test]
    fn resolves_explicit_volumes_without_parent_enumeration() {
        let parent = std::env::temp_dir().join("maa-log-analyzer-volume-tests");
        let part01 = parent.join("bundle-part01.zip");
        let part02 = parent.join("bundle-part02.zip");
        let paths = resolve_archive_paths(
            &part02,
            Some(vec![
                part02.to_string_lossy().into_owned(),
                part01.to_string_lossy().into_owned(),
                part01.to_string_lossy().into_owned(),
            ]),
        )
        .unwrap();

        assert_eq!(paths, vec![part01, part02]);
    }

    #[test]
    fn rejects_invalid_explicit_volume_sets() {
        let parent = std::env::temp_dir().join("maa-log-analyzer-volume-tests");
        let anchor = parent.join("bundle-part01.zip");
        let missing_anchor = parent.join("bundle-part02.zip");
        assert!(resolve_archive_paths(
            &anchor,
            Some(vec![missing_anchor.to_string_lossy().into_owned()]),
        )
        .is_err());

        let other_parent = std::env::temp_dir()
            .join("maa-log-analyzer-other-volume-tests")
            .join("bundle-part02.zip");
        assert!(resolve_archive_paths(
            &anchor,
            Some(vec![
                anchor.to_string_lossy().into_owned(),
                other_parent.to_string_lossy().into_owned(),
            ]),
        )
        .is_err());

        let duplicate_index = parent.join("bundle-part001.zip");
        assert!(resolve_archive_paths(
            &anchor,
            Some(vec![
                anchor.to_string_lossy().into_owned(),
                duplicate_index.to_string_lossy().into_owned(),
            ]),
        )
        .is_err());

        let excessive_paths = (1..=17)
            .map(|index| {
                parent
                    .join(format!("bundle-part{index:02}.zip"))
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        assert!(resolve_archive_paths(&anchor, Some(excessive_paths)).is_err());
    }

    #[test]
    fn keeps_single_archive_calls_compatible() {
        let anchor = std::env::temp_dir().join("ordinary.zip");
        assert_eq!(
            resolve_archive_paths(&anchor, None).unwrap(),
            vec![anchor]
        );
    }

    #[test]
    fn validates_real_zip_entry_paths() {
        let mut safe_archive = archive_with_file("debug/maa.log");
        let safe_entry = safe_archive.by_index(0).unwrap();
        assert!(validate_zip_entry(&safe_entry).is_ok());

        let mut unsafe_archive = archive_with_file("../maa.log");
        let unsafe_entry = unsafe_archive.by_index(0).unwrap();
        assert!(validate_zip_entry(&unsafe_entry).is_err());
    }

    #[test]
    fn rejects_duplicate_and_aliased_paths_across_volumes() {
        let mut paths = std::collections::HashSet::new();
        assert_eq!(
            register_archive_entry_path(&mut paths, "debug/maa.log").unwrap(),
            "debug/maa.log"
        );
        assert!(register_archive_entry_path(&mut paths, "DEBUG\\MAA.LOG").is_err());
    }

    #[test]
    fn rejects_real_zip_symlink_entries() {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        writer
            .add_symlink(
                "debug/maa-link.log",
                "maa.log",
                SimpleFileOptions::default(),
            )
            .unwrap();
        let mut archive = ZipArchive::new(writer.finish().unwrap()).unwrap();
        let entry = archive.by_index(0).unwrap();
        assert!(validate_zip_entry(&entry).is_err());
    }

    #[test]
    fn rejects_concurrent_extractions_and_unlocks_after_drop() {
        let resources = ArchiveExtractionState::default();
        let first = resources.try_start_extraction().unwrap();
        assert!(resources.try_start_extraction().is_err());

        drop(first);
        assert!(resources.try_start_extraction().is_ok());
    }

    #[test]
    fn releases_committed_resources_and_cleans_the_root_on_drop() {
        let root = create_private_temp_directory("resource-state-test").unwrap();
        let first = create_private_child_directory(&root, "resource-0001").unwrap();
        let second = create_private_child_directory(&root, "resource-0002").unwrap();

        {
            let resources = ArchiveExtractionState::default();
            {
                let mut assets = resources.assets.lock().unwrap();
                assets.root = Some(root.clone());
                assets
                    .resources
                    .insert("resource-0001".to_string(), first.clone());
                assets
                    .resources
                    .insert("resource-0002".to_string(), second.clone());
            }

            resources.release_resource("missing").unwrap();
            resources.release_resource("resource-0001").unwrap();
            assert!(!first.exists());
            assert!(second.exists());
        }

        assert!(!root.exists());
    }

    #[test]
    fn removes_uncommitted_resources_on_failure() {
        let root = create_private_temp_directory("pending-resource-test").unwrap();
        let directory = create_private_child_directory(&root, "resource-0001").unwrap();
        {
            let _pending = PendingArchiveResource {
                token: "resource-0001".to_string(),
                directory: directory.clone(),
                committed: false,
            };
        }
        assert!(!directory.exists());
        std::fs::remove_dir_all(root).unwrap();
    }
}
