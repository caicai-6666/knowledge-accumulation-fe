const cache = new Map()
const queue = []
let running = 0

export function webpageUrl(value) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    return url
  } catch { return null }
}

function pump() {
  while (running < 3 && queue.length) {
    const { run, resolve } = queue.shift()
    running++
    run().then(resolve).finally(() => { running--; pump() })
  }
}

async function probe(url) {
  // 标题受 CORS 限制时仍可用站点默认图标，图标本身由 img 独立加载。
  const fallback = { title: '', icon: new URL('/favicon.ico', url.origin).href }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    // 外部网页不经过业务鉴权入口，不携带登录凭据，也不借助第三方代理。
    const response = await fetch(url.href, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors' })
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('text/html')) return fallback
    const reader = response.body?.getReader()
    if (!reader) return fallback
    const decoder = new TextDecoder()
    let html = '', bytes = 0
    try {
      while (bytes < 256 * 1024) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = value.subarray(0, 256 * 1024 - bytes)
        bytes += chunk.length
        html += decoder.decode(chunk, { stream: true })
        if (/<\/head\s*>/i.test(html)) break
      }
      html += decoder.decode()
    } finally { await reader.cancel().catch(() => {}) }
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const title = (doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || doc.querySelector('title')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300)
    const base = response.url || url.href
    const iconPath = doc.querySelector('link[rel~="icon"]')?.getAttribute('href') || '/favicon.ico'
    const icon = webpageUrl(new URL(iconPath, base).href)?.href || ''
    return { title, icon }
  } catch { return fallback }
  finally { clearTimeout(timer) }
}

export function getLinkMetadata(value) {
  const url = webpageUrl(value)
  if (!url) return Promise.resolve({ title: '', icon: '' })
  url.hash = ''
  const key = url.href
  if (cache.has(key)) return cache.get(key)
  const promise = new Promise(resolve => { queue.push({ run: () => probe(url), resolve }); pump() })
  cache.set(key, promise)
  if (cache.size > 200) cache.delete(cache.keys().next().value)
  return promise
}
