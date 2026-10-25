import { nextTick, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'

export function useSideDrawer({ enabled, active }) {
  const dialog = ref(null), content = ref(null), trigger = ref(null)
  const open = ref(false), visible = ref(false)
  let revision = 0, frame = 0, closeTimer = 0
  function clearTransition() {
    if (frame) cancelAnimationFrame(frame)
    clearTimeout(closeTimer)
    frame = 0; closeTimer = 0
  }
  function forceClose() {
    ++revision
    clearTransition()
    open.value = false
    visible.value = false
    if (dialog.value?.open) dialog.value.close()
  }
  function show() { if (enabled() && active()) open.value = true }
  function close() { open.value = false }
  watch([open, enabled, active], async ([requested, available, running]) => {
    const current = ++revision
    clearTransition()
    if (!available || !running) { forceClose(); return }
    await nextTick()
    if (current !== revision || !dialog.value) return
    const element = dialog.value
    if (requested) {
      // 打开树图时收起软键盘，不让抽屉跟随输入框的键盘高度。
      if (['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName)) document.activeElement.blur()
      if (!element.open) element.showModal()
      frame = requestAnimationFrame(() => {
        frame = 0
        if (current !== revision) return
        visible.value = true
        element.querySelector('[data-drawer-close]')?.focus({ preventScroll: true })
      })
    } else {
      visible.value = false
      if (!element.open) return
      const finish = () => {
        if (current !== revision) return
        element.close()
        if (trigger.value?.isConnected) trigger.value.focus({ preventScroll: true })
      }
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish()
      else closeTimer = setTimeout(finish, 260)
    }
  }, { immediate: true })
  onDeactivated(forceClose)
  onBeforeUnmount(forceClose)
  return { dialog, content, trigger, open, visible, show, close, forceClose }
}
