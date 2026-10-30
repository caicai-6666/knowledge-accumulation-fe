import { nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'

const CHAT_MIN_WIDTH = 360
const TREE_MIN_WIDTH = 340
const KEYBOARD_STEP = 24
export const ASSISTANT_WIDTH_KEY = 'knowledge-accumulation.assistant.chat-width'
function browserStorage() { try { return globalThis.localStorage } catch { return null } }
function readWidth(storage) {
  try {
    const width = Number(storage?.getItem(ASSISTANT_WIDTH_KEY))
    if (Number.isInteger(width) && width >= CHAT_MIN_WIDTH && width <= 10000) return width
  } catch { /* 存储受限时沿用默认双栏比例。 */ }
  return null
}

export function useAssistantPanelResize(active, { storage = browserStorage() } = {}) {
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
  let preferredWidth = readWidth(storage)

  function rememberWidth(width) {
    preferredWidth = width === null ? null : Math.round(width)
    try {
      if (preferredWidth === null) storage?.removeItem(ASSISTANT_WIDTH_KEY)
      else storage?.setItem(ASSISTANT_WIDTH_KEY, String(preferredWidth))
    } catch { /* 持久化失败仍保留当前工作台的宽度偏好。 */ }
  }

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
    // 窄窗口只限制显示宽度，不改写用户偏好；放大或返回桌面后可恢复。
    if (!drag) chatWidth.value = preferredWidth === null ? null : clamp(preferredWidth)
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
    drag = { pointerId: event.pointerId, left: rect.left, offset: (chatElement.value?.getBoundingClientRect().right ?? event.clientX) - event.clientX, changed: false }
    event.currentTarget.setPointerCapture(event.pointerId)
    resizing.value = true
    event.preventDefault()
  }

  function moveResize(event) {
    if (!drag || event.pointerId !== drag.pointerId) return
    chatWidth.value = clamp(event.clientX - drag.left + drag.offset)
    displayedWidth.value = Math.round(chatWidth.value)
    drag.changed = true
  }

  function finishResize(event) {
    if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return
    const pointerId = drag.pointerId
    if (drag.changed) rememberWidth(chatWidth.value)
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
    rememberWidth(chatWidth.value)
  }

  async function resetWidth() {
    finishResize()
    rememberWidth(null)
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
