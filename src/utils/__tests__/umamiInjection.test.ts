import { describe, expect, it } from 'vitest'
import { resolveUmamiWebsiteId } from '../../../scripts/umami-analytics.mjs'

const WEBSITE_ID = '14964f46-1293-4fc8-82c3-09446ba85c11'

describe('Umami analytics injection', () => {
  it('injects the configured website id for browser builds', () => {
    expect(resolveUmamiWebsiteId({ MLA_UMAMI_WEBSITE_ID: WEBSITE_ID })).toBe(WEBSITE_ID)
    expect(resolveUmamiWebsiteId({ MLA_UMAMI_WEBSITE_ID: ` ${WEBSITE_ID} ` })).toBe(WEBSITE_ID)
  })

  it('stays disabled unless a website id is configured', () => {
    expect(resolveUmamiWebsiteId({})).toBeNull()
    expect(resolveUmamiWebsiteId({ MLA_UMAMI_WEBSITE_ID: '' })).toBeNull()
    expect(resolveUmamiWebsiteId({ MLA_UMAMI_WEBSITE_ID: '   ' })).toBeNull()
  })

  it('never injects a remote script into Tauri builds', () => {
    expect(
      resolveUmamiWebsiteId({
        MLA_UMAMI_WEBSITE_ID: WEBSITE_ID,
        TAURI_ENV_PLATFORM: 'windows',
      }),
    ).toBeNull()
    expect(
      resolveUmamiWebsiteId({
        MLA_UMAMI_WEBSITE_ID: WEBSITE_ID,
        TAURI_DEV_HOST: '127.0.0.1',
      }),
    ).toBeNull()
  })

  it('rejects a website id that is not a UUID', () => {
    expect(() => resolveUmamiWebsiteId({ MLA_UMAMI_WEBSITE_ID: 'not-a-uuid' })).toThrow(
      /must be a UUID/,
    )
    expect(() =>
      resolveUmamiWebsiteId({
        MLA_UMAMI_WEBSITE_ID: `${WEBSITE_ID}" onload="alert(1)`,
      }),
    ).toThrow(/must be a UUID/)
  })
})
