import { computed, onDeactivated, onScopeDispose, ref, watch } from 'vue'

const THRESHOLD = 64
const MIN_LOADING_MS = 1000

export function usePullToRefresh(target, { active, disabled, refresh, onPull = () => {} }) {
  const distance = ref(0), pulling = ref(false), refreshing = ref(false), failed = ref(false)
  const progress = computed(() => refreshing.value ? 1 : Math.min(1, distance.value / THRESHOLD))
  let gesture = null, revision = 0, suppressClick = false
  let loadingTimer = 0, finishMinimum = null
  function clearMinimum() {
    clearTimeout(loadingTimer); loadingTimer = 0
    finishMinimum?.(); finishMinimum = null
  }
  function cancelGesture() { gesture = null; pulling.value = false; distance.value = refreshing.value ? 48 : 0 }
  function reset() { revision++; clearMinimum(); refreshing.value = false; failed.value = false; suppressClick = false; cancelGesture() }
  async function refreshNow() {
    if (!active() || disabled() || refreshing.value) return
    const version = ++revision
    refreshing.value = true; pulling.value = false; failed.value = false; distance.value = 48
    // 最短展示时间与请求并行，慢请求结束后无需再额外等待一秒。
    const minimum = new Promise(resolve => {
      finishMinimum = resolve
      loadingTimer = setTimeout(() => { loadingTimer = 0; finishMinimum = null; resolve() }, MIN_LOADING_MS)
    })
    let unsuccessful = false
    try { unsuccessful = await refresh() === false }
    catch { unsuccessful = true }
    finally {
      await minimum
      if (version === revision) {
        failed.value = active() && unsuccessful
        refreshing.value = false; distance.value = 0
      }
    }
  }
  watch(target, (element, _previous, cleanup) => {
    if (!element) return
    const options = { passive: false }
    function start(event) {
      cancelGesture(); suppressClick = false
      if (!active() || disabled() || refreshing.value || element.scrollTop > 0 || event.touches.length !== 1) return
      if (element.ownerDocument.querySelector('dialog[open]') || event.target.closest?.('input, textarea, select, a, .tree-select__action')) return
      const touch = event.touches[0]
      gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY }
    }
    function move(event) {
      if (!gesture) return
      if (!active() || disabled() || event.touches.length !== 1 || element.scrollTop > 0) { cancelGesture(); return }
      const touch = event.touches[0]
      if (touch.identifier !== gesture.id) { cancelGesture(); return }
      const x = touch.clientX - gesture.x, y = touch.clientY - gesture.y
      if (!pulling.value) {
        if (y < -8 || Math.abs(x) > 8 && Math.abs(x) > Math.abs(y)) { cancelGesture(); return }
        if (y < 8 || y < Math.abs(x) * 1.25) return
        if (!event.cancelable) { cancelGesture(); return }
        pulling.value = true; failed.value = false
        onPull()
      }
      if (event.cancelable) event.preventDefault()
      // 短棒拉满即触发；消费当前手势，继续拖动或松手都不重复请求。
      distance.value = Math.min(96, Math.max(0, y * .5))
      if (distance.value >= THRESHOLD) {
        gesture = null; suppressClick = true
        void refreshNow()
      }
    }
    function end(event) {
      if (!gesture) return
      if (event.touches.length) { cancelGesture(); return }
      const claimed = pulling.value
      gesture = null
      if (claimed) {
        suppressClick = true
        if (event.cancelable) event.preventDefault()
      }
      cancelGesture()
    }
    function guardClick(event) {
      if (!suppressClick || event.detail === 0) return
      suppressClick = false; event.preventDefault(); event.stopPropagation()
    }
    element.addEventListener('touchstart', start, options)
    element.addEventListener('touchmove', move, options)
    element.addEventListener('touchend', end, options)
    element.addEventListener('touchcancel', cancelGesture, options)
    element.addEventListener('click', guardClick, true)
    cleanup(() => {
      cancelGesture()
      element.removeEventListener('touchstart', start, options)
      element.removeEventListener('touchmove', move, options)
      element.removeEventListener('touchend', end, options)
      element.removeEventListener('touchcancel', cancelGesture, options)
      element.removeEventListener('click', guardClick, true)
    })
  }, { flush: 'post' })
  watch(active, available => { if (!available) reset() })
  onDeactivated(reset)
  onScopeDispose(reset)
  return { distance, pulling, refreshing, failed, progress, refreshNow }
}
