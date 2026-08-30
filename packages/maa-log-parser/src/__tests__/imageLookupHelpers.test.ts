import { describe, expect, it } from 'vitest'
import { findImageByTimestampSuffix } from '../event/imageLookupHelpers'

describe('findImageByTimestampSuffix', () => {
  it('matches the exact millisecond instead of the first image from the same second', () => {
    const images = new Map([
      ['2026.04.07-10.00.00.001_Node', '/images/first.png'],
      ['2026.04.07-10.00.00.007_Node', '/images/exact.png'],
      ['2026.04.07-10.00.00.009_Node', '/images/last.png'],
    ])

    expect(findImageByTimestampSuffix(images, '2026-04-07 10:00:00.007', '_Node')).toBe(
      '/images/exact.png',
    )
  })

  it('falls back to the nearest image in the same second deterministically', () => {
    const images = new Map([
      ['2026.04.07-10.00.00.009_Node', '/images/later.png'],
      ['2026.04.07-10.00.00.005_Node', '/images/earlier.png'],
    ])

    expect(findImageByTimestampSuffix(images, '2026-04-07 10:00:00.007', '_Node')).toBe(
      '/images/earlier.png',
    )
  })

  it('does not match images from a different second or suffix', () => {
    const images = new Map([
      ['2026.04.07-10.00.01.007_Node', '/images/other-second.png'],
      ['2026.04.07-10.00.00.007_Other', '/images/other-node.png'],
    ])

    expect(findImageByTimestampSuffix(images, '2026-04-07 10:00:00.007', '_Node')).toBeUndefined()
  })
})
