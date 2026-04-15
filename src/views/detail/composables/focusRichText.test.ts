import { describe, expect, it } from 'vitest'
import { renderFocusRichText } from './focusRichText'

describe('renderFocusRichText', () => {
  it('renders markdown with embedded html', () => {
    const html = renderFocusRichText('**Bold** and <span style="color:crimson;">Error</span>')

    expect(html).toContain('<strong>Bold</strong>')
    expect(html).toContain('<span style="color: crimson">Error</span>')
  })

  it('strips unsafe html and escapes scripts', () => {
    const html = renderFocusRichText('<script>alert(1)</script><span onclick="x()">Safe</span>')

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('<span>Safe</span>')
    expect(html).not.toContain('onclick=')
  })

  it('renders block markdown structures', () => {
    const html = renderFocusRichText('# Title\n\n- item')

    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<li>item</li>')
  })

  it('sanitizes markdown links', () => {
    const html = renderFocusRichText('[Docs](https://example.com) [Bad](javascript:alert(1))')

    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">Docs</a>')
    expect(html).toContain('<a>Bad</a>')
    expect(html).not.toContain('javascript:')
  })

  it('renders safe inline images from data urls', () => {
    const html = renderFocusRichText(
      '<img src="data:image/png;base64,AAAA" alt="preview" style="display:block;width:128px;height:128px;border-radius:6px;" />',
    )

    expect(html).toContain('<img ')
    expect(html).toContain('src="data:image/png;base64,AAAA"')
    expect(html).toContain('alt="preview"')
    expect(html).toContain('style="display: block; width: 128px; height: 128px; border-radius: 6px"')
  })

  it('blocks unsafe image sources', () => {
    const html = renderFocusRichText(
      '<img src="data:text/html;base64,AAAA" alt="bad" /><img src="javascript:alert(1)" alt="bad2" />',
    )

    expect(html).not.toContain('data:text/html')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('<img alt="bad">')
    expect(html).toContain('<img alt="bad2">')
  })
})
