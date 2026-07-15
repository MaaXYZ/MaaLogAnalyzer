import { describe, expect, it } from 'vitest'
import { joinNativePath } from '../nativePath'

describe('joinNativePath', () => {
  it('joins POSIX paths with forward slashes', () => {
    expect(joinNativePath('/home/user/debug', 'vision', 'image.jpg'))
      .toBe('/home/user/debug/vision/image.jpg')
    expect(joinNativePath('/', 'debug')).toBe('/debug')
  })

  it('joins Windows drive paths with backslashes', () => {
    expect(joinNativePath('C:\\Users\\user\\debug', 'vision', 'image.jpg'))
      .toBe('C:\\Users\\user\\debug\\vision\\image.jpg')
    expect(joinNativePath('C:\\', 'debug')).toBe('C:\\debug')
  })

  it('preserves UNC path style and trims segment separators', () => {
    expect(joinNativePath('\\\\server\\share\\', '/debug/', '\\maa.log'))
      .toBe('\\\\server\\share\\debug\\maa.log')
  })
})
