import { isTreeId } from './explorationApi.js'

const prefix = 'knowledge-accumulation.exploration-status.v1:'
const lifetime = 30 * 24 * 60 * 60 * 1000
const limit = 200
const messageKey = value => typeof value === 'string' && /^[a-f0-9]{32}:[a-f0-9]{32}$/.test(value)
const signatureValue = value => typeof value === 'string' && /^[a-f0-9]{16}$/.test(value)
function browserStorage() { try { return globalThis.localStorage } catch { return null } }
function cacheKey(userId) { return typeof userId === 'string' && userId ? prefix + encodeURIComponent(userId) : null }

// 只缓存内容指纹，用于相等判断；不存储问题、答案、附件或凭据。
export function finalMessageSignature(text) {
  let left = 0x811c9dc5, right = 0x9e3779b9
  for (let index = 0; index < text.length; index++) {
    left = Math.imul(left ^ text.charCodeAt(index), 0x01000193)
    right = Math.imul(right ^ text.charCodeAt(index), 0x85ebca6b)
  }
  return [left, right].map(value => (value >>> 0).toString(16).padStart(8, '0')).join('')
}
function signatures(entries, baseline = false) {
  if (!Array.isArray(entries)) return []
  return entries.slice(-200).filter(entry => Array.isArray(entry) && messageKey(entry[0]) && (baseline
    ? isTreeId(entry[1]?.nodeId) && entry[1].nodeId === entry[0].split(':')[0] && signatureValue(entry[1].signature)
    : signatureValue(entry[1])))
}
export function readTreeStatusCache(userId, storage = browserStorage()) {
  try {
    const key = cacheKey(userId)
    if (!key) return []
    const value = JSON.parse(storage?.getItem(key) || 'null')
    if (!value || value.version !== 1 || !Number.isFinite(value.savedAt) || Date.now() - value.savedAt > lifetime || !Array.isArray(value.trees)) return []
    return value.trees.slice(-limit).filter(tree => isTreeId(tree?.id) && typeof tree.running === 'boolean').map(tree => ({
      id: tree.id, running: tree.running,
      unread: Array.isArray(tree.unread) ? tree.unread.filter(isTreeId).slice(-200) : [],
      baseline: Array.isArray(tree.baseline) ? signatures(tree.baseline, true) : null,
      read: signatures(tree.read),
    }))
  } catch { return [] }
}
export function writeTreeStatusCache(userId, trees, storage = browserStorage()) {
  try {
    const key = cacheKey(userId)
    if (key) storage?.setItem(key, JSON.stringify({ version: 1, savedAt: Date.now(), trees: trees.slice(-limit) }))
  } catch { /* 存储受限或额度不足时，当前页面的状态追踪继续工作。 */ }
}
