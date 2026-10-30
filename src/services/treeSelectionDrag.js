// 从选择圆圈起笔，沿列表涂选；同一手势始终使用起点决定的勾选/取消方向。
export function installTreeSelectionDrag(list, { enabled, items, selected, change,
  window = list.ownerDocument.defaultView,
  requestFrame = callback => window.requestAnimationFrame(callback), cancelFrame = id => window.cancelAnimationFrame(id),
}) {
  const document = list.ownerDocument
  const options = { capture: true, passive: false }
  let gesture = null, frame = null, previousTime = null, suppressClick = false
  function finish() {
    const previous = gesture
    gesture = null
    if (frame !== null) cancelFrame(frame)
    frame = null; previousTime = null
    if (previous) { try { list.releasePointerCapture?.(previous.pointerId) } catch { /* 指针已被浏览器取消。 */ } }
  }
  function paint(index) {
    if (!gesture || index === null || index < 0) return
    let changed = false
    for (let offset = Math.min(gesture.lastIndex, index); offset <= Math.max(gesture.lastIndex, index); offset++) {
      const id = gesture.ids[offset]
      if (gesture.visited.has(id)) continue
      gesture.visited.add(id)
      if (gesture.selecting && !gesture.values.has(id)) { gesture.values.add(id); changed = true }
      else if (!gesture.selecting && gesture.values.has(id)) { gesture.values.delete(id); changed = true }
    }
    gesture.lastIndex = index
    if (changed) change(new Set(gesture.values))
  }
  function indexAt(y) {
    if (!gesture) return null
    const bounds = list.getBoundingClientRect()
    const position = Math.max(bounds.top + 1, Math.min(bounds.bottom - 1, y))
    let nearest = null, distance = Infinity
    for (const row of list.querySelectorAll('[data-tree-selection-id]')) {
      const rect = row.getBoundingClientRect()
      if (rect.bottom <= bounds.top || rect.top >= bounds.bottom || !rect.height) continue
      const index = gesture.indices.get(row.getAttribute('data-tree-selection-id'))
      if (index === undefined) continue
      const next = Math.abs((rect.top + rect.bottom) / 2 - position)
      if (next < distance) { distance = next; nearest = index }
    }
    return nearest
  }
  function edgeSpeed() {
    if (!gesture || !gesture.moved) return 0
    const bounds = list.getBoundingClientRect(), edge = Math.min(36, bounds.height / 4)
    if (gesture.y < bounds.top + edge) return -Math.min(1, (bounds.top + edge - gesture.y) / edge)
    if (gesture.y > bounds.bottom - edge) return Math.min(1, (gesture.y - bounds.bottom + edge) / edge)
    return 0
  }
  function scroll(time) {
    frame = null
    if (!gesture || !enabled() || document.hidden) { finish(); return }
    const elapsed = previousTime === null ? 16 : Math.min(32, Math.max(0, time - previousTime))
    previousTime = time
    const speed = edgeSpeed(), before = list.scrollTop
    const y = gesture.y
    list.scrollTop += Math.round(speed * .6 * elapsed)
    if (!gesture) return
    paint(indexAt(y))
    if (gesture && speed && before !== list.scrollTop) frame = requestFrame(scroll)
    else previousTime = null
  }
  function scheduleScroll() { if (frame === null && edgeSpeed()) frame = requestFrame(scroll) }
  function down(event) {
    if (event.isPrimary === false) { finish(); return }
    if (gesture) { if (event.pointerId !== gesture.pointerId) finish(); return }
    suppressClick = false
    if (!enabled() || event.button !== 0 || event.isPrimary === false) return
    const circle = event.target.closest?.('.tree-select__selection-circle')
    const row = circle?.closest('[data-tree-selection-id]')
    if (!row || !list.contains(row) || row.disabled) return
    const ids = items(), index = ids.indexOf(row.getAttribute('data-tree-selection-id'))
    if (index < 0) return
    const values = new Set(selected())
    gesture = { ids, indices: new Map(ids.map((id, position) => [id, position])), values,
      pointerId: event.pointerId, selecting: !values.has(ids[index]), visited: new Set(), lastIndex: index,
      startX: event.clientX, startY: event.clientY, y: event.clientY, moved: false }
    suppressClick = true
    if (event.cancelable) event.preventDefault()
    try { list.setPointerCapture?.(event.pointerId) } catch { /* 全局监听仍能接收后续指针事件。 */ }
    paint(index)
  }
  function move(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return
    if (!enabled() || Math.abs(event.clientX - gesture.startX) > 48) { finish(); return }
    if (event.cancelable) event.preventDefault()
    gesture.y = event.clientY
    gesture.moved ||= Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) >= 6
    paint(indexAt(gesture.y)); scheduleScroll()
  }
  function up(event) { if (gesture?.pointerId === event.pointerId) finish() }
  function otherDown(event) { if (gesture && event.pointerId !== gesture.pointerId) finish() }
  function click(event) {
    if (!suppressClick || event.detail === 0) return
    suppressClick = false
    event.preventDefault(); event.stopImmediatePropagation()
  }
  function onScroll() { if (gesture) paint(indexAt(gesture.y)) }
  function hidden() { if (document.hidden) finish() }
  const listeners = [[window, 'pointerdown', otherDown], [list, 'pointerdown', down], [window, 'pointermove', move], [window, 'pointerup', up],
    [window, 'pointercancel', up], [list, 'lostpointercapture', up], [list, 'click', click],
    [list, 'scroll', onScroll], [window, 'blur', finish], [document, 'visibilitychange', hidden]]
  listeners.forEach(([target, type, handler]) => target.addEventListener(type, handler, options))
  return {
    cancel: finish,
    dispose() { finish(); suppressClick = false; listeners.forEach(([target, type, handler]) => target.removeEventListener(type, handler, options)) },
  }
}
