export function isDingTalkMobile(userAgent) {
  return /DingTalk/i.test(userAgent || '') && /iPhone|iPad|iPod|Android|HarmonyOS|Mobile/i.test(userAgent || '')
}

export function dingTalkFullscreenUrl(href) {
  const url = new URL(href)
  url.searchParams.set('dd_full_screen', 'true')
  return url.href
}

// 原生替换页面让容器重新读取入口参数；新入口带参后不再跳转，避免循环。
export async function enableDingTalkFullscreen({ userAgent = globalThis.navigator?.userAgent, location = globalThis.location, loadSdk = () => import('dingtalk-jsapi'), timeout = 15000, onStatus = () => {} } = {}) {
  if (!isDingTalkMobile(userAgent)) return false
  const diagnostic = { stage: 'loading-sdk', entryParameter: false, platform: '', version: '', error: '' }
  const report = (stage, error = '') => {
    diagnostic.stage = stage
    diagnostic.error = String(error).slice(0, 300)
    try { onStatus({ ...diagnostic }) } catch { /* 诊断不可用不影响应用。 */ }
  }
  let targetUrl
  try {
    const original = new URL(location.href)
    diagnostic.entryParameter = original.searchParams.get('dd_full_screen') === 'true'
    targetUrl = dingTalkFullscreenUrl(location.href)
  } catch { report('invalid-entry'); return false }
  if (diagnostic.entryParameter) { report('entry-parameter'); return true }
  report('loading-sdk')

  return new Promise(resolve => {
    let settled = false
    let started = false
    const finish = (success, stage, error) => {
      if (settled) return
      settled = true; clearTimeout(timer); report(stage, error); resolve(success)
    }
    const describe = error => error?.errorMessage || error?.errorMsg || error?.message || error?.errorCode || error?.errcode || 'Native call failed'
    const timer = setTimeout(() => finish(false, `${diagnostic.stage}-timeout`), timeout)
    Promise.resolve().then(loadSdk).then(module => {
      if (settled) return
      const dd = module.default || module
      diagnostic.platform = dd.env?.platform || ''
      diagnostic.version = dd.env?.version || ''
      if (!['ios', 'android', 'harmony'].includes(dd.env?.platform) || typeof dd.ready !== 'function') { finish(false, 'unsupported-environment'); return }
      report('waiting-for-bridge')
      dd.ready(() => {
        if (settled || started) return
        started = true
        const navigation = dd.biz?.navigation
        const invoke = (method, params, success, failure) => {
          let completed = false
          const once = callback => value => {
            if (completed || settled) return
            completed = true
            callback(value)
          }
          const onSuccess = once(success), onFail = once(failure)
          try {
            const result = method.call(navigation, { ...params, onSuccess, onFail })
            if (result?.then) result.then(onSuccess, onFail)
          } catch (error) { onFail(error) }
        }
        const hideCurrentBar = () => {
          if (typeof navigation?.hideBar !== 'function') { finish(false, 'api-unavailable'); return }
          report('calling-hideBar')
          invoke(navigation.hideBar, { hidden: true }, () => finish(true, 'native-success'), error => finish(false, 'native-failed', describe(error)))
        }
        if (typeof navigation?.replace !== 'function') { hideCurrentBar(); return }
        report('calling-replace')
        invoke(navigation.replace, { url: targetUrl }, () => finish(true, 'replace-success'), hideCurrentBar)
      })
    }).catch(error => finish(false, 'sdk-failed', describe(error)))
  })
}

export function createDingTalkDisplayReporter({ location = globalThis.location, document = globalThis.document } = {}) {
  if (new URL(location.href).searchParams.get('dd_display_debug') !== '1') return () => {}
  const panel = document.createElement('details')
  panel.open = true
  panel.style.cssText = 'position:fixed;z-index:2147483647;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));max-height:45vh;overflow:auto;padding:12px 16px;border:1px solid #dce6df;border-radius:16px;background:#fffffff5;color:#465c4e;box-shadow:0 8px 32px #243b3029;font:12px/1.6 system-ui;'
  const summary = document.createElement('summary')
  summary.textContent = '钉钉全屏诊断 / DingTalk fullscreen'
  const content = document.createElement('pre')
  content.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 0;'
  panel.append(summary, content)
  document.body.appendChild(panel)
  return result => {
    content.textContent = [`Stage: ${result.stage}`, `Entry dd_full_screen=true: ${result.entryParameter}`, `SDK platform: ${result.platform || '-'}`, `SDK version: ${result.version || '-'}`, `Error: ${result.error || '-'}`].join('\n')
  }
}
