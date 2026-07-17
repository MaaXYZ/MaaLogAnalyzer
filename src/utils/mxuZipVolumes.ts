export interface MxuZipVolumeInfo {
  baseName: string
  index: number
}

const MXU_ZIP_VOLUME_PATTERN = /^(.*)-part(\d{2,})\.zip$/i

export function parseMxuZipVolumeName(fileName: string): MxuZipVolumeInfo | null {
  const match = fileName.match(MXU_ZIP_VOLUME_PATTERN)
  if (!match || !match[1]) return null

  const index = Number(match[2])
  if (!Number.isSafeInteger(index) || index < 1) return null

  return {
    baseName: match[1],
    index,
  }
}

const getFileDirectory = (file: File): string => {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    ?.replace(/\\/g, '/')
  if (!relativePath) return ''

  const separator = relativePath.lastIndexOf('/')
  return separator >= 0 ? relativePath.slice(0, separator).toLowerCase() : ''
}

export function collectMxuZipVolumes(files: Iterable<File>, anchor: File): File[] {
  const anchorInfo = parseMxuZipVolumeName(anchor.name)
  if (!anchorInfo) return [anchor]

  const anchorBaseName = anchorInfo.baseName.toLowerCase()
  const anchorDirectory = getFileDirectory(anchor)
  const matches = Array.from(files)
    .map((file) => ({ file, info: parseMxuZipVolumeName(file.name) }))
    .filter(({ file, info }) => (
      info != null
      && info.baseName.toLowerCase() === anchorBaseName
      && getFileDirectory(file) === anchorDirectory
    ))

  matches.sort((left, right) => (
    left.info!.index - right.info!.index
    || left.file.name.localeCompare(right.file.name)
  ))

  return matches.length > 0 ? matches.map(({ file }) => file) : [anchor]
}

export function findMxuZipVolumes(files: Iterable<File>): File[] {
  const fileList = Array.from(files)
  const anchor = fileList.find((file) => parseMxuZipVolumeName(file.name) != null)
  return anchor ? collectMxuZipVolumes(fileList, anchor) : []
}
