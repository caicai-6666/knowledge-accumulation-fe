const DURATION = 640
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
function textUnits(value) {
  return (value.match(/&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);|[^&]+|&/giu) || []).flatMap(part => part.startsWith('&') && part.endsWith(';') ? [part] : Array.from(segmenter.segment(part), item => item.segment))
}

// 输入仅为 answerMarkdown 生成的安全 HTML；只包裹文本，不改动标签、属性或实体。
function splitBlocks(blocks) {
  return blocks.map(html => [...html.matchAll(/<[^>]*>|[^<]+/g)].map(([value]) => ({
    tag: value.startsWith('<'),
    value,
    units: value.startsWith('<') ? [] : textUnits(value),
  })))
}

export function createMarkdownInk() {
  let previous = []
  let ranges = []
  function update(blocks, { animate = false, now = performance.now() } = {}) {
    const parts = splitBlocks(blocks)
    const units = parts.flatMap(block => block.flatMap(part => part.units))
    let prefix = 0
    while (prefix < previous.length && prefix < units.length && previous[prefix] === units[prefix]) prefix++
    ranges = animate ? ranges.filter(range => range.start < prefix && now - range.born < DURATION + range.delay).map(range => ({ ...range, end: Math.min(range.end, prefix) })) : []
    if (animate && prefix < units.length) {
      const step = Math.min(18, 96 / Math.max(1, units.length - prefix - 1))
      for (let index = prefix; index < units.length; index++) ranges.push({ start: index, end: index + 1, born: now, delay: (index - prefix) * step })
    }
    previous = units
    let offset = 0
    return parts.map(block => block.map(part => {
      if (part.tag) return part.value
      const start = offset
      offset += part.units.length
      const overlaps = ranges.filter(range => range.end > start && range.start < offset)
      let cursor = start, html = ''
      for (const range of overlaps) {
        const left = Math.max(start, range.start), right = Math.min(offset, range.end)
        html += part.units.slice(cursor - start, left - start).join('')
        const text = part.units.slice(left - start, right - start).join('')
        // 表格、列表标签之间的排版空白必须保留为原始空白，不能插入 span。
        html += text.trim() ? `<span class="markdown-ink" style="animation-delay:${Math.round(range.born + range.delay - now)}ms">${text}</span>` : text
        cursor = right
      }
      return html + part.units.slice(cursor - start).join('')
    }).join(''))
  }
  return { update }
}
