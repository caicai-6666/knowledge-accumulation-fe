import { avatarImageFormat } from './avatarDiagnostics.js'
import { uiText } from '../i18n/index.js'
import { AuthenticationError, KNOWLEDGE_API_BASE_PATH, readAccessToken } from './authentication.js'

export async function fetchUserAvatar(filename, { signal, storage = window.localStorage, fetch: fetcher = globalThis.fetch, onDiagnostic = () => {} } = {}) {
  const report = fields => { try { onDiagnostic(fields) } catch { /* 诊断不能影响头像。 */ } }
  report({ requestStage: 'validating', filenameValid: typeof filename === 'string' && /^[a-f0-9]{32}\.webp$/.test(filename) })
  // 只接受后端身份中的文件名，禁止任意地址或路径接收 Bearer 凭据。
  if (typeof filename !== 'string' || !/^[a-f0-9]{32}\.webp$/.test(filename)) return null
  signal?.throwIfAborted()
  const token = readAccessToken(storage)
  report({ tokenAvailable: Boolean(token) })
  if (!token) throw new AuthenticationError(uiText('缺少登录凭据'), 401)
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => { report({ requestStage: 'request-timeout' }); abort() }, 15000)
  try {
    report({ requestStage: 'fetching' })
    const response = await fetcher(`${KNOWLEDGE_API_BASE_PATH}/resource/avatar/${filename}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'same-origin',
    })
    report({ requestStage: 'response-received', httpStatus: response.status, contentType: String(response.headers.get('Content-Type') || '').slice(0, 100) })
    if (!response.ok) throw new AuthenticationError(uiText('头像暂时不可用'), response.status)
    const contentType = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()
    const types = { webp: 'image/webp', png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif' }
    if (!Object.values(types).includes(contentType)) throw new AuthenticationError(uiText('头像响应格式错误'))
    const blob = await response.blob()
    const imageFormat = await avatarImageFormat(blob)
    report({ requestStage: 'body-read', bytes: blob.size, blobType: blob.type, imageFormat })
    controller.signal.throwIfAborted()
    if (!blob.size) throw new AuthenticationError(uiText('头像内容为空'))
    if (!types[imageFormat]) throw new AuthenticationError(uiText('头像响应格式错误'))
    // 移动客户端可能返回 PNG，或改写响应 MIME；按实际文件签名声明 Blob 类型，不改写图片字节。
    return blob.type === types[imageFormat] ? blob : new Blob([blob], { type: types[imageFormat] })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
