import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'

export function useMobileLayout() {
  const query = typeof window !== 'undefined' ? window.matchMedia?.('(max-width: 900px)') : null
  const mobile = ref(Boolean(query?.matches))
  const viewportHeight = ref(0)
  const viewportTop = ref(0)
  let listening = false
  let frame = 0
  function measure() {
    mobile.value = Boolean(query?.matches)
    const height = window.visualViewport?.height || window.innerHeight
    if (height > 0) viewportHeight.value = Math.round(height)
    viewportTop.value = Math.max(0, Math.round(window.visualViewport?.offsetTop || 0))
  }
  function scheduleMeasure() {
    if (!window.requestAnimationFrame) { measure(); return }
    if (frame) return
    frame = window.requestAnimationFrame(() => { frame = 0; if (listening) measure() })
  }
  function resume() {
    measure()
    if (listening) return
    listening = true
    query?.addEventListener('change', scheduleMeasure)
    window.visualViewport?.addEventListener('resize', scheduleMeasure)
    window.visualViewport?.addEventListener('scroll', scheduleMeasure)
    window.addEventListener('resize', scheduleMeasure)
  }
  function pause() {
    listening = false
    if (frame) window.cancelAnimationFrame(frame)
    frame = 0
    query?.removeEventListener('change', scheduleMeasure)
    window.visualViewport?.removeEventListener('resize', scheduleMeasure)
    window.visualViewport?.removeEventListener('scroll', scheduleMeasure)
    window.removeEventListener('resize', scheduleMeasure)
  }
  onMounted(resume)
  onActivated(resume)
  onDeactivated(pause)
  onBeforeUnmount(pause)
  return { mobile, viewportHeight, viewportTop }
}
