import { isTreeId } from './explorationApi.js'

const prefix = 'knowledge-accumulation.tree-positions.v1:'
const limit = 200
function browserStorage() { try { return globalThis.localStorage } catch { return null } }

// 只保存每棵树最后查看的任务 ID，真实节点与上下文仍由打开接口确认。
export function createTreePositionCache(userId, storage = browserStorage()) {
  const key = typeof userId === 'string' && userId ? prefix + encodeURIComponent(userId) : null
  const positions = new Map()
  try {
    const saved = key && JSON.parse(storage?.getItem(key) || 'null')
    if (saved?.version === 1 && Array.isArray(saved.positions)) {
      for (const item of saved.positions.slice(-limit)) {
        if (isTreeId(item?.treeId) && isTreeId(item.nodeId)) positions.set(item.treeId, item.nodeId)
      }
    }
  } catch { /* 缓存损坏或存储受限时，从本次访问的内存状态开始。 */ }
  function save() {
    try {
      if (key) storage?.setItem(key, JSON.stringify({ version: 1, positions: [...positions].map(([treeId, nodeId]) => ({ treeId, nodeId })) }))
    } catch { /* 持久化失败不影响本次访问中的位置恢复。 */ }
  }
  return {
    get: treeId => positions.get(treeId),
    remember(treeId, nodeId) {
      if (!isTreeId(treeId) || !isTreeId(nodeId) || positions.get(treeId) === nodeId) return
      positions.delete(treeId); positions.set(treeId, nodeId)
      if (positions.size > limit) positions.delete(positions.keys().next().value)
      save()
    },
    remove(treeId) { if (positions.delete(treeId)) save() },
    retain(ids) {
      let changed = false
      for (const id of positions.keys()) if (!ids.has(id)) { positions.delete(id); changed = true }
      if (changed) save()
    },
  }
}
