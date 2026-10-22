export async function registerIconCache(base, { navigator: browser = globalThis.navigator, origin = globalThis.location?.origin } = {}) {
  if (!browser?.serviceWorker || !origin) return null
  try {
    const scope = new URL(base, origin)
    return await browser.serviceWorker.register(new URL('icon-cache-sw.js', scope).href, {
      scope: scope.pathname,
      updateViaCache: 'none',
    })
  } catch { return null } // 非安全上下文、隐私设置或网关限制不影响页面加载。
}
