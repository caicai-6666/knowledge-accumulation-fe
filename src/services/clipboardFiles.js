import { t } from '../i18n/index.js'
const imageExtensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/avif': 'avif' }

export function clipboardFiles(clipboard) {
  if (!clipboard) return []
  // items 和 files 通常表示同一批文件，不合并两者，避免粘贴出重复附件。
  const items = Array.from(clipboard.items || []).filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(Boolean)
  const files = items.length ? items : Array.from(clipboard.files || [])
  return files.map((file, index) => {
    const extension = imageExtensions[file.type]
    const name = typeof file.name === 'string' ? file.name : ''
    if (!extension || /\.[^./]+$/.test(name)) return file
    return new File([file], `${name.trim() || t('粘贴图片-{value0}', { value0: index + 1 })}.${extension}`, { type: file.type, lastModified: file.lastModified })
  })
}
