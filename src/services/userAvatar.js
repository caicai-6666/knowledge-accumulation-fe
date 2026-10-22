import { AuthenticationError, KNOWLEDGE_API_BASE_PATH, readAccessToken } from './authentication.js'

export async function fetchUserAvatar(filename, { signal, storage = window.localStorage, fetch: fetcher = globalThis.fetch } = {}) {
  // 只接受后端身份中的文件名，禁止任意地址或路径接收 Bearer 凭据。
  if (typeof filename !== 'string' || !/^[a-f0-9]{32}\.webp$/.test(filename)) return null
  signal?.throwIfAborted()
  const token = readAccessToken(storage)
  if (!token) throw new AuthenticationError('缺少登录凭据', 401)
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 15000)
  try {
    const response = await fetcher(`${KNOWLEDGE_API_BASE_PATH}/resource/avatar/${filename}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'same-origin',
    })
    if (!response.ok) throw new AuthenticationError('头像暂时不可用', response.status)
    if (response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'image/webp') {
      throw new AuthenticationError('头像响应格式错误')
    }
    const blob = await response.blob()
    controller.signal.throwIfAborted()
    if (!blob.size) throw new AuthenticationError('头像内容为空')
    return blob
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
