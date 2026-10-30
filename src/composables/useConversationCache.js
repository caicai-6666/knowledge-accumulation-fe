import { computed, onScopeDispose, ref, reactive, shallowRef, watch } from 'vue'
import { createConversationCache } from '../services/conversationCache.js'
import { createConversationRecord, isCurrentConversation } from '../models/conversationSearch.js'
import { normalizeExplorationTree } from '../models/explorationTree.js'

export function useConversationCache({ userId, active, loadTree, onAuthenticationExpired, storage = createConversationCache() }) {
  const records = shallowRef(new Map()), catalog = shallowRef(new Map())
  const indexing = ref(false), memoryOnly = ref(false), failed = reactive(new Map())
  const requests = new Map()
  let disposed = false, initialized = false, blocked = false, pumping = false, rerun = false
  const ready = computed(() => [...catalog.value.values()].filter(tree => isCurrentConversation(records.value.get(tree.id), tree)).length)
  const status = computed(() => ({ indexing: indexing.value, ready: ready.value, total: catalog.value.size, memoryOnly: memoryOnly.value, failed: failed.size > 0 }))
  const initialization = userId ? storage.read(userId).then(cached => {
    if (!disposed) records.value = new Map([...cached.map(record => [record.id, record]), ...records.value])
  }).catch(() => { if (!disposed) memoryOnly.value = true }) : Promise.resolve()
  async function persist(record) {
    try { await storage.write(userId, record) } catch { if (!disposed) memoryOnly.value = true }
  }
  function remember(tree) {
    if (disposed || !userId) return
    const record = createConversationRecord(tree)
    if (!catalog.value.has(record.id)) return
    records.value = new Map(records.value).set(record.id, record)
    failed.delete(record.id)
    void persist(record)
  }
  async function pump() {
    if (pumping) { rerun = true; return }
    if (!initialized || disposed || blocked || !active() || !userId) return
    pumping = true; indexing.value = true
    try {
      await initialization
      do {
        rerun = false
        const missing = [...catalog.value.values()].filter(tree => !isCurrentConversation(records.value.get(tree.id), tree) && failed.get(tree.id) !== tree.updatedAt)
        let next = 0
        async function worker() {
          while (next < missing.length && !disposed && active() && !blocked) {
            const metadata = missing[next++]
            if (isCurrentConversation(records.value.get(metadata.id), metadata)) continue
            const controller = new AbortController()
            requests.set(metadata.id, controller)
            try {
              const payload = await loadTree(metadata.id, { signal: controller.signal })
              if (controller.signal.aborted || disposed || catalog.value.get(metadata.id)?.updatedAt !== metadata.updatedAt) continue
              const tree = normalizeExplorationTree(payload)
              if (tree.id !== metadata.id) throw new Error('Conversation cache tree mismatch')
              remember(tree)
            } catch (error) {
              if (controller.signal.aborted || disposed) continue
              if (error.status === 401) {
                blocked = true; requests.forEach(request => request.abort()); onAuthenticationExpired()
              } else failed.set(metadata.id, metadata.updatedAt)
            } finally { if (requests.get(metadata.id) === controller) requests.delete(metadata.id) }
          }
        }
        await Promise.all([worker(), worker()])
      } while (rerun && !disposed && active() && !blocked)
    } finally { pumping = false; if (!disposed) indexing.value = false }
  }
  async function syncCatalog(list, { retry = false } = {}) {
    if (disposed || !userId) return
    initialized = true
    if (blocked || retry) failed.clear()
    blocked = false
    catalog.value = new Map(list.map(item => [item.id, { id: item.id, title: item.name, updatedAt: item.updated_at }]))
    for (const id of failed.keys()) if (!catalog.value.has(id)) failed.delete(id)
    for (const [id, controller] of requests) if (!catalog.value.has(id)) controller.abort()
    await initialization
    if (disposed) return
    const obsolete = [...records.value.keys()].filter(id => !catalog.value.has(id))
    if (obsolete.length) {
      const next = new Map(records.value); obsolete.forEach(id => next.delete(id)); records.value = next
      try { await storage.remove(userId, obsolete) } catch { if (!disposed) memoryOnly.value = true }
    }
    void pump()
  }
  function remove(id) {
    requests.get(id)?.abort()
    const next = new Map(records.value); next.delete(id); records.value = next
    const current = new Map(catalog.value); current.delete(id); catalog.value = current
    failed.delete(id)
    void initialization.then(() => { const next = new Map(records.value); next.delete(id); records.value = next; return storage.remove(userId, [id]) }).catch(() => { if (!disposed) memoryOnly.value = true })
  }
  function retry() { failed.clear(); blocked = false; void pump() }
  function visibilityChanged() {
    if (active()) void pump()
    else requests.forEach(request => request.abort())
  }
  watch(active, visibilityChanged)
  onScopeDispose(() => { disposed = true; requests.forEach(request => request.abort()); requests.clear(); records.value = new Map(); storage.close?.() })
  return { records, status, remember, syncCatalog, remove, retry, visibilityChanged }
}
