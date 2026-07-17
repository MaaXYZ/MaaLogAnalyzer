const DECODE_CANDIDATE_ENCODINGS = ['utf-8', 'gbk', 'gb18030', 'gb2312'] as const
const ENCODING_SAMPLE_SIZE = 256 * 1024

// Tolerate a multi-byte sequence split at the sample boundary.
const sampleMatchesEncoding = (sample: Uint8Array, encoding: string): boolean => {
  for (let trim = 0; trim <= 3; trim += 1) {
    if (sample.length - trim <= 0) return false
    try {
      new TextDecoder(encoding, { fatal: true }).decode(sample.subarray(0, sample.length - trim))
      return true
    } catch {
      // Retry with a shorter sample.
    }
  }
  return false
}

const detectEncoding = (bytes: Uint8Array): string => {
  const sample = bytes.length > ENCODING_SAMPLE_SIZE
    ? bytes.subarray(0, ENCODING_SAMPLE_SIZE)
    : bytes
  for (const encoding of DECODE_CANDIDATE_ENCODINGS) {
    if (sampleMatchesEncoding(sample, encoding)) return encoding
  }
  return 'utf-8'
}

/** Decode log bytes with a UTF-8-first legacy Chinese encoding fallback. */
export const decodeFileContent = (bytes: Uint8Array): string => {
  const encoding = detectEncoding(bytes)
  // Keep decoding resilient to a rare invalid sequence outside the sample.
  return new TextDecoder(encoding, { fatal: false }).decode(bytes)
}