import { throwIfAborted } from './abortSignal.js'
import { uiText, LocalizedError } from '../i18n/index.js'
import { KNOWLEDGE_API_BASE_PATH, readAccessToken } from './authentication.js'

export class PlatformDirectoryError extends LocalizedError {
  constructor(message, status = 0) {
    super(message)
    this.name = 'PlatformDirectoryError'
    this.status = status
  }
}

export function validatePlatforms(payload) {
  if (!Array.isArray(payload)) throw new PlatformDirectoryError(uiText('平台服务返回了无效的列表'))
  const codes = new Set()
  for (const platform of payload) {
    if (!platform || typeof platform.code !== 'string' || !platform.code.trim() || codes.has(platform.code) ||
        typeof platform.name !== 'string' || !platform.name.trim() || typeof platform.description !== 'string' ||
        typeof platform.is_alive !== 'boolean' || typeof platform.supports_a2a !== 'boolean' ||
        typeof platform.is_sub_management_platform !== 'boolean' || typeof platform.is_management_entry !== 'boolean' ||
        !Array.isArray(platform.admins) ||
        !platform.admins.every(admin => admin && typeof admin.name === 'string' && admin.name.trim() &&
          (admin.avatar_url === null || (typeof admin.avatar_url === 'string' && /^[a-f0-9]{32}\.webp$/.test(admin.avatar_url))))) {
      throw new PlatformDirectoryError(uiText('平台服务返回了无效的平台资料'))
    }
    codes.add(platform.code)
  }
  return payload
}

export async function fetchPlatforms({ signal, storage = window.localStorage, fetch: fetcher = globalThis.fetch } = {}) {
  throwIfAborted(signal)
  const token = readAccessToken(storage)
  if (!token) throw new PlatformDirectoryError(uiText('登录状态已失效，请重新登录'), 401)
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; abort() }, 75000)
  try {
    const response = await fetcher(`${KNOWLEDGE_API_BASE_PATH}/platform/list`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store', credentials: 'same-origin',
    })
    const payload = await response.json().catch(error => {
      if (controller.signal.aborted) throw error
      return null
    })
    throwIfAborted(controller.signal)
    if (!response.ok) {
      if (response.status === 401 && readAccessToken(storage) !== token) throw new PlatformDirectoryError(uiText('请求状态已更新，请重试'))
      const message = response.status === 401 ? uiText('登录状态已失效，请重新登录')
        : response.status === 403 ? uiText('暂无查看平台信息的权限')
        : uiText('平台信息暂时无法加载，请稍后重试')
      throw new PlatformDirectoryError(message, response.status)
    }
    return validatePlatforms(payload)
  } catch (error) {
    throwIfAborted(signal)
    if (timedOut) throw new PlatformDirectoryError(uiText('平台信息加载超时，请重试'))
    if (error instanceof TypeError) throw new PlatformDirectoryError(uiText('无法连接平台服务，请重试'))
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
