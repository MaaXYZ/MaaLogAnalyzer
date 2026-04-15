import { marked } from 'marked'

const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
])

const ALLOWED_STYLE_PROPERTIES = new Set([
  'background',
  'background-color',
  'border',
  'border-radius',
  'color',
  'display',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'margin-top',
  'max-width',
  'padding',
  'text-decoration',
  'width',
])

const escapeHtml = (
  value: string,
): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const escapeAttribute = (
  value: string,
): string => escapeHtml(value).replace(/`/g, '&#96;')

const sanitizeUrl = (
  value: string,
): string | null => {
  const normalized = value.trim()
  if (!normalized) return null

  if (
    normalized.startsWith('#')
    || normalized.startsWith('/')
    || normalized.startsWith('./')
    || normalized.startsWith('../')
  ) {
    return normalized
  }

  const lower = normalized.toLowerCase()
  if (
    lower.startsWith('http://')
    || lower.startsWith('https://')
    || lower.startsWith('mailto:')
    || lower.startsWith('tel:')
  ) {
    return normalized
  }

  return null
}

const sanitizeImageSrc = (
  value: string,
): string | null => {
  const normalized = value.trim()
  if (!normalized) return null

  const lower = normalized.toLowerCase()
  if (
    lower.startsWith('http://')
    || lower.startsWith('https://')
  ) {
    return normalized
  }

  if (
    /^data:image\/(?:png|jpe?g|gif|webp|bmp|avif);base64,[a-z0-9+/=\s]+$/i.test(normalized)
  ) {
    return normalized
  }

  return null
}

const sanitizeStyle = (
  value: string,
): string | null => {
  const safeDeclarations = value
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .flatMap((declaration) => {
      const colonIndex = declaration.indexOf(':')
      if (colonIndex <= 0) return []

      const property = declaration.slice(0, colonIndex).trim().toLowerCase()
      const propertyValue = declaration.slice(colonIndex + 1).trim()
      if (!ALLOWED_STYLE_PROPERTIES.has(property)) return []
      if (!propertyValue) return []

      const lowerValue = propertyValue.toLowerCase()
      if (
        lowerValue.includes('expression(')
        || lowerValue.includes('javascript:')
        || lowerValue.includes('url(')
      ) {
        return []
      }

      if (!/^[#(),.%\w\s-]+$/.test(propertyValue)) {
        return []
      }

      return [`${property}: ${propertyValue}`]
    })

  return safeDeclarations.length > 0 ? safeDeclarations.join('; ') : null
}

const sanitizeClass = (
  value: string,
): string | null => {
  const normalized = value.trim()
  if (!normalized) return null
  if (!/^[\w -]+$/.test(normalized)) return null
  return normalized
}

const sanitizeAllowedTag = (
  tagSource: string,
): string | null => {
  const match = tagSource.match(/^<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*)>$/)
  if (!match) return null

  const isClosing = match[1] === '/'
  const tagName = match[2]?.toLowerCase() ?? ''
  const rawAttrs = match[3] ?? ''

  if (!ALLOWED_TAGS.has(tagName)) return null
  if (isClosing) return `</${tagName}>`
  if (tagName === 'br') return '<br>'

  const attrs: string[] = []
  const attrPattern = /([:@\w-]+)\s*=\s*("([^"]*)"|'([^']*)')/g

  for (const attrMatch of rawAttrs.matchAll(attrPattern)) {
    const attrName = attrMatch[1]?.toLowerCase() ?? ''
    const attrValue = attrMatch[3] ?? attrMatch[4] ?? ''

    if (attrName === 'style') {
      const sanitizedStyle = sanitizeStyle(attrValue)
      if (sanitizedStyle) {
        attrs.push(`style="${escapeAttribute(sanitizedStyle)}"`)
      }
      continue
    }

    if ((tagName === 'code' || tagName === 'pre') && attrName === 'class') {
      const sanitizedClass = sanitizeClass(attrValue)
      if (sanitizedClass) {
        attrs.push(`class="${escapeAttribute(sanitizedClass)}"`)
      }
      continue
    }

    if (tagName === 'a' && attrName === 'href') {
      const sanitizedHref = sanitizeUrl(attrValue)
      if (sanitizedHref) {
        attrs.push(`href="${escapeAttribute(sanitizedHref)}"`)
        attrs.push('target="_blank"')
        attrs.push('rel="noopener noreferrer"')
      }
      continue
    }

    if (tagName === 'a' && attrName === 'title') {
      attrs.push(`title="${escapeAttribute(attrValue)}"`)
      continue
    }

    if (tagName === 'img' && attrName === 'src') {
      const sanitizedSrc = sanitizeImageSrc(attrValue)
      if (sanitizedSrc) {
        attrs.push(`src="${escapeAttribute(sanitizedSrc)}"`)
      }
      continue
    }

    if (tagName === 'img' && attrName === 'alt') {
      attrs.push(`alt="${escapeAttribute(attrValue)}"`)
      continue
    }
  }

  if (tagName === 'hr') return '<hr>'
  if (tagName === 'img') {
    return attrs.length > 0
      ? `<img ${attrs.join(' ')}>`
      : '<img>'
  }
  return attrs.length > 0
    ? `<${tagName} ${attrs.join(' ')}>`
    : `<${tagName}>`
}

const sanitizeRenderedHtml = (
  source: string,
): string => {
  const parts: string[] = []
  const tagPattern = /<\/?[^>]+>/g
  let lastIndex = 0

  for (const match of source.matchAll(tagPattern)) {
    const rawTag = match[0]
    const index = match.index ?? 0

    if (index > lastIndex) {
      parts.push(source.slice(lastIndex, index))
    }

    const sanitizedTag = sanitizeAllowedTag(rawTag)
    parts.push(sanitizedTag ?? escapeHtml(rawTag))

    lastIndex = index + rawTag.length
  }

  if (lastIndex < source.length) {
    parts.push(source.slice(lastIndex))
  }

  return parts.length > 0 ? parts.join('') : source
}

export const renderFocusRichText = (
  source: string,
): string => {
  if (!source) return ''

  const rendered = marked.parse(source, {
    async: false,
    breaks: true,
    gfm: true,
  })

  return sanitizeRenderedHtml(
    typeof rendered === 'string' ? rendered.trim() : '',
  )
}
