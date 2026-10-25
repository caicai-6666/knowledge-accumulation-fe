function isStaticImage(image, document) {
  const source = image.currentSrc || image.src
  if (!source) return false
  if (/^data:image\//i.test(source)) return true
  try {
    const url = new URL(source, document.baseURI)
    return url.origin === new URL(document.baseURI).origin && /\/(?:src\/)?assets\//.test(url.pathname)
  } catch { return false }
}

// 只等待首屏静态图片、字体与布局；头像 Blob、API、SSE 和后续页面不参与进入条件。
export function waitForWorkspaceReady(root, { signal, timeout = 5000, document = root?.ownerDocument,
  requestFrame = callback => requestAnimationFrame(callback), cancelFrame = id => cancelAnimationFrame(id),
} = {}) {
  if (!root || signal?.aborted) return Promise.resolve(false)
  return new Promise(resolve => {
    let finished = false, frame = 0, previous = '', stableFrames = 0
    const cleanup = []
    const finish = ready => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      if (frame) cancelFrame(frame)
      signal?.removeEventListener('abort', abort)
      cleanup.forEach(remove => remove())
      resolve(ready)
    }
    const abort = () => finish(false)
    // 静态资源不可用也不能造成无限进入动画，超时保留当前可用布局。
    const timer = setTimeout(() => finish(true), timeout)
    signal?.addEventListener('abort', abort, { once: true })
    const images = [...root.querySelectorAll('img')].filter(image => isStaticImage(image, document))
    const pending = images.map(image => {
      if (image.complete) return Promise.resolve()
      return new Promise(done => {
        const remove = () => { image.removeEventListener('load', complete); image.removeEventListener('error', complete) }
        const complete = () => { remove(); done() }
        image.addEventListener('load', complete, { once: true })
        image.addEventListener('error', complete, { once: true })
        cleanup.push(remove)
        if (image.complete) complete()
      })
    })
    pending.push(Promise.resolve(document?.fonts?.ready).catch(() => {}))
    function measure() {
      if (finished) return
      const bounds = root.getBoundingClientRect()
      const current = [bounds.x, bounds.y, bounds.width, bounds.height].map(value => Math.round(value * 100)).join(',')
      stableFrames = current === previous && bounds.width > 0 && bounds.height > 0 ? stableFrames + 1 : 0
      previous = current
      if (stableFrames >= 2) { finish(true); return }
      frame = requestFrame(measure)
    }
    Promise.all(pending).then(() => { if (!finished) frame = requestFrame(measure) })
  })
}
