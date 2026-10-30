import { ref, watch } from 'vue'
import { readTreePins, writeTreePins } from '../services/treePins.js'

export function useTreePins(userId, trees, storage) {
  const pinnedIds = ref(new Set(readTreePins(userId, storage)))
  function setPinned(ids, pinned) {
    const available = new Set(trees.value.map(tree => tree.id))
    const next = new Set(pinnedIds.value)
    for (const id of ids) if (available.has(id)) pinned ? next.add(id) : next.delete(id)
    pinnedIds.value = next
    return writeTreePins(userId, next, storage)
  }
  // 只在真实目录被替换或删除成功时清理；加载失败不会覆盖既有目录。
  watch(trees, current => {
    const available = new Set(current.map(tree => tree.id))
    const next = new Set([...pinnedIds.value].filter(id => available.has(id)))
    if (next.size !== pinnedIds.value.size) { pinnedIds.value = next; writeTreePins(userId, next, storage) }
  })
  return { pinnedIds, setPinned }
}
