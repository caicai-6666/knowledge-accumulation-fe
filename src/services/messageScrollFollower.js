export function createMessageScrollFollower(list, content) {
  let active = true
  let savedTop = list.scrollTop
  let following = true
  let frame = 0
  let lastTop = list.scrollTop
  let touchY = null
  let pinnedMessage = null
  let layoutHold = false
  let layoutHoldTimer = null
  let statusTransition = null
  const listeners = []
  const atBottom = () => list.scrollHeight - list.clientHeight - list.scrollTop <= 2
  function pause() {
    following = false
    statusTransition = null
    cancelAnimationFrame(frame)
    frame = 0
  }
  function schedule() {
    if (!active || layoutHold) return
    updatePinnedHeight()
    if (!following || frame) return
    frame = requestAnimationFrame((now) => {
      frame = 0
      if (!active || !following || layoutHold) return
      // 新状态先占位再淡入，直接追到底部会使所有已显示内容瞬间上移。
      // 仅在状态切换期间缓动；正文增量仍按实际渲染高度跟随。
      if (statusTransition) {
        statusTransition.startedAt ??= now
        const progress = Math.min(1, (now - statusTransition.startedAt) / 380)
        const target = Math.max(0, list.scrollHeight - list.clientHeight)
        list.scrollTop = statusTransition.top + (target - statusTransition.top) * (1 - (1 - progress) ** 3)
        if (progress === 1) statusTransition = null
      } else list.scrollTop = list.scrollHeight
      lastTop = list.scrollTop
      if (statusTransition) schedule()
    })
  }
  function resume() { following = true; schedule() }
  function transitionStatus() {
    if (!active || !following || layoutHold || statusTransition) return
    statusTransition = { top: list.scrollTop, startedAt: null }
    schedule()
  }
  function holdLayout() {
    statusTransition = null
    layoutHold = true
    clearTimeout(layoutHoldTimer)
    cancelAnimationFrame(frame)
    frame = 0
    // 过程区动画为 420ms；手动展开不作为新的流式输出，也不改变原跟随状态。
    layoutHoldTimer = setTimeout(() => {
      layoutHold = false
      lastTop = list.scrollTop
      // 不补滚到末尾，等待之后真正的内容更新或用户滚动。
    }, 500)
  }
  function updatePinnedHeight() {
    if (!pinnedMessage?.isConnected) return
    // 只预留新问题以下的一屏；回复逐渐填满该区域，而不是在回复后再追加一屏空白。
    const height = Math.max(list.clientHeight, pinnedMessage.offsetTop + list.clientHeight - 24)
    content.style.setProperty('--message-pinned-height', `${height}px`)
  }
  function clearPin() {
    if (!pinnedMessage) return
    pinnedMessage = null
    content.classList.remove('is-question-pinned')
    content.style.removeProperty('--message-pinned-height')
  }
  function pin(message, { follow = true } = {}) {
    if (!message) return
    pause()
    pinnedMessage = message
    content.classList.add('is-question-pinned')
    updatePinnedHeight()
    list.scrollTop = Math.max(0, message.offsetTop - 24)
    lastTop = list.scrollTop
    if (follow) resume()
  }
  function listen(type, handler) {
    const guarded = event => { if (active) handler(event) }
    list.addEventListener(type, guarded, { passive: true })
    listeners.push([type, guarded])
  }
  listen('scroll', () => {
    const top = list.scrollTop
    if (layoutHold) { lastTop = top; return }
    if (top < lastTop && !atBottom()) pause()
    else if (top >= lastTop && atBottom()) following = true
    lastTop = top
  })
  listen('wheel', (event) => { if (event.deltaY < 0) pause() })
  listen('touchstart', (event) => { touchY = event.touches[0]?.clientY ?? null })
  listen('touchmove', (event) => {
    const nextY = event.touches[0]?.clientY
    if (touchY !== null && nextY > touchY) pause()
    touchY = nextY ?? null
  })
  listen('keydown', (event) => {
    if (event.target !== list) return
    if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey)) pause()
  })
  const observer = new ResizeObserver(schedule)
  observer.observe(content)
  observer.observe(list)
  // 最小高度可能掩盖内部布局变化，例如顶部历史加载提示移除后，
  // 用户消息已经上移，但 ResizeObserver 不会收到容器尺寸变化。
  const contentObserver = new MutationObserver(schedule)
  contentObserver.observe(content, { childList: true, subtree: true })
  function suspend() {
    if (!active) return
    savedTop = list.scrollTop
    active = false
    statusTransition = null
    cancelAnimationFrame(frame)
    frame = 0
    clearTimeout(layoutHoldTimer)
    layoutHold = false
    observer.disconnect()
    contentObserver.disconnect()
  }
  function activate() {
    if (active) return
    active = true
    updatePinnedHeight()
    list.scrollTop = savedTop
    lastTop = list.scrollTop
    observer.observe(content)
    observer.observe(list)
    contentObserver.observe(content, { childList: true, subtree: true })
    schedule()
  }
  schedule()
  return {
    pause, resume, pin, clearPin, holdLayout, transitionStatus, suspend, activate,
    isFollowing: () => following,
    dispose() {
      active = false
      pause()
      clearTimeout(layoutHoldTimer)
      observer.disconnect()
      contentObserver.disconnect()
      clearPin()
      listeners.forEach(([type, handler]) => list.removeEventListener(type, handler))
    },
  }
}
