const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const splitTableCells = (line: string): string[] =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(item => item.trim())

const isMarkdownTableDivider = (line: string): boolean =>
  /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line)

const renderInlineMarkdown = (text: string): string => {
  const codeTokens: string[] = []
  const placeholderWrapped = text.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    const token = `@@CODE_TOKEN_${codeTokens.length}@@`
    codeTokens.push(code)
    return token
  })

  let html = escapeHtml(placeholderWrapped)
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const safe = /^https?:\/\//i.test(url)
    if (!safe) return `${label} (${url})`
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  html = html.replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
  html = html.replace(/@@CODE_TOKEN_(\d+)@@/g, (_m, idx: string) => {
    const code = codeTokens[Number(idx)] ?? ''
    return `<code>${escapeHtml(code)}</code>`
  })
  return html
}

const renderMarkdownBlocks = (source: string): string => {
  const lines = source.split('\n')
  const out: string[] = []
  let i = 0
  let listType: 'ul' | 'ol' | null = null
  let listItems: string[][] = []
  let paragraphLines: string[] = []

  const closeList = () => {
    if (!listType) return
    const tag = listType
    const itemsHtml = listItems
      .map(itemLines => {
        const body = itemLines
          .map(line => renderInlineMarkdown(line.trimEnd()))
          .join('<br/>')
        return `<li>${body}</li>`
      })
      .join('')
    out.push(`<${tag}>${itemsHtml}</${tag}>`)
    listType = null
    listItems = []
  }

  const flushParagraph = () => {
    if (!paragraphLines.length) return
    const html = paragraphLines
      .map(line => renderInlineMarkdown(line.trimEnd()))
      .join('<br/>')
    out.push(`<p>${html}</p>`)
    paragraphLines = []
  }

  while (i < lines.length) {
    const raw = lines[i]
    const trimmed = raw.trim()
    const leadingSpaces = raw.length - raw.trimStart().length

    if (!trimmed) {
      if (listType && listItems.length > 0) {
        listItems[listItems.length - 1].push('')
        i += 1
        continue
      }
      flushParagraph()
      closeList()
      i += 1
      continue
    }

    const heading = raw.match(/^\s*(#{1,6})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      closeList()
      const level = heading[1].length
      out.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`)
      i += 1
      continue
    }

    if (raw.includes('|') && i + 1 < lines.length && isMarkdownTableDivider(lines[i + 1])) {
      flushParagraph()
      closeList()
      const headers = splitTableCells(raw)
      i += 2
      const rows: string[][] = []
      while (i < lines.length) {
        const rowRaw = lines[i]
        if (!rowRaw.trim() || !rowRaw.includes('|')) break
        rows.push(splitTableCells(rowRaw))
        i += 1
      }

      const thead = `<thead><tr>${headers.map(item => `<th>${renderInlineMarkdown(item)}</th>`).join('')}</tr></thead>`
      const tbodyRows = rows.map(row => {
        const normalized = headers.map((_, idx) => row[idx] ?? '')
        return `<tr>${normalized.map(cell => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`
      }).join('')
      out.push(`<table>${thead}<tbody>${tbodyRows}</tbody></table>`)
      continue
    }

    const quote = raw.match(/^\s*>\s?(.*)$/)
    if (quote) {
      flushParagraph()
      closeList()
      const quoteLines: string[] = []
      while (i < lines.length) {
        const current = lines[i].match(/^\s*>\s?(.*)$/)
        if (!current) break
        quoteLines.push(current[1])
        i += 1
      }
      out.push(`<blockquote>${renderMarkdownBlocks(quoteLines.join('\n'))}</blockquote>`)
      continue
    }

    const ul = raw.match(/^\s*[-*+]\s+(.+)$/)
    if (ul) {
      if (listType && listItems.length > 0 && leadingSpaces > 0) {
        listItems[listItems.length - 1].push(raw.trim())
        i += 1
        continue
      }
      flushParagraph()
      if (listType !== 'ul') {
        closeList()
        listType = 'ul'
      }
      listItems.push([ul[1]])
      i += 1
      continue
    }

    const ol = raw.match(/^\s*\d+\.\s+(.+)$/)
    if (ol) {
      if (listType && listItems.length > 0 && leadingSpaces > 0) {
        listItems[listItems.length - 1].push(raw.trim())
        i += 1
        continue
      }
      flushParagraph()
      if (listType !== 'ol') {
        closeList()
        listType = 'ol'
      }
      listItems.push([ol[1]])
      i += 1
      continue
    }

    if (listType && listItems.length > 0) {
      listItems[listItems.length - 1].push(raw)
      i += 1
      continue
    }

    closeList()
    paragraphLines.push(raw)
    i += 1
  }

  flushParagraph()
  closeList()
  return out.join('\n')
}

export const renderMarkdown = (source: string): string => {
  if (!source.trim()) return ''
  const normalized = source.replace(/\r\n?/g, '\n')
  const segments = normalized.split(/```/)
  const html: string[] = []

  segments.forEach((segment, index) => {
    if (index % 2 === 0) {
      html.push(renderMarkdownBlocks(segment))
      return
    }

    const lines = segment.split('\n')
    const language = lines[0]?.trim() || ''
    const code = lines.slice(1).join('\n')
    const langClass = language ? ` class="language-${escapeHtml(language)}"` : ''
    html.push(`<pre class="md-code"><code${langClass}>${escapeHtml(code)}</code></pre>`)
  })

  return html.join('\n')
}

export const sanitizeAnswerForUser = (raw: string): string => {
  if (!raw) return raw
  const replacers: Array<[RegExp, string]> = [
    [/timelineDiagnostics\.longStayNodes(?:\[\d+\])?/g, '时间线长停留统计'],
    [/timelineDiagnostics\.recoFailuresByName(?:\[\d+\])?/g, '识别失败分布统计'],
    [/timelineDiagnostics\.hotspotRecoPairs(?:\[\d+\])?/g, '识别热点组合统计'],
    [/timelineDiagnostics\.repeatedRuns(?:\[\d+\])?/g, '连续重复运行统计'],
    [/eventChainDiagnostics\.onErrorChains(?:\[\d+\])?/g, 'on_error 触发链路'],
    [/eventChainDiagnostics\.nextRecognitionChains(?:\[\d+\])?/g, 'next 识别链路'],
    [/eventChainDiagnostics\.actionFailureChains(?:\[\d+\])?/g, '动作失败链路'],
    [/stopTerminationDiagnostics(?:\.[A-Za-z0-9_\[\]\.]+)?/g, '停止链路诊断'],
    [/nextCandidateAvailabilityDiagnostics(?:\.[A-Za-z0-9_\[\]\.]+)?/g, 'next 候选可执行性诊断'],
    [/anchorResolutionDiagnostics(?:\.[A-Za-z0-9_\[\]\.]+)?/g, 'anchor 解析诊断'],
    [/jumpBackFlowDiagnostics(?:\.[A-Za-z0-9_\[\]\.]+)?/g, 'jump_back 回跳诊断'],
    [/nestedActionDiagnostics(?:\.[A-Za-z0-9_\[\]\.]+)?/g, 'nested action 诊断'],
    [/questionNodeDiagnostics(?:\.[A-Za-z0-9_\[\]\.]+)?/g, '问题节点专项统计'],
    [/signalDiagnostics(?:\.[A-Za-z0-9_\[\]\.]+)?/g, '信号分型统计'],
    [/deterministicFindings\.findings(?:\[\d+\])?/g, '确定性结论摘要'],
    [/selectedEventTail(?:\[\d+\])?/g, '事件尾部记录'],
  ]

  let next = raw
  for (const [pattern, replacement] of replacers) {
    next = next.replace(pattern, replacement)
  }
  return next
}
