import { computed, ref, shallowRef } from 'vue'
import english from './en.js'

const storageKey = 'knowledge-accumulation.language'
function readLanguage() {
  try { return globalThis.localStorage?.getItem(storageKey) === 'en' ? 'en' : 'zh' }
  catch { return 'zh' }
}
export const locale = ref(readLanguage())
export function restoreLanguage() { locale.value = readLanguage() }
export function setLanguage(value) {
  if (!['zh', 'en'].includes(value)) return
  locale.value = value
  try { globalThis.localStorage?.setItem(storageKey, value) } catch { /* 存储受限时仍可切换当前界面。 */ }
}
const count = (value, singular, plural = `${singular}s`) => `${value} ${Number(value) === 1 ? singular : plural}`
const plurals = {
  '{value0} 个任务': p => count(p.value0, 'task'),
  '{value0} 条分支': p => count(p.value0, 'branch', 'branches'),
  '{value0} 个会话': p => count(p.value0, 'exploration'),
  '{value0} 个附件': p => count(p.value0, 'attachment'),
  '已收起 {value0} 个': p => `${p.value0} collapsed`,
  '{value0}后续 {value1} 个任务': p => `${p.value0} the next ${count(p.value1, 'task')}`,
  '{value0}后续 {value1} 个任务：{value2}': p => `${p.value0} the next ${count(p.value1, 'task')}: ${p.value2}`,
}

// 仅对前端固定文案调用；插入的后端字段、用户输入和 Markdown 原文不再翻译。
export function t(key, values = {}) {
  if (locale.value === 'en' && plurals[key]) return plurals[key](values)
  const message = locale.value === 'en' ? english[key] ?? key : key
  return message.replace(/\{(value\d+)\}/g, (match, name) => String(values[name] ?? match))
}

const uiMessage = Symbol('frontend-message')
export function uiText(key, values = {}) { return { [uiMessage]: true, key, values } }
function renderMessage(value) {
  if (value?.[uiMessage]) return t(value.key, value.values)
  if (value instanceof Error) return value.message
  if (Array.isArray(value)) return value.map(renderMessage).join(locale.value === 'en' ? '; ' : '；')
  return value ?? ''
}

// 保留前端文案的来源，使已显示的错误也能即时切换；服务端原始错误保持原文。
export class LocalizedError extends Error {
  constructor(message) {
    super()
    Object.defineProperty(this, 'message', { configurable: true, get: () => renderMessage(message) })
  }
}
export function localizedRef(initial = '') {
  const stored = shallowRef(initial)
  return computed({ get: () => renderMessage(stored.value), set: value => { stored.value = value } })
}
