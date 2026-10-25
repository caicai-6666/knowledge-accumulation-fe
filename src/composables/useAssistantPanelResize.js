import { nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'

const CHAT_MIN_WIDTH = 360
const TREE_MIN_WIDTH = 340
const KEYBOARD_STEP = 24

export function useAssistantPanelResize(active) {
  const workspaceElement = ref(null)
  const chatElement = ref(null)
  const resizeHandle = ref(null)
  const chatWidth = ref(null)
  const displayedWidth = ref(0)
  const bounds = ref({ min: CHAT_MIN_WIDTH, max: CHAT_MIN_WIDTH })
  const resizing = ref(false)
  const stacked = ref(Boolean(typeof window !== 'undefined' && window.matchMedia?.('(max-width: 900px)').matches))
  let observer
  let measureFrame = 0
  let drag = null

  function clamp(width) { return Math.min(bounds.value.max, Math.max(bounds.value.min, width)) }

  function measure() {
    const rect = workspaceElement.value?.getBoundingClientRect()
    if (!rect?.width) return
    const nextStacked = window.matchMedia('(max-width: 900px)').matches || rect.width < CHAT_MIN_WIDTH + TREE_MIN_WIDTH
    if (nextStacked !== stacked.value) {
      stacked.value = nextStacked
      finishResize()
      void nextTick(measure)
      return
    }
    if (stacked.value) { finishResize(); return }
    bounds.value = { min: CHAT_MIN_WIDTH, max: rect.width - TREE_MIN_WIDTH }
    if (chatWidth.value !== null) chatWidth.value = clamp(chatWidth.value)
    displayedWidth.value = Math.round(chatWidth.value ?? chatElement.value?.getBoundingClientRect().width ?? CHAT_MIN_WIDTH)
  }

  function scheduleMeasure() {
    if (measureFrame) cancelAnimationFrame(measureFrame)
    measureFrame = requestAnimationFrame(() => { measureFrame = 0; measure() })
  }

  function startResize(event) {
    if (event.button !== 0 || drag) return
    measure()
    if (stacked.value || !workspaceElement.value) return
    const rect = workspaceElement.value.getBoundingClientRect()
    drag = { pointerId: event.pointerId, left: rect.left, offset: (chatElement.value?.getBoundingClientRect().right ?? event.clientX) - event.clientX }
    event.currentTarget.setPointerCapture(event.pointerId)
    resizing.value = true
    event.preventDefault()
  }

  function moveResize(event) {
    if (!drag || event.pointerId !== drag.pointerId) return
    chatWidth.value = clamp(event.clientX - drag.left + drag.offset)
    displayedWidth.value = Math.round(chatWidth.value)
  }

  function finishResize(event) {
    if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return
    const pointerId = drag.pointerId
    drag = null
    resizing.value = false
    if (resizeHandle.value?.hasPointerCapture(pointerId)) resizeHandle.value.releasePointerCapture(pointerId)
  }

  function resizeWithKeyboard(event) {
    measure()
    if (stacked.value) return
    const width = chatWidth.value ?? displayedWidth.value
    const targets = { ArrowLeft: width - KEYBOARD_STEP, ArrowRight: width + KEYBOARD_STEP, Home: bounds.value.min, End: bounds.value.max }
    if (!(event.key in targets)) return
    event.preventDefault()
    chatWidth.value = clamp(targets[event.key])
    displayedWidth.value = Math.round(chatWidth.value)
  }

  async function resetWidth() {
    finishResize()
    chatWidth.value = null
    await nextTick()
    measure()
  }

  function handleWindowResize() { finishResize(); scheduleMeasure() }
  watch(active, async visible => {
    if (!visible) finishResize()
    else { await nextTick(); measure() }
  })
  function resume() {
    observer?.disconnect()
    measure()
    observer = new ResizeObserver(scheduleMeasure)
    if (workspaceElement.value) observer.observe(workspaceElement.value)
    window.addEventListener('resize', handleWindowResize)
    window.addEventListener('blur', finishResize)
  }
  function pause() {
    finishResize()
    observer?.disconnect()
    if (measureFrame) cancelAnimationFrame(measureFrame)
    measureFrame = 0
    window.removeEventListener('resize', handleWindowResize)
    window.removeEventListener('blur', finishResize)
  }
  onMounted(resume)
  onActivated(resume)
  onDeactivated(pause)
  onBeforeUnmount(pause)

  return { workspaceElement, chatElement, resizeHandle, chatWidth, displayedWidth, bounds, resizing, stacked, startResize, moveResize, finishResize, resizeWithKeyboard, resetWidth }
}
