// 按字素推进展示进度；每个新增字素的淡入由 Markdown 晕染层完成。
export function createStreamText({ initial = '', onChange, requestFrame, cancelFrame }) {
  let shown = initial, target = initial
  let units = [], offset = 0, frame = null, previousTime = null, remainingTime = 0
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  function stop() {
    if (frame !== null) cancelFrame(frame)
    frame = null
    previousTime = null
  }
  function tick(time) {
    frame = null
    const elapsed = previousTime === null ? 16 : Math.min(64, Math.max(0, time - previousTime))
    previousTime = time
    const remaining = units.length - offset
    const count = Math.min(remaining, Math.max(1, Math.ceil(remaining * elapsed / Math.max(1, remainingTime))))
    remainingTime = Math.max(0, remainingTime - elapsed)
    shown += units.slice(offset, offset + count).join('')
    offset += count
    if (offset === units.length) shown = target
    onChange(shown)
    if (shown !== target) frame = requestFrame(tick)
    else previousTime = null
  }
  function update(text, { immediate = false } = {}) {
    if (text === target && !immediate) return
    target = text
    if (immediate || !text.startsWith(shown)) {
      stop()
      shown = text
      units = []; offset = 0
      onChange(shown)
      return
    }
    units = Array.from(segmenter.segment(text.slice(shown.length)), part => part.segment)
    offset = 0
    // 已有帧等待执行时也重算预算，避免短增量之后的大段正文挤在最后一帧显示。
    if (shown !== target) remainingTime = Math.max(remainingTime, Math.min(2200, Math.max(100, units.length * 14)))
    if (shown !== target && frame === null) {
      frame = requestFrame(tick)
    }
  }
  return { update, stop }
}
