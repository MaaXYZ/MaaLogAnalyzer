import { countLinesInFile } from './lineCount'

interface UploadedFilePayload {
  fileName: string
  fileSizeInMB: number
  isLargeFile: boolean
  fileContent: string
  fileHandle: File | null
  totalLines: number
}

const LARGE_FILE_THRESHOLD_MB = 5

export const readUploadedFile = async (file: File): Promise<UploadedFilePayload> => {
  const fileSizeInMB = file.size / 1024 / 1024

  if (fileSizeInMB < LARGE_FILE_THRESHOLD_MB) {
    const fileContent = await file.text()
    return {
      fileName: file.name,
      fileSizeInMB,
      isLargeFile: false,
      fileContent,
      fileHandle: null,
      totalLines: fileContent.split('\n').length,
    }
  }

  return {
    fileName: file.name,
    fileSizeInMB,
    isLargeFile: true,
    fileContent: '',
    fileHandle: file,
    totalLines: await countLinesInFile(file),
  }
}
