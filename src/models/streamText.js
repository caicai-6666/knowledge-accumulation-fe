// 仅平滑展示；服务端原文与游标仍由通信层即时保存。
export function createStreamText({ initial = '', onChange, requestFrame, cancelFrame }) {
  let shown = initial
  let target = initial
  let units = []
  let offset = 0
  let frame = null
  let previousTime = null
  let remainingTime = 180
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

  function stop() {
    if (frame !== null) cancelFrame(frame)
    frame = null
    previousTime = null
  }

  function tick(time) {
    frame = null
    if (previousTime === null) previousTime = time - 32
    const elapsed = time - previousTime
    if (elapsed >= 30) {
      previousTime = time
      const remaining = units.length - offset
      // 积压越多越快追赶，避免固定打字速度把真实输出拖延很久。
      const count = Math.min(remaining, Math.max(1, Math.ceil(remaining * elapsed / Math.max(1, remainingTime))))
      remainingTime = Math.max(0, remainingTime - elapsed)
      shown += units.slice(offset, offset + count).join('')
      offset += count
      if (offset === units.length) shown = target
      onChange(shown)
    }
    if (shown !== target) frame = requestFrame(tick)
    else previousTime = null
  }

  function update(text, { immediate = false } = {}) {
    target = text
    if (immediate || !text.startsWith(shown)) {
      stop()
      shown = text
      units = []
      offset = 0
      onChange(shown)
      return
    }
    units = Array.from(segmenter.segment(text.slice(shown.length)), (part) => part.segment)
    offset = 0
    if (frame === null) remainingTime = 180
    if (shown !== target && frame === null) frame = requestFrame(tick)
  }

  return { update, stop }
}
