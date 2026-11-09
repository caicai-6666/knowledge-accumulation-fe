import { localizedRef, uiText } from '../i18n/index.js'
import { getCurrentInstance, onActivated, onDeactivated, onScopeDispose, ref, toValue, watch } from 'vue'
import { fetchPlatforms } from '../services/platforms.js'

export function usePlatforms(active, user, { loadPlatforms = fetchPlatforms, onAuthenticationExpired = () => {} } = {}) {
  const platforms = ref([])
  const status = ref('idle')
  const error = localizedRef('')
  const refreshing = ref(false)
  const hasLoaded = ref(false)
  let controller
  let needsRefresh = true

  async function refresh() {
    if (refreshing.value) return
    controller = new AbortController()
    const signal = controller.signal
    refreshing.value = true
    needsRefresh = true
    // 已成功读取的空目录也属于缓存，同用户复核不再替换成首屏加载状态。
    if (!hasLoaded.value) {
      status.value = 'loading'
      error.value = ''
    }
    try {
      const result = await loadPlatforms({ signal })
      if (signal.aborted) return
      platforms.value = result
      hasLoaded.value = true
      error.value = ''
      status.value = 'ready'
      needsRefresh = false
    } catch (failure) {
      if (signal.aborted) return
      if (failure.status === 401 || failure.status === 403) clearDirectory()
      if (failure.status === 401) {
        error.value = ''; status.value = 'idle'; needsRefresh = true
        onAuthenticationExpired()
        return
      }
      error.value = failure.message ? failure : uiText('平台信息暂时无法加载，请重试')
      status.value = 'error'
      needsRefresh = true
    } finally {
      if (controller?.signal === signal) {
        controller = undefined
        refreshing.value = false
      }
    }
  }

  function clearDirectory() {
    platforms.value = []
    hasLoaded.value = false
    status.value = 'idle'
    error.value = ''
  }

  watch([active, user], ([isActive, identity], previous) => {
    if (identity !== previous?.[1]) {
      pause()
      needsRefresh = true
      if (identity?.userid !== previous?.[1]?.userid) clearDirectory()
    }
    if (!isActive) {
      pause()
      return
    }
    if (needsRefresh) refresh()
  }, { immediate: true })
  function pause() {
    controller?.abort()
    controller = undefined
    refreshing.value = false
    if (status.value === 'loading') { status.value = 'idle'; needsRefresh = true }
  }
  if (getCurrentInstance()) {
    onDeactivated(pause)
    onActivated(() => {
      if (toValue(active) && needsRefresh) refresh()
    })
  }
  onScopeDispose(pause)
  return { platforms, status, error, refreshing, hasLoaded, refresh }
}
