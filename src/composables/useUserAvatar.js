import { ref, shallowRef, toValue, watch } from 'vue'
import { safeAvatarError } from '../services/avatarDiagnostics.js'
import { fetchUserAvatar } from '../services/userAvatar.js'

export function useUserAvatar(user, { loadAvatar = fetchUserAvatar, urls = URL } = {}) {
  const imageUrl = ref('')
  const ready = ref(false)
  const status = ref('idle')
  const httpStatus = ref(0)
  const revision = ref(0)
  const diagnostic = shallowRef({ stage: 'idle', history: [] })
  let startedAt = Date.now()
  function report(fields) {
    const elapsed = Date.now() - startedAt
    const entry = fields.stage || fields.requestStage
    const history = entry ? [...diagnostic.value.history, `${elapsed} ms: ${entry}${fields.httpStatus ? ` (HTTP ${fields.httpStatus})` : ''}`].slice(-20) : diagnostic.value.history
    diagnostic.value = { ...diagnostic.value, ...fields, elapsed, history }
  }

  function clearImage() {
    if (imageUrl.value) urls.revokeObjectURL(imageUrl.value)
    imageUrl.value = ''
  }

  function markImageReady(source, dimensions = {}) {
    if (source && source === imageUrl.value) { ready.value = true; status.value = 'ready'; report({ stage: 'ready', ...dimensions }) }
  }

  function failImage(source, dimensions = {}) {
    if (!source || source !== imageUrl.value) return
    clearImage()
    ready.value = true
    status.value = 'image-failed'
    report({ stage: 'image-failed', error: 'Image load failed (browser supplied no detailed reason)', ...dimensions })
  }

  // 同一身份重新验证成功时，失败头像可以重新请求；已显示的头像不闪烁或重复下载。
  watch(() => toValue(user), (current, previous) => {
    if (!['request-failed', 'image-failed'].includes(status.value)) return
    if (current?.userid === previous?.userid && current?.name === previous?.name && current?.avatar_url === previous?.avatar_url) revision.value++
  })

  watch([
    () => toValue(user)?.userid,
    () => toValue(user)?.name,
    () => toValue(user)?.avatar_url,
    revision,
  ], ([_userid, _name, filename], _previous, onCleanup) => {
    clearImage()
    startedAt = Date.now()
    diagnostic.value = { stage: filename ? 'loading' : 'no-avatar', configured: Boolean(filename), history: [] }
    ready.value = false
    httpStatus.value = 0
    status.value = filename ? 'loading' : 'no-avatar'
    if (!filename) { ready.value = true; return }
    const controller = new AbortController()
    let retryTimer
    onCleanup(() => { controller.abort(); clearTimeout(retryTimer); clearImage() })
    // 网络抖动和临时服务失败只自动重试一次；401 等待身份重新验证，不重放登录。
    function load(attempt = 0) {
      report({ stage: 'requesting', attempt: attempt + 1, error: '' })
      Promise.resolve().then(() => loadAvatar(filename, { signal: controller.signal, onDiagnostic: fields => { if (!controller.signal.aborted) report(fields) } })).then(blob => {
        if (controller.signal.aborted) return
        if (blob) { imageUrl.value = urls.createObjectURL(blob); status.value = 'image-loading'; httpStatus.value = 200; report({ stage: 'image-loading', httpStatus: 200, bytes: blob.size, blobType: blob.type }) }
        else { ready.value = true; status.value = 'invalid-avatar'; report({ stage: 'invalid-avatar' }) }
      }).catch(error => {
        if (controller.signal.aborted) return
        ready.value = true
        status.value = 'request-failed'
        httpStatus.value = Number(error?.status) || diagnostic.value.httpStatus || 0
        report({ stage: 'request-failed', httpStatus: httpStatus.value, error: `${error?.name || 'Error'}: ${safeAvatarError(error)}` })
        const failureStatus = Number(error?.status) || 0
        if (!attempt && (!failureStatus || [408, 429].includes(failureStatus) || failureStatus >= 500)) {
          retryTimer = setTimeout(() => { if (!controller.signal.aborted) load(1) }, 800)
        }
      })
    }
    load()
  }, { immediate: true })

  return { imageUrl, ready, status, httpStatus, diagnostic, markImageReady, failImage, clearImage }
}
