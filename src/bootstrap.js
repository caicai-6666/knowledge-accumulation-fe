// 此入口不静态导入业务模块：模块解析、下载或初始化失败时仍能展示启动结果。
var root = document.getElementById('app')
var startup = document.getElementById('app-startup')
var finished = false
var lastError = ''
var workspaceOpened = false
var applicationFailed = false
var stage = 'Loading application modules'
var retryKey = 'knowledge-accumulation.module-retry:' + window.location.pathname
var english = false
var deadline
var moduleStartedAt = 0
var moduleTimedOut = false
var moduleLoadTimeout = import.meta.env.DEV ? 60000 : 20000
try { english = localStorage.getItem('knowledge-accumulation.language') === 'en' } catch (_) {}
function text(zh, en) { return english ? en : zh }
document.getElementById('startup-title').textContent = text('正在进入', 'Signing you in')
document.getElementById('startup-retry').textContent = text('重新尝试', 'Try again')
document.getElementById('startup-details-label').textContent = text('加载信息', 'Loading details')
function safeMessage(value) {
  return String(value || '').replace(/https?:\/\/[^\s)]+/g, function (url) { return url.split(/[?#]/)[0] }).slice(0, 300)
}
function showFailure(reason) {
  if (finished || !startup) return
  startup.hidden = false
  if (startup.parentElement !== document.body) document.body.appendChild(startup)
  root.inert = true
  document.getElementById('startup-title').textContent = text('暂时无法进入', 'Unable to open your workspace')
  document.getElementById('startup-message').textContent = text('页面资源暂未加载成功，请重新尝试。', 'Some page resources could not be loaded. Please try again.')
  document.getElementById('startup-loading').hidden = true
  document.getElementById('startup-diagnostics').hidden = false
  startup.querySelector('section').setAttribute('aria-busy', 'false')
  document.getElementById('startup-actions').hidden = false
  document.getElementById('startup-details-label').textContent = text('加载信息', 'Loading details')
  document.getElementById('startup-retry').textContent = text('重新尝试', 'Try again')
  var viewport = window.visualViewport
  document.getElementById('startup-details').textContent = [
    'Stage: ' + stage,
    'Reason: ' + reason,
    'Error: ' + (lastError || 'none captured'),
    'Module loading budget: ' + moduleLoadTimeout + ' ms',
    'Module loading elapsed: ' + (moduleStartedAt ? Date.now() - moduleStartedAt : 0) + ' ms',
    'Failed resources: ' + failedResources(),
    'Browser: ' + navigator.userAgent,
    'Viewport: ' + window.innerWidth + ' x ' + window.innerHeight + (viewport ? ' / visible ' + Math.round(viewport.width) + ' x ' + Math.round(viewport.height) : ''),
    'CSS dvh: ' + (typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('height', '100dvh')),
    'Intl.Segmenter: ' + (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'),
    'AbortSignal.throwIfAborted: ' + (typeof AbortSignal !== 'undefined' && typeof AbortSignal.prototype.throwIfAborted === 'function'),
  ].join('\n')
}
function captureError(event) {
  if (finished) return
  lastError = safeMessage(event.message || event.target && (event.target.src || event.target.href) || 'A script resource could not be loaded')
}
window.addEventListener('error', captureError, true)
function reportApplicationFailure(event) {
  if (workspaceOpened || applicationFailed) return
  applicationFailed = true
  finished = false
  clearTimeout(deadline)
  lastError = safeMessage(event.detail || 'Application initialization failed')
  stage = 'Initializing workspace'
  showFailure('application-initialization-failed')
}
window.addEventListener('knowledge-app-error', reportApplicationFailure)
window.addEventListener('knowledge-workspace-ready', function () {
  workspaceOpened = true
  window.removeEventListener('knowledge-app-error', reportApplicationFailure)
}, { once: true })

// ES 模块失败会留在当前文档的模块缓存中，重新 import 同一地址不能可靠恢复。
// 只对明确的模块下载失败自动更换文档一次；存储不可用时交给用户手动重试。
function retryModuleLoad(error) {
  if (!error || error.name !== 'TypeError' || !/importing a module script failed|failed to fetch dynamically imported module|error loading dynamically imported module|failed to load module script/i.test(error.message || '')) return false
  try {
    var previous = Number(window.sessionStorage.getItem(retryKey))
    if (previous && Date.now() - previous < 120000) return false
    window.sessionStorage.setItem(retryKey, String(Date.now()))
    var url = new URL(window.location.href)
    url.searchParams.set('ka_boot_retry', String(Date.now()))
    window.location.replace(url.href)
    return true
  } catch (_) { return false }
}
function failedResources() {
  try {
    return window.performance.getEntriesByType('resource').filter(function (entry) { return entry.responseStatus >= 400 }).slice(-5).map(function (entry) { return safeMessage(entry.name) + ' [' + entry.responseStatus + ']' }).join(', ') || 'none captured'
  } catch (_) { return 'not available' }
}
document.getElementById('startup-retry').onclick = function () {
  try { window.sessionStorage.removeItem(retryKey) } catch (_) {}
  window.location.reload()
}
// 移动钉钉先替换原生容器，再展示进入动画和加载业务；旧容器不挂载应用或发起登录。
var entryTask = Promise.resolve(false)
try {
  var mobileDingTalk = /DingTalk/i.test(navigator.userAgent) && /iPhone|iPad|iPod|Android|HarmonyOS|Mobile/i.test(navigator.userAgent)
  if (mobileDingTalk && new URL(window.location.href).searchParams.get('dd_full_screen') !== 'true') {
    stage = 'Preparing fullscreen entry'
    var entryExpiresAt = Date.now() + 6000
    var entryExpired = false
    var entryTimer
    entryTask = new Promise(function (resolve) {
      entryTimer = setTimeout(function () { entryExpired = true; resolve(false) }, 6000)
      import('./services/dingtalkDisplay.js').then(function (display) {
        if (entryExpired) return false
        var lastStage = ''
        var reporter = display.createDingTalkDisplayReporter()
        return display.enableDingTalkFullscreen({ timeout: Math.max(1, entryExpiresAt - Date.now()), onStatus: function (status) { lastStage = status.stage; reporter(status) } }).then(function () { return lastStage === 'replace-success' })
      }).then(resolve, function () { resolve(false) })
    }).then(function (replaced) { clearTimeout(entryTimer); return replaced })
  }
} catch (_) { /* 无法识别入口时继续正常加载。 */ }
entryTask.then(function (replaced) {
  if (replaced) {
    finished = true
    clearTimeout(deadline)
    window.removeEventListener('error', captureError, true)
    return
  }
  startup.hidden = false
  stage = 'Loading application modules'
  // 全屏入口有独立的 6 秒上限，不占用模块预算；开发源码需要更多网络往返。
  moduleStartedAt = Date.now()
  deadline = setTimeout(function () {
    if (finished || applicationFailed) return
    moduleTimedOut = true
    showFailure('startup-timeout')
  }, moduleLoadTimeout)
  return import('./main.js').then(function () {
    if (applicationFailed) return
    finished = true
    // 网络慢时模块仍可能迟到成功，交还 Vue 的认证界面，不残留超时遮罩。
    if (moduleTimedOut) {
      if (startup.parentElement === document.body) startup.remove()
      root.inert = false
    }
    try {
      window.sessionStorage.removeItem(retryKey)
      var url = new URL(window.location.href)
      if (url.searchParams.has('ka_boot_retry')) { url.searchParams.delete('ka_boot_retry'); window.history.replaceState(window.history.state, '', url.href) }
    } catch (_) {}
    clearTimeout(deadline)
    window.removeEventListener('error', captureError, true)
  })
}).catch(function (error) {
  clearTimeout(deadline)
  lastError = safeMessage(error && (error.name + ': ' + error.message))
  window.removeEventListener('error', captureError, true)
  if (retryModuleLoad(error)) return
  showFailure('module-startup-failed')
})
