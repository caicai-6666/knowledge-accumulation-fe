import { isTreeId } from './explorationApi.js'

const prefix = 'knowledge-accumulation.tree-pins.v1:'
function browserStorage() { try { return globalThis.localStorage } catch { return null } }
function key(userId) { return typeof userId === 'string' && userId ? prefix + encodeURIComponent(userId) : null }
export function readTreePins(userId, storage = browserStorage()) {
  try {
    const name = key(userId)
    if (!name) return []
    const value = JSON.parse(storage?.getItem(name) || 'null')
    return value?.version === 1 && Array.isArray(value.ids) ? [...new Set(value.ids.filter(isTreeId))] : []
  } catch { return [] }
}
export function writeTreePins(userId, ids, storage = browserStorage()) {
  try {
    const name = key(userId)
    if (!name || !storage) return false
    storage.setItem(name, JSON.stringify({ version: 1, ids: [...new Set(ids)].filter(isTreeId) }))
    return true
  } catch { return false }
}
