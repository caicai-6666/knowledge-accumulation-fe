import { getCurrentInstance, onActivated, onDeactivated, onScopeDispose, ref, toValue, watch } from 'vue'
import { fetchPlatforms } from '../services/platforms.js'

export function usePlatforms(active, user, { loadPlatforms = fetchPlatforms, onAuthenticationExpired = () => {} } = {}) {
  const platforms = ref([])
  const status = ref('idle')
  const error = ref('')
  let controller
  let needsRefresh = true

  async function refresh() {
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    status.value = 'loading'
    error.value = ''
    try {
      const result = await loadPlatforms({ signal })
      if (signal.aborted) return
      platforms.value = result
      status.value = 'ready'
      needsRefresh = false
    } catch (failure) {
      if (signal.aborted) return
      platforms.value = []
      error.value = failure.message || '平台信息暂时无法加载，请重试'
      status.value = 'error'
      needsRefresh = true
      if (failure.status === 401) onAuthenticationExpired()
    }
  }

  watch([active, user], ([isActive, identity], previous) => {
    if (identity !== previous?.[1]) {
      controller?.abort()
      needsRefresh = true
      if (identity?.userid !== previous?.[1]?.userid) platforms.value = []
    }
    if (!isActive) {
      controller?.abort()
      if (status.value === 'loading') { status.value = 'idle'; needsRefresh = true }
      return
    }
    if (needsRefresh) refresh()
  }, { immediate: true })
  function pause() {
    controller?.abort()
    if (status.value === 'loading') { status.value = 'idle'; needsRefresh = true }
  }
  if (getCurrentInstance()) {
    onDeactivated(pause)
    onActivated(() => {
      if (toValue(active) && needsRefresh && status.value !== 'loading') refresh()
    })
  }
  onScopeDispose(pause)
  return { platforms, status, error, refresh }
}
