use std::fmt;
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(unix)]
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
#[cfg(windows)]
use std::os::windows::fs::{MetadataExt, OpenOptionsExt};

const MAX_TEMP_STEM_CHARS: usize = 48;
const EOCD_MIN_SIZE: usize = 22;
const EOCD_MAX_COMMENT_SIZE: usize = u16::MAX as usize;
const ZIP64_LOCATOR_SIZE: u64 = 20;
const ZIP64_EOCD_MIN_SIZE: u64 = 56;
const CENTRAL_DIRECTORY_HEADER_MIN_SIZE: u64 = 46;
const ZIP64_RECORD_SEARCH_CHUNK_SIZE: u64 = 64 * 1024;
const EOCD_SIGNATURE: u32 = 0x0605_4b50;
const ZIP64_EOCD_SIGNATURE: u32 = 0x0606_4b50;
const ZIP64_LOCATOR_SIGNATURE: u32 = 0x0706_4b50;
const CENTRAL_DIRECTORY_HEADER_SIGNATURE: u32 = 0x0201_4b50;
static NEXT_TEMP_DIR_ID: AtomicU64 = AtomicU64::new(0);

#[cfg(any(windows, test))]
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
#[cfg(windows)]
const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
#[cfg(windows)]
const FILE_FLAG_SEQUENTIAL_SCAN: u32 = 0x0800_0000;
#[cfg(windows)]
const FILE_SHARE_READ: u32 = 0x0000_0001;
#[cfg(windows)]
const FILE_SHARE_WRITE: u32 = 0x0000_0002;
#[cfg(windows)]
const FILE_SHARE_DELETE: u32 = 0x0000_0004;

#[derive(Clone, Copy, Debug)]
pub(crate) struct ArchiveLimits {
    pub max_volumes: u64,
    pub max_compressed_bytes: u64,
    pub max_path_bytes: u64,
    pub max_total_path_bytes: u64,
    pub max_file_bytes: u64,
    pub max_image_bytes: u64,
    pub max_extracted_bytes: u64,
    pub max_compression_ratio: u64,
    pub compression_ratio_min_bytes: u64,
}

// Keep these compile-time values aligned with `config/archive-limits.json`.
// A unit test guards the Rust and Web extraction paths against configuration drift.
pub(crate) const ARCHIVE_LIMITS: ArchiveLimits = ArchiveLimits {
    max_volumes: 16,
    max_compressed_bytes: 256 * 1024 * 1024,
    max_path_bytes: 4 * 1024,
    max_total_path_bytes: 8 * 1024 * 1024,
    max_file_bytes: 256 * 1024 * 1024,
    max_image_bytes: 32 * 1024 * 1024,
    max_extracted_bytes: 512 * 1024 * 1024,
    max_compression_ratio: 500,
    compression_ratio_min_bytes: 1024 * 1024,
};

// Used only after the user explicitly chooses “坚持解析”. Structural limits
// remain unchanged; byte budgets and compression-ratio checks are relaxed.
pub(crate) const INSIST_ARCHIVE_LIMITS: ArchiveLimits = ArchiveLimits {
    max_volumes: ARCHIVE_LIMITS.max_volumes,
    max_compressed_bytes: u64::MAX,
    max_path_bytes: ARCHIVE_LIMITS.max_path_bytes,
    max_total_path_bytes: ARCHIVE_LIMITS.max_total_path_bytes,
    max_file_bytes: u64::MAX,
    max_image_bytes: u64::MAX,
    max_extracted_bytes: u64::MAX,
    max_compression_ratio: u64::MAX,
    compression_ratio_min_bytes: u64::MAX,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ArchiveLimitKind {
    VolumeCount,
    CompressedSize,
    PathSize,
    TotalPathSize,
    FileSize,
    ImageSize,
    ExtractedSize,
    CompressionRatio,
}

impl fmt::Display for ArchiveLimitKind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let label = match self {
            Self::VolumeCount => "volume-count",
            Self::CompressedSize => "compressed-size",
            Self::PathSize => "path-size",
            Self::TotalPathSize => "total-path-size",
            Self::FileSize => "file-size",
            Self::ImageSize => "image-size",
            Self::ExtractedSize => "extracted-size",
            Self::CompressionRatio => "compression-ratio",
        };
        formatter.write_str(label)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct ArchiveLimitError {
    pub kind: ArchiveLimitKind,
    pub actual: u64,
    pub limit: u64,
}

impl ArchiveLimitError {
    fn new(kind: ArchiveLimitKind, actual: u64, limit: u64) -> Self {
        Self {
            kind,
            actual,
            limit,
        }
    }
}

impl fmt::Display for ArchiveLimitError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "Archive {} exceeds the configured limit ({} > {})",
            self.kind, self.actual, self.limit
        )
    }
}

impl std::error::Error for ArchiveLimitError {}

pub(crate) fn validate_archive_inputs(
    compressed_sizes: &[u64],
    limits: ArchiveLimits,
) -> Result<(), ArchiveLimitError> {
    let volume_count = compressed_sizes.len() as u64;
    if volume_count > limits.max_volumes {
        return Err(ArchiveLimitError::new(
            ArchiveLimitKind::VolumeCount,
            volume_count,
            limits.max_volumes,
        ));
    }

    let mut total = 0_u64;
    for size in compressed_sizes {
        total = total.checked_add(*size).ok_or_else(|| {
            ArchiveLimitError::new(
                ArchiveLimitKind::CompressedSize,
                u64::MAX,
                limits.max_compressed_bytes,
            )
        })?;
        if total > limits.max_compressed_bytes {
            return Err(ArchiveLimitError::new(
                ArchiveLimitKind::CompressedSize,
                total,
                limits.max_compressed_bytes,
            ));
        }
    }
    Ok(())
}

pub(crate) fn validate_authorized_archive_paths<F>(
    paths: &[PathBuf],
    mut is_allowed: F,
) -> Result<(), String>
where
    F: FnMut(&Path) -> bool,
{
    for path in paths {
        if !is_allowed(path) {
            return Err(format!(
                "Archive path is not authorized by the file dialog: {}",
                path.display()
            ));
        }
    }
    Ok(())
}

#[derive(Default)]
pub(crate) struct ArchivePreflightBudget {
    total_path_bytes: u64,
    selected_extracted_bytes: u64,
}

impl ArchivePreflightBudget {
    pub(crate) fn add_directory_entry(
        &mut self,
        path_bytes: u64,
        limits: ArchiveLimits,
    ) -> Result<(), ArchiveLimitError> {
        if path_bytes > limits.max_path_bytes {
            return Err(ArchiveLimitError::new(
                ArchiveLimitKind::PathSize,
                path_bytes,
                limits.max_path_bytes,
            ));
        }

        let total_path_bytes = self
            .total_path_bytes
            .checked_add(path_bytes)
            .ok_or_else(|| {
                ArchiveLimitError::new(
                    ArchiveLimitKind::TotalPathSize,
                    u64::MAX,
                    limits.max_total_path_bytes,
                )
            })?;
        if total_path_bytes > limits.max_total_path_bytes {
            return Err(ArchiveLimitError::new(
                ArchiveLimitKind::TotalPathSize,
                total_path_bytes,
                limits.max_total_path_bytes,
            ));
        }

        self.total_path_bytes = total_path_bytes;
        Ok(())
    }

    pub(crate) fn add_selected_entry(
        &mut self,
        compressed_size: u64,
        extracted_size: u64,
        is_image: bool,
        limits: ArchiveLimits,
    ) -> Result<(), ArchiveLimitError> {
        if extracted_size > limits.max_file_bytes {
            return Err(ArchiveLimitError::new(
                ArchiveLimitKind::FileSize,
                extracted_size,
                limits.max_file_bytes,
            ));
        }
        if is_image && extracted_size > limits.max_image_bytes {
            return Err(ArchiveLimitError::new(
                ArchiveLimitKind::ImageSize,
                extracted_size,
                limits.max_image_bytes,
            ));
        }

        let selected_extracted_bytes = self
            .selected_extracted_bytes
            .checked_add(extracted_size)
            .ok_or_else(|| {
                ArchiveLimitError::new(
                    ArchiveLimitKind::ExtractedSize,
                    u64::MAX,
                    limits.max_extracted_bytes,
                )
            })?;
        if selected_extracted_bytes > limits.max_extracted_bytes {
            return Err(ArchiveLimitError::new(
                ArchiveLimitKind::ExtractedSize,
                selected_extracted_bytes,
                limits.max_extracted_bytes,
            ));
        }

        if extracted_size >= limits.compression_ratio_min_bytes && extracted_size > 0 {
            let ratio_exceeded = compressed_size == 0
                || extracted_size > compressed_size.saturating_mul(limits.max_compression_ratio);
            if ratio_exceeded {
                let actual_ratio = if compressed_size == 0 {
                    u64::MAX
                } else {
                    extracted_size / compressed_size
                        + u64::from(extracted_size % compressed_size != 0)
                };
                return Err(ArchiveLimitError::new(
                    ArchiveLimitKind::CompressionRatio,
                    actual_ratio,
                    limits.max_compression_ratio,
                ));
            }
        }

        self.selected_extracted_bytes = selected_extracted_bytes;
        Ok(())
    }
}

#[derive(Default)]
pub(crate) struct ArchiveRuntimeBudget {
    extracted_bytes: u64,
}

impl ArchiveRuntimeBudget {
    pub(crate) fn read_to_end<R: Read>(
        &mut self,
        reader: &mut R,
        compressed_size: u64,
        expected_size: u64,
        per_entry_limit: u64,
        per_entry_kind: ArchiveLimitKind,
        limits: ArchiveLimits,
    ) -> Result<Vec<u8>, String> {
        let mut bytes = Vec::new();
        self.copy_to(
            reader,
            &mut bytes,
            compressed_size,
            expected_size,
            per_entry_limit,
            per_entry_kind,
            limits,
        )?;
        Ok(bytes)
    }

    pub(crate) fn copy_to<R: Read, W: Write>(
        &mut self,
        reader: &mut R,
        writer: &mut W,
        compressed_size: u64,
        expected_size: u64,
        per_entry_limit: u64,
        per_entry_kind: ArchiveLimitKind,
        limits: ArchiveLimits,
    ) -> Result<u64, String> {
        let mut entry_bytes = 0_u64;
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let read = reader
                .read(&mut buffer)
                .map_err(|error| format!("读取 ZIP 条目失败: {error}"))?;
            if read == 0 {
                if entry_bytes != expected_size {
                    return Err(format!(
                        "ZIP entry output size differs from its directory metadata ({entry_bytes} != {expected_size})"
                    ));
                }
                return Ok(entry_bytes);
            }

            let next_entry_bytes = entry_bytes
                .checked_add(read as u64)
                .ok_or_else(|| "ZIP entry output size overflows".to_string())?;
            if next_entry_bytes > expected_size {
                return Err(format!(
                    "ZIP entry output exceeds its directory metadata ({next_entry_bytes} > {expected_size})"
                ));
            }
            if next_entry_bytes > per_entry_limit {
                return Err(ArchiveLimitError::new(
                    per_entry_kind,
                    next_entry_bytes,
                    per_entry_limit,
                )
                .to_string());
            }

            let next_total_bytes = self
                .extracted_bytes
                .checked_add(read as u64)
                .ok_or_else(|| "ZIP extracted-size total overflows".to_string())?;
            if next_total_bytes > limits.max_extracted_bytes {
                return Err(ArchiveLimitError::new(
                    ArchiveLimitKind::ExtractedSize,
                    next_total_bytes,
                    limits.max_extracted_bytes,
                )
                .to_string());
            }

            if next_entry_bytes >= limits.compression_ratio_min_bytes && next_entry_bytes > 0 {
                let ratio_exceeded = compressed_size == 0
                    || next_entry_bytes
                        > compressed_size.saturating_mul(limits.max_compression_ratio);
                if ratio_exceeded {
                    let actual_ratio = if compressed_size == 0 {
                        u64::MAX
                    } else {
                        next_entry_bytes / compressed_size
                            + u64::from(next_entry_bytes % compressed_size != 0)
                    };
                    return Err(ArchiveLimitError::new(
                        ArchiveLimitKind::CompressionRatio,
                        actual_ratio,
                        limits.max_compression_ratio,
                    )
                    .to_string());
                }
            }

            writer
                .write_all(&buffer[..read])
                .map_err(|error| format!("写入 ZIP 条目失败: {error}"))?;
            entry_bytes = next_entry_bytes;
            self.extracted_bytes = next_total_bytes;
        }
    }
}

pub(crate) fn canonicalize_archive_entry_path(name: &str) -> Result<String, String> {
    if name.is_empty() || name.chars().any(|character| character.is_control()) {
        return Err("ZIP contains an empty or control-character entry path".to_string());
    }

    let normalized = name.replace('\\', "/");
    if normalized.starts_with('/') {
        return Err(format!("ZIP contains an absolute entry path: {name}"));
    }
    let first_segment = normalized.split('/').next().unwrap_or_default();
    if first_segment.len() >= 2
        && first_segment.as_bytes()[0].is_ascii_alphabetic()
        && first_segment.as_bytes()[1] == b':'
    {
        return Err(format!("ZIP contains an absolute entry path: {name}"));
    }

    let canonical = normalized.strip_suffix('/').unwrap_or(&normalized);
    if canonical.is_empty()
        || canonical
            .split('/')
            .any(|component| component.is_empty() || component == "." || component == "..")
        || Path::new(&normalized).components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(format!("ZIP contains an unsafe entry path: {name}"));
    }
    Ok(canonical.to_string())
}

pub(crate) fn validate_archive_entry_path(name: &str) -> Result<(), String> {
    canonicalize_archive_entry_path(name).map(|_| ())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct ZipDirectoryInfo {
    pub entries: u64,
    pub central_directory_size: u64,
    pub central_directory_offset: u64,
}

pub(crate) fn inspect_zip_directory<R: Read + Seek>(
    reader: &mut R,
) -> Result<ZipDirectoryInfo, String> {
    let file_size = reader
        .seek(SeekFrom::End(0))
        .map_err(|error| format!("无法读取 ZIP 快照长度: {error}"))?;
    if file_size < EOCD_MIN_SIZE as u64 {
        return Err("ZIP is too small to contain an end-of-central-directory record".to_string());
    }

    let tail_size = file_size.min((EOCD_MIN_SIZE + EOCD_MAX_COMMENT_SIZE) as u64) as usize;
    let tail_offset = file_size - tail_size as u64;
    let tail = read_exact_at(reader, tail_offset, tail_size, file_size)?;
    let eocd_tail_offset = find_eocd(&tail)
        .ok_or_else(|| "ZIP end-of-central-directory record was not found".to_string())?;
    let eocd_position = tail_offset + eocd_tail_offset as u64;
    let eocd = &tail[eocd_tail_offset..eocd_tail_offset + EOCD_MIN_SIZE];

    let disk_number = read_u16(eocd, 4)?;
    let central_directory_disk = read_u16(eocd, 6)?;
    let entries_on_disk = read_u16(eocd, 8)?;
    let total_entries = read_u16(eocd, 10)?;
    let central_directory_size = read_u32(eocd, 12)?;
    let central_directory_offset = read_u32(eocd, 16)?;
    let uses_zip64 = disk_number == u16::MAX
        || central_directory_disk == u16::MAX
        || entries_on_disk == u16::MAX
        || total_entries == u16::MAX
        || central_directory_size == u32::MAX
        || central_directory_offset == u32::MAX;

    let info = if uses_zip64 {
        inspect_zip64_directory(reader, file_size, eocd_position)?
    } else {
        if disk_number != 0 || central_directory_disk != 0 || entries_on_disk != total_entries {
            return Err("Multi-disk ZIP archives are not supported".to_string());
        }
        let entries = total_entries as u64;

        let relative_end = (central_directory_offset as u64)
            .checked_add(central_directory_size as u64)
            .ok_or_else(|| "ZIP central-directory range overflows".to_string())?;
        let archive_offset = eocd_position
            .checked_sub(relative_end)
            .ok_or_else(|| "ZIP central-directory range exceeds the snapshot".to_string())?;
        let actual_offset = archive_offset
            .checked_add(central_directory_offset as u64)
            .ok_or_else(|| "ZIP central-directory offset overflows".to_string())?;
        let actual_end = actual_offset
            .checked_add(central_directory_size as u64)
            .ok_or_else(|| "ZIP central-directory range overflows".to_string())?;
        if actual_end != eocd_position {
            return Err("ZIP central directory does not end at the EOCD record".to_string());
        }

        ZipDirectoryInfo {
            entries,
            central_directory_size: central_directory_size as u64,
            central_directory_offset: actual_offset,
        }
    };

    validate_central_directory(reader, file_size, info)?;
    reader
        .seek(SeekFrom::Start(0))
        .map_err(|error| format!("无法重置 ZIP 快照位置: {error}"))?;
    Ok(info)
}

fn inspect_zip64_directory<R: Read + Seek>(
    reader: &mut R,
    file_size: u64,
    eocd_position: u64,
) -> Result<ZipDirectoryInfo, String> {
    let locator_position = eocd_position
        .checked_sub(ZIP64_LOCATOR_SIZE)
        .ok_or_else(|| "ZIP64 locator is missing".to_string())?;
    let locator = read_exact_at(
        reader,
        locator_position,
        ZIP64_LOCATOR_SIZE as usize,
        file_size,
    )?;
    if read_u32(&locator, 0)? != ZIP64_LOCATOR_SIGNATURE {
        return Err("ZIP64 locator is missing".to_string());
    }
    let locator_disk = read_u32(&locator, 4)?;
    let relative_zip64_record_position = read_u64(&locator, 8)?;
    let total_disks = read_u32(&locator, 16)?;
    if locator_disk != 0 || total_disks != 1 {
        return Err("Multi-disk ZIP64 archives are not supported".to_string());
    }

    let zip64_record_position = find_zip64_record_position(reader, file_size, locator_position)?;
    let archive_offset = zip64_record_position
        .checked_sub(relative_zip64_record_position)
        .ok_or_else(|| "ZIP64 locator record offset exceeds its actual position".to_string())?;
    let record = read_exact_at(
        reader,
        zip64_record_position,
        ZIP64_EOCD_MIN_SIZE as usize,
        file_size,
    )?;
    if read_u32(&record, 0)? != ZIP64_EOCD_SIGNATURE {
        return Err("ZIP64 end-of-central-directory record is missing".to_string());
    }
    let record_payload_size = read_u64(&record, 4)?;
    if record_payload_size < ZIP64_EOCD_MIN_SIZE - 12 {
        return Err("ZIP64 end-of-central-directory record is truncated".to_string());
    }
    let record_end = zip64_record_position
        .checked_add(12)
        .and_then(|value| value.checked_add(record_payload_size))
        .ok_or_else(|| "ZIP64 end-of-central-directory range overflows".to_string())?;
    if record_end != locator_position {
        return Err("ZIP64 record does not end at its locator".to_string());
    }

    let disk_number = read_u32(&record, 16)?;
    let central_directory_disk = read_u32(&record, 20)?;
    let entries_on_disk = read_u64(&record, 24)?;
    let entries = read_u64(&record, 32)?;
    if disk_number != 0 || central_directory_disk != 0 || entries_on_disk != entries {
        return Err("Multi-disk ZIP64 archives are not supported".to_string());
    }

    let central_directory_size = read_u64(&record, 40)?;
    let relative_central_directory_offset = read_u64(&record, 48)?;
    let central_directory_offset = archive_offset
        .checked_add(relative_central_directory_offset)
        .ok_or_else(|| "ZIP64 central-directory offset overflows".to_string())?;
    let central_directory_end = central_directory_offset
        .checked_add(central_directory_size)
        .ok_or_else(|| "ZIP64 central-directory range overflows".to_string())?;
    if central_directory_end != zip64_record_position {
        return Err("ZIP64 central directory does not end at the ZIP64 EOCD record".to_string());
    }

    Ok(ZipDirectoryInfo {
        entries,
        central_directory_size,
        central_directory_offset,
    })
}

fn find_zip64_record_position<R: Read + Seek>(
    reader: &mut R,
    file_size: u64,
    locator_position: u64,
) -> Result<u64, String> {
    let mut search_end = locator_position;
    while search_end >= 4 {
        let search_start = search_end.saturating_sub(ZIP64_RECORD_SEARCH_CHUNK_SIZE);
        let chunk = read_exact_at(
            reader,
            search_start,
            (search_end - search_start) as usize,
            file_size,
        )?;
        for offset in (0..=chunk.len() - 4).rev() {
            if u32::from_le_bytes(chunk[offset..offset + 4].try_into().unwrap())
                != ZIP64_EOCD_SIGNATURE
            {
                continue;
            }
            let candidate = search_start + offset as u64;
            let header = read_exact_at(reader, candidate, 12, file_size)?;
            let payload_size = read_u64(&header, 4)?;
            if payload_size >= ZIP64_EOCD_MIN_SIZE - 12
                && candidate
                    .checked_add(12)
                    .and_then(|value| value.checked_add(payload_size))
                    == Some(locator_position)
            {
                return Ok(candidate);
            }
        }

        if search_start == 0 {
            break;
        }
        search_end = search_start + 3;
    }
    Err("ZIP64 end-of-central-directory record is missing".to_string())
}

fn validate_central_directory<R: Read + Seek>(
    reader: &mut R,
    file_size: u64,
    info: ZipDirectoryInfo,
) -> Result<(), String> {
    let central_directory_end = info
        .central_directory_offset
        .checked_add(info.central_directory_size)
        .ok_or_else(|| "ZIP central-directory range overflows".to_string())?;
    if central_directory_end > file_size {
        return Err("ZIP central-directory range exceeds the snapshot".to_string());
    }

    let minimum_size = info
        .entries
        .checked_mul(CENTRAL_DIRECTORY_HEADER_MIN_SIZE)
        .ok_or_else(|| "ZIP central-directory minimum size overflows".to_string())?;
    if minimum_size > info.central_directory_size {
        return Err("ZIP central directory is too small for its declared entry count".to_string());
    }

    if info.entries > 0 {
        let signature = read_exact_at(reader, info.central_directory_offset, 4, file_size)?;
        if read_u32(&signature, 0)? != CENTRAL_DIRECTORY_HEADER_SIGNATURE {
            return Err("ZIP central directory does not start with a file header".to_string());
        }
    } else if info.central_directory_size != 0 {
        return Err("Empty ZIP declares a non-empty central directory".to_string());
    }
    Ok(())
}

fn find_eocd(tail: &[u8]) -> Option<usize> {
    if tail.len() < EOCD_MIN_SIZE {
        return None;
    }

    for offset in (0..=tail.len() - EOCD_MIN_SIZE).rev() {
        if u32::from_le_bytes(tail[offset..offset + 4].try_into().ok()?) != EOCD_SIGNATURE {
            continue;
        }
        let comment_size = u16::from_le_bytes(tail[offset + 20..offset + 22].try_into().ok()?);
        if offset + EOCD_MIN_SIZE + comment_size as usize == tail.len() {
            return Some(offset);
        }
    }
    None
}

fn read_exact_at<R: Read + Seek>(
    reader: &mut R,
    offset: u64,
    length: usize,
    file_size: u64,
) -> Result<Vec<u8>, String> {
    let end = offset
        .checked_add(length as u64)
        .ok_or_else(|| "ZIP metadata range overflows".to_string())?;
    if end > file_size {
        return Err("ZIP metadata range exceeds the snapshot".to_string());
    }
    reader
        .seek(SeekFrom::Start(offset))
        .map_err(|error| format!("无法定位 ZIP 快照: {error}"))?;
    let mut bytes = vec![0_u8; length];
    reader
        .read_exact(&mut bytes)
        .map_err(|error| format!("无法读取 ZIP 快照元数据: {error}"))?;
    Ok(bytes)
}

fn read_u16(bytes: &[u8], offset: usize) -> Result<u16, String> {
    let value = bytes
        .get(offset..offset + 2)
        .ok_or_else(|| "ZIP metadata is truncated".to_string())?;
    Ok(u16::from_le_bytes(value.try_into().unwrap()))
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let value = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| "ZIP metadata is truncated".to_string())?;
    Ok(u32::from_le_bytes(value.try_into().unwrap()))
}

fn read_u64(bytes: &[u8], offset: usize) -> Result<u64, String> {
    let value = bytes
        .get(offset..offset + 8)
        .ok_or_else(|| "ZIP metadata is truncated".to_string())?;
    Ok(u64::from_le_bytes(value.try_into().unwrap()))
}

pub(crate) struct ArchiveSnapshot {
    pub source_path: PathBuf,
    pub file: File,
    pub size: u64,
}

pub(crate) struct ArchiveSnapshotWorkspace {
    path: PathBuf,
}

impl ArchiveSnapshotWorkspace {
    pub(crate) fn create(label: &str) -> Result<Self, String> {
        Ok(Self {
            path: create_private_temp_directory(&format!("snapshot-{label}"))?,
        })
    }

    pub(crate) fn snapshot_source(
        &self,
        source_path: &Path,
        index: usize,
        max_bytes: u64,
    ) -> Result<ArchiveSnapshot, String> {
        let mut source = open_source_no_follow(source_path)?;
        let before = validate_open_source(&source, source_path)?;
        if before.len() > max_bytes {
            return Err(ArchiveLimitError::new(
                ArchiveLimitKind::CompressedSize,
                before.len(),
                max_bytes,
            )
            .to_string());
        }

        let snapshot_path = self.path.join(format!("volume-{index:04}.zip"));
        let mut output = create_private_output_file(&snapshot_path)?;
        let copied = copy_snapshot_bytes(&mut source, &mut output, before.len(), max_bytes)?;
        output
            .flush()
            .map_err(|error| format!("无法刷新 ZIP 快照: {error}"))?;
        output
            .sync_all()
            .map_err(|error| format!("无法同步 ZIP 快照: {error}"))?;
        drop(output);

        let after = source
            .metadata()
            .map_err(|error| format!("无法复核 ZIP 源文件 [{}]: {error}", source_path.display()))?;
        if after.len() != before.len()
            || before.modified().ok() != after.modified().ok()
            || copied != before.len()
        {
            return Err(format!(
                "ZIP source changed while it was being snapshotted: {}",
                source_path.display()
            ));
        }
        drop(source);

        let snapshot = open_snapshot_readonly(&snapshot_path)?;
        let snapshot_metadata = snapshot
            .metadata()
            .map_err(|error| format!("无法复核 ZIP 快照: {error}"))?;
        if !snapshot_metadata.is_file() || snapshot_metadata.len() != copied {
            return Err("ZIP snapshot metadata changed unexpectedly".to_string());
        }
        reject_windows_reparse(&snapshot_metadata, &snapshot_path)?;

        #[cfg(unix)]
        std::fs::remove_file(&snapshot_path)
            .map_err(|error| format!("无法隐藏 ZIP 快照路径: {error}"))?;

        Ok(ArchiveSnapshot {
            source_path: source_path.to_path_buf(),
            file: snapshot,
            size: copied,
        })
    }

    #[cfg(all(test, unix))]
    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for ArchiveSnapshotWorkspace {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

pub(crate) fn create_private_temp_directory(label: &str) -> Result<PathBuf, String> {
    let stem = sanitized_temp_stem(label);
    let base_dir = std::env::temp_dir();

    for _ in 0..32 {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| format!("获取系统时间失败: {error}"))?
            .as_nanos();
        let sequence = NEXT_TEMP_DIR_ID.fetch_add(1, Ordering::Relaxed);
        let path = base_dir.join(format!(
            "maa-log-analyzer-{stem}-{}-{timestamp}-{sequence}",
            std::process::id()
        ));

        #[cfg(unix)]
        let create_result = {
            let mut builder = std::fs::DirBuilder::new();
            builder.mode(0o700);
            builder.create(&path)
        };
        #[cfg(not(unix))]
        let create_result = std::fs::create_dir(&path);

        match create_result {
            Ok(()) => {
                let metadata = std::fs::symlink_metadata(&path)
                    .map_err(|error| format!("无法复核临时目录: {error}"))?;
                if !metadata.is_dir() {
                    let _ = std::fs::remove_dir_all(&path);
                    return Err("Private temporary path is not a directory".to_string());
                }
                reject_windows_reparse(&metadata, &path)?;
                return Ok(path);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("创建临时目录失败: {error}")),
        }
    }

    Err("创建唯一临时目录失败".to_string())
}

pub(crate) fn create_private_child_directory(parent: &Path, name: &str) -> Result<PathBuf, String> {
    if name.is_empty()
        || !name.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
    {
        return Err("Private child directory name is invalid".to_string());
    }

    let parent_metadata = std::fs::symlink_metadata(parent)
        .map_err(|error| format!("无法复核临时资源根目录: {error}"))?;
    if !parent_metadata.is_dir() || parent_metadata.file_type().is_symlink() {
        return Err("Private resource root is not a directory".to_string());
    }
    reject_windows_reparse(&parent_metadata, parent)?;

    let path = parent.join(name);
    #[cfg(unix)]
    let create_result = {
        let mut builder = std::fs::DirBuilder::new();
        builder.mode(0o700);
        builder.create(&path)
    };
    #[cfg(not(unix))]
    let create_result = std::fs::create_dir(&path);
    create_result.map_err(|error| format!("创建私有临时资源目录失败: {error}"))?;

    let metadata = std::fs::symlink_metadata(&path)
        .map_err(|error| format!("无法复核临时资源目录: {error}"))?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        let _ = std::fs::remove_dir_all(&path);
        return Err("Private resource path is not a directory".to_string());
    }
    reject_windows_reparse(&metadata, &path)?;
    Ok(path)
}

pub(crate) fn create_private_output_file(path: &Path) -> Result<File, String> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600).custom_flags(libc::O_CLOEXEC);
    #[cfg(windows)]
    options.share_mode(0);
    options
        .open(path)
        .map_err(|error| format!("创建私有临时文件失败 [{}]: {error}", path.display()))
}

fn open_source_no_follow(path: &Path) -> Result<File, String> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    options.custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC);
    #[cfg(windows)]
    options
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_SEQUENTIAL_SCAN);
    options
        .open(path)
        .map_err(|error| format!("无法安全打开 ZIP [{}]: {error}", path.display()))
}

fn open_snapshot_readonly(path: &Path) -> Result<File, String> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    options.custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC);
    #[cfg(windows)]
    options
        .share_mode(0)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_SEQUENTIAL_SCAN);
    options
        .open(path)
        .map_err(|error| format!("无法打开 ZIP 快照: {error}"))
}

fn validate_open_source(file: &File, path: &Path) -> Result<std::fs::Metadata, String> {
    let metadata = file
        .metadata()
        .map_err(|error| format!("无法读取 ZIP 元数据 [{}]: {error}", path.display()))?;
    if !metadata.is_file() {
        return Err(format!("ZIP 路径不是普通文件 [{}]", path.display()));
    }
    reject_windows_reparse(&metadata, path)?;
    Ok(metadata)
}

#[cfg(windows)]
fn reject_windows_reparse(metadata: &std::fs::Metadata, path: &Path) -> Result<(), String> {
    if has_windows_reparse_attribute(metadata.file_attributes()) {
        return Err(format!("ZIP path is a reparse point: {}", path.display()));
    }
    Ok(())
}

#[cfg(any(windows, test))]
fn has_windows_reparse_attribute(attributes: u32) -> bool {
    attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn reject_windows_reparse(_metadata: &std::fs::Metadata, _path: &Path) -> Result<(), String> {
    Ok(())
}

fn copy_snapshot_bytes<R: Read, W: Write>(
    reader: &mut R,
    writer: &mut W,
    expected_size: u64,
    max_bytes: u64,
) -> Result<u64, String> {
    if expected_size > max_bytes {
        return Err(ArchiveLimitError::new(
            ArchiveLimitKind::CompressedSize,
            expected_size,
            max_bytes,
        )
        .to_string());
    }

    let mut limited = reader.take(expected_size.saturating_add(1));
    let copied = std::io::copy(&mut limited, writer)
        .map_err(|error| format!("无法复制 ZIP 快照: {error}"))?;
    if copied > max_bytes {
        return Err(
            ArchiveLimitError::new(ArchiveLimitKind::CompressedSize, copied, max_bytes).to_string(),
        );
    }
    if copied != expected_size {
        return Err(format!(
            "ZIP source size changed while copying ({expected_size} -> {copied})"
        ));
    }
    Ok(copied)
}

fn sanitized_temp_stem(value: &str) -> String {
    let stem: String = Path::new(value)
        .file_stem()
        .and_then(|part| part.to_str())
        .unwrap_or("zip")
        .chars()
        .take(MAX_TEMP_STEM_CHARS)
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '_'
            }
        })
        .collect();

    if stem.is_empty() {
        "zip".to_string()
    } else {
        stem
    }
}

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Read, Write};
    use std::path::PathBuf;

    use zip::write::SimpleFileOptions;
    use zip::{CompressionMethod, ZipWriter};

    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    #[cfg(unix)]
    use super::create_private_output_file;
    use super::{
        canonicalize_archive_entry_path, copy_snapshot_bytes,
        create_private_child_directory, create_private_temp_directory,
        has_windows_reparse_attribute, inspect_zip_directory, validate_archive_entry_path,
        validate_archive_inputs, validate_authorized_archive_paths, ArchiveLimitKind,
        ArchiveLimits, ArchivePreflightBudget, ArchiveRuntimeBudget, ArchiveSnapshotWorkspace,
        ARCHIVE_LIMITS,
    };

    fn test_limits() -> ArchiveLimits {
        ArchiveLimits {
            max_volumes: 2,
            max_compressed_bytes: 10,
            max_path_bytes: 5,
            max_total_path_bytes: 8,
            max_file_bytes: 8,
            max_image_bytes: 4,
            max_extracted_bytes: 10,
            max_compression_ratio: 3,
            compression_ratio_min_bytes: 4,
        }
    }

    fn put_u16(bytes: &mut [u8], offset: usize, value: u16) {
        bytes[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
    }

    fn put_u32(bytes: &mut [u8], offset: usize, value: u32) {
        bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
    }

    fn put_u64(bytes: &mut [u8], offset: usize, value: u64) {
        bytes[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
    }

    fn forged_classic_eocd(entries: u16, central_size: u32, central_offset: u32) -> Vec<u8> {
        let mut bytes = vec![0_u8; 22];
        put_u32(&mut bytes, 0, super::EOCD_SIGNATURE);
        put_u16(&mut bytes, 8, entries);
        put_u16(&mut bytes, 10, entries);
        put_u32(&mut bytes, 12, central_size);
        put_u32(&mut bytes, 16, central_offset);
        bytes
    }

    fn forged_zip64_eocd(entries: u64) -> Vec<u8> {
        let mut bytes = vec![0_u8; 56 + 20 + 22];
        put_u32(&mut bytes, 0, super::ZIP64_EOCD_SIGNATURE);
        put_u64(&mut bytes, 4, 44);
        put_u64(&mut bytes, 24, entries);
        put_u64(&mut bytes, 32, entries);

        put_u32(&mut bytes, 56, super::ZIP64_LOCATOR_SIGNATURE);
        put_u64(&mut bytes, 64, 0);
        put_u32(&mut bytes, 72, 1);

        put_u32(&mut bytes, 76, super::EOCD_SIGNATURE);
        put_u16(&mut bytes, 84, u16::MAX);
        put_u16(&mut bytes, 86, u16::MAX);
        put_u32(&mut bytes, 88, u32::MAX);
        put_u32(&mut bytes, 92, u32::MAX);
        bytes
    }

    fn real_zip_bytes() -> Cursor<Vec<u8>> {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        writer.start_file("debug/maa.log", options).unwrap();
        writer.write_all(b"content").unwrap();
        writer.finish().unwrap()
    }

    fn real_zip64_with_leading_junk() -> (Cursor<Vec<u8>>, u64) {
        let base = real_zip_bytes().into_inner();
        let eocd_offset = base.len() - 22;
        assert_eq!(
            u32::from_le_bytes(base[eocd_offset..eocd_offset + 4].try_into().unwrap()),
            super::EOCD_SIGNATURE
        );
        let entries =
            u16::from_le_bytes(base[eocd_offset + 10..eocd_offset + 12].try_into().unwrap()) as u64;
        let central_size =
            u32::from_le_bytes(base[eocd_offset + 12..eocd_offset + 16].try_into().unwrap()) as u64;
        let central_offset =
            u32::from_le_bytes(base[eocd_offset + 16..eocd_offset + 20].try_into().unwrap()) as u64;
        let leading_junk = b"MZ-leading-junk";
        let mut bytes = leading_junk.to_vec();
        bytes.extend_from_slice(&base[..eocd_offset]);

        let relative_zip64_offset = eocd_offset as u64;
        let mut zip64_record = vec![0_u8; 56];
        put_u32(&mut zip64_record, 0, super::ZIP64_EOCD_SIGNATURE);
        put_u64(&mut zip64_record, 4, 44);
        put_u16(&mut zip64_record, 12, 45);
        put_u16(&mut zip64_record, 14, 45);
        put_u64(&mut zip64_record, 24, entries);
        put_u64(&mut zip64_record, 32, entries);
        put_u64(&mut zip64_record, 40, central_size);
        put_u64(&mut zip64_record, 48, central_offset);
        bytes.extend_from_slice(&zip64_record);

        let mut locator = vec![0_u8; 20];
        put_u32(&mut locator, 0, super::ZIP64_LOCATOR_SIGNATURE);
        put_u64(&mut locator, 8, relative_zip64_offset);
        put_u32(&mut locator, 16, 1);
        bytes.extend_from_slice(&locator);

        let mut eocd = vec![0_u8; 22];
        put_u32(&mut eocd, 0, super::EOCD_SIGNATURE);
        put_u16(&mut eocd, 8, u16::MAX);
        put_u16(&mut eocd, 10, u16::MAX);
        put_u32(&mut eocd, 12, u32::MAX);
        put_u32(&mut eocd, 16, u32::MAX);
        bytes.extend_from_slice(&eocd);

        (
            Cursor::new(bytes),
            leading_junk.len() as u64 + central_offset,
        )
    }

    #[test]
    fn default_limits_match_shared_archive_configuration() {
        let configured: serde_json::Value =
            serde_json::from_str(include_str!("../../config/archive-limits.json")).unwrap();
        let expected = [
            ("maxVolumes", ARCHIVE_LIMITS.max_volumes),
            ("maxCompressedBytes", ARCHIVE_LIMITS.max_compressed_bytes),
            ("maxPathBytes", ARCHIVE_LIMITS.max_path_bytes),
            ("maxTotalPathBytes", ARCHIVE_LIMITS.max_total_path_bytes),
            ("maxFileBytes", ARCHIVE_LIMITS.max_file_bytes),
            ("maxImageBytes", ARCHIVE_LIMITS.max_image_bytes),
            ("maxExtractedBytes", ARCHIVE_LIMITS.max_extracted_bytes),
            ("maxCompressionRatio", ARCHIVE_LIMITS.max_compression_ratio),
            (
                "compressionRatioMinBytes",
                ARCHIVE_LIMITS.compression_ratio_min_bytes,
            ),
        ];

        for (key, value) in expected {
            assert_eq!(configured[key].as_u64(), Some(value), "{key}");
        }
    }

    #[test]
    fn insist_limits_relax_bytes_but_keep_structural_budgets() {
        assert_eq!(
            super::INSIST_ARCHIVE_LIMITS.max_volumes,
            ARCHIVE_LIMITS.max_volumes
        );
        assert_eq!(
            super::INSIST_ARCHIVE_LIMITS.max_path_bytes,
            ARCHIVE_LIMITS.max_path_bytes
        );
        assert_eq!(
            super::INSIST_ARCHIVE_LIMITS.max_total_path_bytes,
            ARCHIVE_LIMITS.max_total_path_bytes
        );
        assert_eq!(super::INSIST_ARCHIVE_LIMITS.max_file_bytes, u64::MAX);
        assert_eq!(super::INSIST_ARCHIVE_LIMITS.max_extracted_bytes, u64::MAX);
        assert_eq!(
            super::INSIST_ARCHIVE_LIMITS.compression_ratio_min_bytes,
            u64::MAX
        );
    }

    #[test]
    fn rejects_excessive_archive_inputs() {
        let volume_error = validate_archive_inputs(&[1, 1, 1], test_limits()).unwrap_err();
        assert_eq!(volume_error.kind, ArchiveLimitKind::VolumeCount);

        let compressed_error = validate_archive_inputs(&[6, 5], test_limits()).unwrap_err();
        assert_eq!(compressed_error.kind, ArchiveLimitKind::CompressedSize);
    }

    #[test]
    fn rejects_unauthorized_sibling_volume() {
        let paths = vec![
            PathBuf::from("logs-part01.zip"),
            PathBuf::from("logs-part02.zip"),
        ];
        let error =
            validate_authorized_archive_paths(&paths, |path| path.ends_with("logs-part01.zip"))
                .unwrap_err();
        assert!(error.contains("logs-part02.zip"));
    }

    #[test]
    fn rejects_forged_classic_eocd_before_directory_allocation() {
        let mut bytes = Cursor::new(forged_classic_eocd(10_001, 0, 0));
        let error = inspect_zip_directory(&mut bytes).unwrap_err();
        assert!(error.contains("too small for its declared entry count"));
    }

    #[test]
    fn accepts_real_zip_central_directory() {
        let mut bytes = real_zip_bytes();
        let info = inspect_zip_directory(&mut bytes).unwrap();
        assert_eq!(info.entries, 1);
        assert!(info.central_directory_size >= super::CENTRAL_DIRECTORY_HEADER_MIN_SIZE);
    }

    #[test]
    fn accepts_real_zip64_with_leading_junk() {
        let (mut bytes, expected_central_offset) = real_zip64_with_leading_junk();
        let info = inspect_zip_directory(&mut bytes).unwrap();
        assert_eq!(info.entries, 1);
        assert_eq!(info.central_directory_offset, expected_central_offset);

        let archive = zip::ZipArchive::new(bytes).unwrap();
        assert_eq!(archive.len(), 1);
    }

    #[test]
    fn rejects_forged_zip64_eocd_before_directory_allocation() {
        let mut bytes = Cursor::new(forged_zip64_eocd(10_001));
        let error = inspect_zip_directory(&mut bytes).unwrap_err();
        assert!(error.contains("too small for its declared entry count"));
    }

    #[test]
    fn rejects_central_directory_outside_snapshot() {
        let mut bytes = Cursor::new(forged_classic_eocd(1, 46, 1));
        let error = inspect_zip_directory(&mut bytes).unwrap_err();
        assert!(error.contains("central-directory"));
    }

    #[test]
    fn bounded_snapshot_copy_rejects_growth_and_limits() {
        let mut grown_source = Cursor::new(vec![1_u8; 5]);
        let mut output = Vec::new();
        let growth_error = copy_snapshot_bytes(&mut grown_source, &mut output, 4, 10).unwrap_err();
        assert!(growth_error.contains("changed"));

        let mut oversized_source = Cursor::new(vec![1_u8; 6]);
        let mut output = Vec::new();
        let limit_error =
            copy_snapshot_bytes(&mut oversized_source, &mut output, 6, 5).unwrap_err();
        assert!(limit_error.contains("compressed-size"));
    }

    #[test]
    fn snapshots_a_regular_zip_before_parsing() {
        let source_directory = create_private_temp_directory("snapshot-source-test").unwrap();
        let source_path = source_directory.join("source.zip");
        let source_bytes = real_zip_bytes().into_inner();
        std::fs::write(&source_path, &source_bytes).unwrap();

        let workspace = ArchiveSnapshotWorkspace::create("snapshot-test.zip").unwrap();
        let mut snapshot = workspace
            .snapshot_source(&source_path, 0, ARCHIVE_LIMITS.max_compressed_bytes)
            .unwrap();
        let info = inspect_zip_directory(&mut snapshot.file).unwrap();
        assert_eq!(info.entries, 1);

        let mut copied = Vec::new();
        snapshot.file.read_to_end(&mut copied).unwrap();
        assert_eq!(copied, source_bytes);

        drop(snapshot);
        drop(workspace);
        std::fs::remove_dir_all(source_directory).unwrap();
    }

    #[test]
    fn creates_private_children_only_below_the_resource_root() {
        let root = create_private_temp_directory("child-test").unwrap();
        let child = create_private_child_directory(&root, "resource-0001").unwrap();
        assert_eq!(child.parent(), Some(root.as_path()));
        assert!(child.is_dir());
        assert!(create_private_child_directory(&root, "../escape").is_err());
        assert!(create_private_child_directory(&root, "nested/path").is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn recognizes_windows_reparse_attribute_boundary() {
        assert!(!has_windows_reparse_attribute(0));
        assert!(has_windows_reparse_attribute(
            super::FILE_ATTRIBUTE_REPARSE_POINT
        ));
    }

    #[test]
    fn enforces_directory_entry_and_path_budgets() {
        let limits = test_limits();

        let mut path_budget = ArchivePreflightBudget::default();
        let path_error = path_budget.add_directory_entry(6, limits).unwrap_err();
        assert_eq!(path_error.kind, ArchiveLimitKind::PathSize);

        let mut total_path_budget = ArchivePreflightBudget::default();
        total_path_budget
            .add_directory_entry(5, limits)
            .unwrap();
        let total_path_error = total_path_budget
            .add_directory_entry(4, limits)
            .unwrap_err();
        assert_eq!(total_path_error.kind, ArchiveLimitKind::TotalPathSize);
    }

    #[test]
    fn enforces_selected_entry_size_total_and_ratio_budgets() {
        let limits = test_limits();

        let mut image_budget = ArchivePreflightBudget::default();
        let image_error = image_budget
            .add_selected_entry(5, 5, true, limits)
            .unwrap_err();
        assert_eq!(image_error.kind, ArchiveLimitKind::ImageSize);

        let mut file_budget = ArchivePreflightBudget::default();
        let file_error = file_budget
            .add_selected_entry(9, 9, false, limits)
            .unwrap_err();
        assert_eq!(file_error.kind, ArchiveLimitKind::FileSize);

        let mut ratio_budget = ArchivePreflightBudget::default();
        let ratio_error = ratio_budget
            .add_selected_entry(1, 4, false, limits)
            .unwrap_err();
        assert_eq!(ratio_error.kind, ArchiveLimitKind::CompressionRatio);

        let mut total_budget = ArchivePreflightBudget::default();
        total_budget
            .add_selected_entry(3, 6, false, limits)
            .unwrap();
        let total_error = total_budget
            .add_selected_entry(3, 5, false, limits)
            .unwrap_err();
        assert_eq!(total_error.kind, ArchiveLimitKind::ExtractedSize);
    }

    #[test]
    fn runtime_budget_rejects_streams_larger_than_metadata_budget() {
        let limits = test_limits();
        let mut budget = ArchiveRuntimeBudget::default();
        let error = budget
            .read_to_end(
                &mut Cursor::new(vec![0_u8; 5]),
                5,
                5,
                limits.max_image_bytes,
                ArchiveLimitKind::ImageSize,
                limits,
            )
            .unwrap_err();
        assert!(error.contains("image-size"));
    }

    #[test]
    fn runtime_budget_stops_forged_uncompressed_output_before_write() {
        let mut limits = test_limits();
        limits.max_file_bytes = 100;
        limits.max_extracted_bytes = 100;
        limits.compression_ratio_min_bytes = 4;
        limits.max_compression_ratio = 3;
        let mut budget = ArchiveRuntimeBudget::default();
        let mut output = Vec::new();
        let error = budget
            .copy_to(
                &mut Cursor::new(vec![0_u8; 10]),
                &mut output,
                1,
                10,
                limits.max_file_bytes,
                ArchiveLimitKind::FileSize,
                limits,
            )
            .unwrap_err();

        assert!(error.contains("compression-ratio"));
        assert!(output.is_empty());
    }

    #[test]
    fn runtime_budget_rejects_output_that_differs_from_directory_metadata() {
        let mut limits = test_limits();
        limits.max_file_bytes = 100;
        limits.max_extracted_bytes = 100;
        limits.compression_ratio_min_bytes = 100;

        let mut short_budget = ArchiveRuntimeBudget::default();
        let short_error = short_budget
            .read_to_end(
                &mut Cursor::new(vec![0_u8; 3]),
                3,
                4,
                limits.max_file_bytes,
                ArchiveLimitKind::FileSize,
                limits,
            )
            .unwrap_err();
        assert!(short_error.contains("differs"));

        let mut long_budget = ArchiveRuntimeBudget::default();
        let mut output = Vec::new();
        let long_error = long_budget
            .copy_to(
                &mut Cursor::new(vec![0_u8; 5]),
                &mut output,
                5,
                4,
                limits.max_file_bytes,
                ArchiveLimitKind::FileSize,
                limits,
            )
            .unwrap_err();
        assert!(long_error.contains("exceeds"));
        assert!(output.is_empty());
    }

    #[test]
    fn rejects_zip_slip_and_absolute_paths() {
        assert!(validate_archive_entry_path("debug/maa.log").is_ok());
        assert!(validate_archive_entry_path("../maa.log").is_err());
        assert!(validate_archive_entry_path("debug\\..\\maa.log").is_err());
        assert!(validate_archive_entry_path("debug/./maa.log").is_err());
        assert!(validate_archive_entry_path("debug//maa.log").is_err());
        assert!(validate_archive_entry_path("debug/maa\n.log").is_err());
        assert!(validate_archive_entry_path("/etc/shadow").is_err());
        assert!(validate_archive_entry_path("C:\\Windows\\win.ini").is_err());
        assert!(validate_archive_entry_path("C:relative\\maa.log").is_err());
        assert_eq!(
            canonicalize_archive_entry_path("debug\\maa.log").unwrap(),
            "debug/maa.log"
        );
        assert_eq!(canonicalize_archive_entry_path("debug/").unwrap(), "debug");
    }

    #[cfg(unix)]
    #[test]
    fn private_workspace_and_files_restrict_unix_permissions() {
        let workspace = ArchiveSnapshotWorkspace::create("permissions.zip").unwrap();
        let directory_mode = std::fs::metadata(workspace.path())
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(directory_mode & 0o077, 0);

        let file_path = workspace.path().join("permission-check.zip");
        let file = create_private_output_file(&file_path).unwrap();
        let file_mode = file.metadata().unwrap().permissions().mode() & 0o777;
        assert_eq!(file_mode & 0o077, 0);
    }

    #[cfg(unix)]
    #[test]
    fn snapshot_source_rejects_final_symlink() {
        let workspace = ArchiveSnapshotWorkspace::create("symlink.zip").unwrap();
        let target_path = workspace.path().join("source.zip");
        let mut target = create_private_output_file(&target_path).unwrap();
        target.write_all(&real_zip_bytes().into_inner()).unwrap();
        drop(target);

        let symlink_path = workspace.path().join("source-link.zip");
        std::os::unix::fs::symlink(&target_path, &symlink_path).unwrap();
        assert!(workspace
            .snapshot_source(&symlink_path, 0, ARCHIVE_LIMITS.max_compressed_bytes)
            .is_err());
    }
}
