import { describe, expect, it } from 'vitest'
import {
  collectMxuZipVolumes,
  parseMxuZipVolumeName,
} from '../mxuZipVolumes'

describe('MXU ZIP volume naming', () => {
  it('accepts both two-digit and three-digit volume numbers', () => {
    expect(parseMxuZipVolumeName('project-logs-20260717-120000-part01.zip')?.index).toBe(1)
    expect(parseMxuZipVolumeName('project-logs-20260717-120000-part001.ZIP')?.index).toBe(1)
    expect(parseMxuZipVolumeName('project-logs-20260717-120000-part1.zip')).toBeNull()
    expect(parseMxuZipVolumeName('project-logs-20260717-120000-part000.zip')).toBeNull()
  })

  it('groups matching volumes and sorts their numeric indexes', () => {
    const second = new File([], 'project-logs-20260717-120000-part002.zip')
    const other = new File([], 'other-logs-20260717-120000-part001.zip')
    const first = new File([], 'project-logs-20260717-120000-part001.zip')

    expect(collectMxuZipVolumes([second, other, first], second).map(file => file.name)).toEqual([
      first.name,
      second.name,
    ])
  })
})
