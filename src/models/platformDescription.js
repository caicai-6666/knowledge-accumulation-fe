import MarkdownIt from 'markdown-it'

// 描述只开放约定的排版语法，不执行 HTML，也不加载远程图片。
const markdown = new MarkdownIt('zero', { html: false, breaks: true, linkify: false })
  .enable(['heading', 'list', 'emphasis', 'backticks', 'link', 'newline', 'escape', 'entity'])

// 平台名称已是页面 h2；描述中的标题从 h3 开始，避免破坏页面层级。
for (const type of ['heading_open', 'heading_close']) {
  markdown.renderer.rules[type] = (tokens, index) => {
    const tag = Number(tokens[index].tag.slice(1)) <= 3 ? 'h3' : 'h4'
    return type === 'heading_open' ? `<${tag}>` : `</${tag}>\n`
  }
}

export function renderPlatformDescription(description) {
  return typeof description === 'string' && description.trim()
    ? markdown.render(description) : ''
}
