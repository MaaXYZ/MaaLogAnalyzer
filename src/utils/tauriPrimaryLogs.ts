import { convertFileSrc } from '@tauri-apps/api/core'
import { isGzipLog, createPrimaryFileSource } from './gzipLog'
import { toExactArrayBuffer } from './logInputSource'
import type {
  FilePrimaryLogFile,
  LoadablePrimaryLogFile,
  LoadedPrimaryLogFile,
  PrimaryLogFile,
} from './logFileDiscovery'
import { decodeFileContent } from './textEncoding'

export interface TauriArchiveLogs {
  primary_log_files: LoadedPrimaryLogFile[]
  gzip_log_files?: Array<{ path: string; name: string; temp_path: string }>
}

export function listTauriArchiveLogs(result: TauriArchiveLogs) {
  return [...result.primary_log_files, ...(result.gzip_log_files ?? [])]
}

export async function openTauriArchiveLogs(entries: ReturnType<typeof listTauriArchiveLogs>) {
  const files: PrimaryLogFile[] = []
  for (const entry of entries) {
    if ('content' in entry) files.push(entry)
    else {
      const response = await fetch(convertFileSrc(entry.temp_path))
      if (!response.ok) throw new Error(`读取日志失败: ${entry.path}`)
      files.push(createPrimaryFileSource(entry.path, new File([await response.blob()], entry.name)))
    }
  }
  return files
}

export async function openTauriPrimaryLog(
  path: string,
  name: string,
  loadBytes: () => Promise<Uint8Array>,
): Promise<FilePrimaryLogFile | LoadablePrimaryLogFile> {
  if (isGzipLog(name)) {
    return createPrimaryFileSource(path, new File([toExactArrayBuffer(await loadBytes())], name))
  }
  return { path, name, loadBytes, loadContent: async () => decodeFileContent(await loadBytes()) }
}
