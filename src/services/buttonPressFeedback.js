// 使用独立 scale 动画，避免覆盖按钮原有的定位、旋转和抽屉过渡。
export function installButtonPressFeedback({ document = globalThis.document, window = globalThis.window } = {}) {
  if (!document || !window) return () => {}
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  const animations = new Map(), presses = new Map()
  const selector = 'button, a[href].platform-detail__entry, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]'
  const excluded = '.workspace__drawer-dismiss, .conversation-context__dismiss, .assistant-workspace__resize-handle'
  function buttonFor(target) {
    const button = target?.closest?.(selector)
    if (!button || button.matches(excluded) || button.matches(':disabled, [aria-disabled="true"]') || button.closest('[inert]')) return null
    return button
  }
  function animate(button, frames, options) {
    if (typeof button.animate !== 'function') return
    const animation = button.animate(frames, options)
    animations.set(button, animation)
    animation.onfinish = () => {
      if (animations.get(button) !== animation) return
      if (options.fill !== 'forwards') { animation.cancel(); animations.delete(button) }
    }
  }
  function scaleOf(button) {
    const value = Number.parseFloat(window.getComputedStyle(button).scale)
    return Number.isFinite(value) ? value : 1
  }
  function press(button, key) {
    if (!button || reducedMotion?.matches || presses.has(key)) return
    const scale = scaleOf(button)
    animations.get(button)?.cancel()
    presses.set(key, button)
    animate(button, [{ scale }, { scale: .94 }], { duration: 90, easing: 'ease-out', fill: 'forwards' })
  }
  function release(key, cancelled = false) {
    const button = presses.get(key)
    if (!button) return
    presses.delete(key)
    const scale = scaleOf(button)
    animations.get(button)?.cancel()
    animations.delete(button)
    if (cancelled || !button.isConnected || reducedMotion?.matches) return
    animate(button, [{ scale }, { scale: 1.025, offset: .6 }, { scale: 1 }], { duration: 280, easing: 'ease-out' })
  }
  function pointerDown(event) { if (event.button === 0 && event.isPrimary !== false) press(buttonFor(event.target), event.pointerId) }
  function pointerUp(event) { release(event.pointerId) }
  function pointerCancel(event) { release(event.pointerId, true) }
  function keyDown(event) { if (!event.repeat && ['Enter', ' '].includes(event.key)) press(buttonFor(event.target), event.key) }
  function keyUp(event) { if (['Enter', ' '].includes(event.key)) release(event.key) }
  function clear() { presses.clear(); animations.forEach(animation => animation.cancel()); animations.clear() }
  function visibilityChanged() { if (document.hidden) clear() }
  const listenerOptions = { capture: true }
  const listeners = [
    [document, 'pointerdown', pointerDown], [window, 'pointerup', pointerUp],
    [window, 'pointercancel', pointerCancel], [document, 'keydown', keyDown], [window, 'keyup', keyUp],
    [window, 'blur', clear], [window, 'pagehide', clear], [document, 'visibilitychange', visibilityChanged],
  ]
  listeners.forEach(([target, type, handler]) => target.addEventListener(type, handler, listenerOptions))
  reducedMotion?.addEventListener?.('change', clear)
  return () => {
    clear()
    listeners.forEach(([target, type, handler]) => target.removeEventListener(type, handler, listenerOptions))
    reducedMotion?.removeEventListener?.('change', clear)
  }
}
