import MarkdownIt from 'markdown-it'
import { webpageUrl } from '../services/linkMetadata.js'

// 问答正文沿用 contract-service-fe 的 Markdown 排版；原始 HTML 不执行。
const markdown = new MarkdownIt({ breaks: true, html: false, linkify: true, typographer: true })
const defaultLink = markdown.renderer.rules.link_open
markdown.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
  const token = tokens[index]
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  if (token.attrGet('class') === 'markdown-web-link') {
    const icon = webpageUrl(environment.linkMetadata?.get(token.attrGet('href'))?.icon)?.href
    const image = icon ? `<img src="${markdown.utils.escapeHtml(icon)}" alt="" referrerpolicy="no-referrer" loading="lazy" />` : ''
    return `${renderer.renderToken(tokens, index, options)}<span class="markdown-web-link__icon" aria-hidden="true">↗${image}</span><span class="markdown-web-link__label">`
  }
  return defaultLink ? defaultLink(tokens, index, options, environment, renderer) : renderer.renderToken(tokens, index, options)
}
const defaultLinkClose = markdown.renderer.rules.link_close
markdown.renderer.rules.link_close = (tokens, index, options, environment, renderer) => {
  const close = defaultLinkClose ? defaultLinkClose(tokens, index, options, environment, renderer) : renderer.renderToken(tokens, index, options)
  return tokens[index].meta?.webLink ? `</span>${close}` : close
}
function decorateLinks(tokens, metadata) {
  for (const token of tokens) {
    const children = token.children || []
    for (let i = 0; i < children.length; i++) {
      const open = children[i]
      if (open.type !== 'link_open') continue
      const href = open.attrGet('href'), url = webpageUrl(href), text = children[i + 1], close = children[i + 2]
      if (!url || text?.type !== 'text' || close?.type !== 'link_close') continue
      const original = text.content
      const bare = Boolean(webpageUrl(original)) || original.startsWith('www.')
      text.content = metadata?.get(href)?.title || (bare ? url.hostname : original)
      open.attrSet('class', 'markdown-web-link')
      open.attrSet('title', `${text.content}\n${href}`)
      close.meta = { webLink: true }
    }
  }
}
export function answerWebLinks(content) {
  const urls = new Set()
  for (const token of markdown.parse(content || '', {})) for (const child of token.children || []) {
    if (child.type === 'link_open' && webpageUrl(child.attrGet('href'))) urls.add(child.attrGet('href'))
  }
  return [...urls].slice(0, 30)
}
// 当前没有模型图片资源契约，保留替代文字，不触发模型输出中的外部图片请求。
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content)

export function renderAnswerBlocks(content, { beautifyLinks = false, linkMetadata = new Map() } = {}) {
  const environment = { linkMetadata }
  const blocks = []
  const tokens = markdown.parse(content || '', environment)
  if (beautifyLinks) decorateLinks(tokens, linkMetadata)
  for (const token of tokens) {
    if (token.level === 0 && token.nesting !== -1) blocks.push([])
    blocks[blocks.length - 1]?.push(token)
  }
  return blocks.map(block => markdown.renderer.render(block, markdown.options, environment))
}
