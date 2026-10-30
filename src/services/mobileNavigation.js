// 接管左边缘右滑打开列表，以及列表内左滑返回；保留纵向滚动和弹窗手势。
export function installEdgeListGesture(element, { enabled, open, close, isListOpen = () => false }) {
  const options = { passive: false }
  let gesture = null, suppressClick = false
  function cancel() { gesture = null }
  function start(event) {
    cancel()
    suppressClick = false
    if (!enabled() || event.touches.length !== 1 || element.ownerDocument.querySelector('dialog[open]')) return
    const closing = isListOpen()
    const control = event.target.closest?.('button, a, input, textarea, select, [role="button"]')
    if (control && !(closing && event.target.closest?.('.tree-select__option'))) return
    const touch = event.touches[0], left = element.getBoundingClientRect().left
    if (!closing && (touch.clientX < left || touch.clientX - left > 24 || !event.cancelable)) return
    // 打开时在起点拦截原生边缘返回；收起时等方向确认后再拦截，允许纵向滚动。
    if (!closing) event.preventDefault()
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, closing }
  }
  function move(event) {
    if (!gesture) return
    if (!enabled() || event.touches.length !== 1) { cancel(); return }
    const touch = event.touches[0]
    if (touch.identifier !== gesture.id) { cancel(); return }
    const x = (touch.clientX - gesture.x) * (gesture.closing ? -1 : 1), y = touch.clientY - gesture.y
    if (x < -10 || Math.abs(y) > 10 && Math.abs(y) > Math.abs(x)) { cancel(); return }
    if ((!gesture.closing || x > 10) && event.cancelable) event.preventDefault()
  }
  function end(event) {
    const started = gesture
    cancel()
    if (!started || !enabled() || event.touches.length || started.closing !== isListOpen()) return
    const touch = [...event.changedTouches].find(item => item.identifier === started.id)
    if (!touch) return
    const x = (touch.clientX - started.x) * (started.closing ? -1 : 1), y = touch.clientY - started.y
    if (x >= 48 && x > Math.abs(y) * 1.5) {
      if (event.cancelable) event.preventDefault()
      suppressClick = true
      if (started.closing) close?.()
      else open()
    }
  }
  function guardClick(event) {
    if (!suppressClick || event.detail === 0) return
    suppressClick = false
    event.preventDefault(); event.stopPropagation()
  }
  element.addEventListener('click', guardClick, true)
  element.addEventListener('touchstart', start, options)
  element.addEventListener('touchmove', move, options)
  element.addEventListener('touchend', end, options)
  element.addEventListener('touchcancel', cancel, options)
  return () => {
    cancel()
    element.removeEventListener('click', guardClick, true)
    element.removeEventListener('touchstart', start, options)
    element.removeEventListener('touchmove', move, options)
    element.removeEventListener('touchend', end, options)
    element.removeEventListener('touchcancel', cancel, options)
  }
}

function invokeNative(method, context, params) {
  return new Promise((resolve, reject) => {
    if (typeof method !== 'function') { reject(new Error('API unavailable')); return }
    try {
      const result = method.call(context, { ...params, onSuccess: resolve, onFail: reject })
      if (result?.then) result.then(resolve, reject)
    } catch (error) { reject(error) }
  })
}

function runMobileDingTalk(operation, { navigator = globalThis.navigator, loadSdk = () => import('dingtalk-jsapi'), timeout = 3000 } = {}) {
  if (!/DingTalk/i.test(navigator?.userAgent || '') || !/iPhone|iPad|iPod|Android|HarmonyOS|Mobile/i.test(navigator?.userAgent || '')) return Promise.resolve(false)
  return new Promise(resolve => {
    let settled = false, started = false
    const finish = success => { if (settled) return; settled = true; clearTimeout(timer); resolve(success) }
    const timer = setTimeout(() => finish(false), timeout)
    Promise.resolve().then(loadSdk).then(module => {
      if (settled) return
      const dd = module.default || module
      if (!['ios', 'android', 'harmony'].includes(dd.env?.platform) || typeof dd.ready !== 'function') { finish(false); return }
      dd.ready(() => {
        if (settled || started) return
        started = true
        Promise.resolve().then(() => operation(dd)).then(finish, () => finish(false))
      })
    }).catch(() => finish(false))
  })
}

// 两项设置分别控制容器侧滑退出和 WebView 历史回退，不修改浏览器历史或登录凭据。
export function setMobileBackGesturesEnabled(enabled, options) {
  return runMobileDingTalk(async dd => {
    const results = await Promise.allSettled([
      invokeNative(dd.popGesture, dd, { popGestureEnabled: enabled }),
      invokeNative(dd.setGestures, dd, { backForwardNavigationGestures: enabled }),
    ])
    return results.every(result => result.status === 'fulfilled')
  }, options)
}

export async function closeMobileWorkspace({ window: browser = globalThis.window, navigator = globalThis.navigator, ...options } = {}) {
  if (/DingTalk/i.test(navigator?.userAgent || '')) {
    return runMobileDingTalk(async dd => {
      await invokeNative(dd.closePage, dd, {})
      return true
    }, { ...options, navigator })
  }
  if (browser.history.length > 1) { browser.history.back(); return true }
  browser.close()
  return Boolean(browser.closed)
}
