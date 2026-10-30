/* 仅缓存统一入口的公共图片，不拦截 HTML、脚本、API 或鉴权资源。 */
const cachePrefix = `knowledge-icons:${self.registration.scope}:`
const imageCache = `${cachePrefix}v1-images`
const timeCache = `${cachePrefix}v1-times`
const maxAge = 7 * 24 * 60 * 60 * 1000
const maxEntries = 48
const pending = new Map()
let writes = Promise.resolve()

self.addEventListener('install', event => { event.waitUntil(self.skipWaiting()) })
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(key => key.startsWith(cachePrefix) && ![imageCache, timeCache].includes(key)).map(key => caches.delete(key)))
    await self.clients.claim()
  })())
})

async function isPublicIconRequest(event) {
  const request = event.request
  if (request.method !== 'GET' || request.destination !== 'image' || request.headers.has('Authorization')) return false
  const url = new URL(request.url)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false
  const client = event.clientId && await self.clients.get(event.clientId)
  if (!client) return false
  // 统一入口与 registry/contract 同属一个父路径，不能缓存子平台页面的请求。
  const page = new URL(client.url)
  const scope = new URL(self.registration.scope)
  if (page.origin !== scope.origin || ![scope.pathname, `${scope.pathname}index.html`].includes(page.pathname)) return false
  if (url.origin !== scope.origin) return true
  // 开发原图没有内容版本号，交给 HTTP 缓存校验，避免改图后继续显示七天旧图。
  return url.pathname.startsWith(`${scope.pathname}assets/`) ||
    [`${scope.pathname}favicon.svg`, `${scope.pathname}icons.svg`].includes(url.pathname)
}

async function loadIcon(request) {
  const key = request.url
  try {
    const [images, times] = await Promise.all([caches.open(imageCache), caches.open(timeCache)])
    const [image, time] = await Promise.all([images.match(key), times.match(key)])
    const timestamp = Number(await time?.text())
    if (image && timestamp > 0 && Date.now() - timestamp < maxAge) return image
  } catch { /* 缓存被禁用或空间不足时直接请求原图。 */ }
  // 外站图标不携带业务凭据或 Cookie；同源开发资源保持原有加载方式。
  const external = new URL(key).origin !== new URL(self.registration.scope).origin
  const response = await fetch(external ? new Request(request, { credentials: 'omit', referrerPolicy: 'no-referrer' }) : request)
  const isImage = response.type === 'opaque' || response.ok && /^image\//i.test(response.headers.get('Content-Type') || '')
  if (isImage && !/\bno-store\b/i.test(response.headers.get('Cache-Control') || '')) {
    const copy = response.clone()
    writes = writes.catch(() => {}).then(async () => {
      const images = await caches.open(imageCache)
      const times = await caches.open(timeCache)
      // 删除后插入，使容量淘汰顺序与最近写入顺序一致。
      await images.delete(key)
      await images.put(key, copy)
      await times.put(key, new Response(String(Date.now())))
      const keys = await images.keys()
      await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map(async old => {
        await images.delete(old)
        await times.delete(old)
      }))
    }).catch(() => {})
    await writes
  }
  return response
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.destination !== 'image') return
  event.respondWith((async () => {
    if (!await isPublicIconRequest(event)) return fetch(event.request)
    const key = event.request.url
    // 同一图标在多条回答中同时出现时，只下载一次；每个使用者读取独立响应。
    if (!pending.has(key)) pending.set(key, loadIcon(event.request).finally(() => pending.delete(key)))
    return (await pending.get(key)).clone()
  })())
})
