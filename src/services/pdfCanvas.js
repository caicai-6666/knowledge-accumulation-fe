let enginePromise
async function loadEngine() {
  if (!enginePromise) enginePromise = Promise.all([
    import('pdfjs-dist/build/pdf.mjs'),
    import('../workers/pdf-preview.worker.js?worker&url'),
  ]).then(([engine, worker]) => { engine.GlobalWorkerOptions.workerSrc = worker.default; return engine }).catch(error => { enginePromise = null; throw error })
  return enginePromise
}

export function createPdfCanvasSession({ engine = loadEngine, fetcher = globalThis.fetch, createCanvas = () => document.createElement('canvas') } = {}) {
  let revision = 0, renderRevision = 0, controller, loadingTask, pdf, renderTask
  function cancelled() { return new DOMException('Preview closed', 'AbortError') }
  function cancelRender() { renderRevision++; renderTask?.cancel(); renderTask = null }
  function destroy() {
    revision++; controller?.abort(); controller = null
    cancelRender()
    const task = loadingTask
    loadingTask = null; pdf = null
    if (task) void Promise.resolve(task.destroy()).catch(() => {})
  }
  async function load(src) {
    destroy()
    if (!src.startsWith('blob:')) throw new Error('PDF preview requires a local Blob URL')
    const current = revision
    controller = new AbortController()
    const signal = controller.signal
    const [library, bytes] = await Promise.all([engine(), fetcher(src, { signal, credentials: 'omit' }).then(async response => {
      if (!response.ok) throw new Error('PDF resource unavailable')
      return new Uint8Array(await response.arrayBuffer())
    })])
    if (current !== revision) throw cancelled()
    loadingTask = library.getDocument({ data: bytes, isEvalSupported: false, useWasm: false })
    const document = await loadingTask.promise
    if (current !== revision) throw cancelled()
    pdf = document
    return pdf.numPages
  }
  async function render(number, width, ratio = 1) {
    cancelRender()
    const current = revision, renderId = renderRevision
    if (!pdf || width <= 0) throw cancelled()
    const page = await pdf.getPage(number)
    if (current !== revision || renderId !== renderRevision) throw cancelled()
    const natural = page.getViewport({ scale: 1 })
    // 限制每页像素和最长边；阅读器另行释放远离视口的画布。
    const scale = Math.min(width / natural.width * Math.min(2, ratio), Math.sqrt(4000000 / (natural.width * natural.height)), 4096 / Math.max(natural.width, natural.height))
    const viewport = page.getViewport({ scale })
    const canvas = createCanvas()
    canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height))
    const task = page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' })
    renderTask = task
    try {
      await task.promise
      if (current !== revision || renderId !== renderRevision) throw cancelled()
      return canvas
    } finally { if (renderTask === task) renderTask = null; page.cleanup?.() }
  }
  return { load, render, destroy }
}
