export const ACCESS_TOKEN_KEY = 'access_token'
const environmentPrefix = import.meta.env?.DEV ? '/dev' : ''
export const KNOWLEDGE_API_BASE_PATH = `${environmentPrefix}/knowledge-accumulation/api`

export class AuthenticationError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'AuthenticationError'
    this.status = status
  }
}

export function isAccessToken(token) {
  return typeof token === 'string' && token.length <= 4096 && /^[\x21-\x7e]+$/.test(token)
}

export function readAccessToken(storage) {
  try {
    const token = storage.getItem(ACCESS_TOKEN_KEY)
    return isAccessToken(token) ? token : null
  } catch {
    throw new AuthenticationError('无法读取浏览器本地存储，请允许此站点使用本地存储后重试')
  }
}

function validUser(user) {
  return user && typeof user.userid === 'string' && user.userid.trim() &&
    (user.name === null || typeof user.name === 'string') && Array.isArray(user.managed_platforms)
}

function throwIfAborted(signal) {
  signal?.throwIfAborted()
}

export function createAuthentication({ mode, apiBase, storage, fetch: fetcher = globalThis.fetch, requestCode }) {
  if (!['development', 'production'].includes(mode)) throw new AuthenticationError('登录模式配置错误')

  async function request(path, { signal, ...init } = {}) {
    const controller = new AbortController()
    const abort = () => controller.abort()
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
    // 首次生产登录可能需要初始化员工资料及头像，不能沿用普通查询的短超时。
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, 75000)
    try {
      const response = await fetcher(path, { ...init, signal: controller.signal, cache: 'no-store', credentials: 'same-origin' })
      const payload = await response.json().catch(error => {
        if (controller.signal.aborted) throw error
        return null
      })
      throwIfAborted(signal)
      if (!response.ok) {
        const message = path === '/dev/knowledge-accumulation/__auth/developer' && response.status === 503 ? '开发凭据未配置，请设置 KNOWLEDGE_DEVELOPER_LOGIN_CREDENTIAL 并重启开发服务'
          : response.status === 503 && payload?.detail === '登录能力未启用' ? '后端登录能力未启用，请在 knowledge-accumulation-be 配置 AUTH_ENABLED=true'
          : response.status === 401 ? '登录凭据无效或已过期，请重新登录'
          : response.status === 409 ? '前后端登录模式不一致，请检查环境配置'
          : response.status === 422 ? '登录参数无效，请检查前后端登录模式配置后重试'
          : response.status === 403 ? '暂无访问权限'
          : `身份服务暂时不可用（${response.status}），请稍后重试`
        throw new AuthenticationError(message, response.status)
      }
      if (payload === null) throw new AuthenticationError('身份服务响应格式错误，请检查接口转发配置')
      return payload
    } catch (error) {
      throwIfAborted(signal)
      if (timedOut) throw new AuthenticationError('登录请求超时，请重试')
      if (error instanceof TypeError) throw new AuthenticationError('无法连接身份服务，请稍后重试')
      throw error
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }

  async function currentUser(token, signal) {
    const user = await request(`${apiBase}/auth/me`, { headers: { Authorization: `Bearer ${token}` }, signal })
    if (!validUser(user)) throw new AuthenticationError('身份服务返回了无效的用户资料')
    return user
  }

  function persist(token, signal) {
    throwIfAborted(signal)
    if (!isAccessToken(token)) throw new AuthenticationError('身份服务返回了无效的访问凭据')
    try {
      // 所有同源管理平台均读取此键，值为原始字符串，不附加 Bearer 或 JSON 包装。
      storage.setItem(ACCESS_TOKEN_KEY, token)
      if (storage.getItem(ACCESS_TOKEN_KEY) !== token) throw new Error('storage did not persist')
    } catch {
      throw new AuthenticationError('无法保存登录凭据，请允许此站点使用本地存储后重试')
    }
  }

  async function authenticate({ signal } = {}) {
    throwIfAborted(signal)
    const token = readAccessToken(storage)
    if (token) {
      try {
        const user = await currentUser(token, signal)
        throwIfAborted(signal)
        if (readAccessToken(storage) !== token) return authenticate({ signal })
        return user
      } catch (error) {
        if (error.status !== 401) throw error
        // 不让旧请求删除另一个页面已经更新的共享凭据。
        if (readAccessToken(storage) !== token) return authenticate({ signal })
        storage.removeItem(ACCESS_TOKEN_KEY)
      }
    }
    let loginRequest
    if (mode === 'development') {
      const { login_credential: credential } = await request('/dev/knowledge-accumulation/__auth/developer', { signal })
      if (!isAccessToken(credential)) throw new AuthenticationError('开发凭据未配置，请设置 KNOWLEDGE_DEVELOPER_LOGIN_CREDENTIAL')
      // 固定凭据只用于交换随机用户 token，开发 login 严格要求无 body。
      loginRequest = { headers: { Authorization: `Bearer ${credential}` } }
    } else {
      // code 为一次性凭据；失败后由用户重试，重新向钉钉申请，不重发同一 code。
      const code = await requestCode({ signal })
      throwIfAborted(signal)
      if (typeof code !== 'string' || !code.trim() || code.length > 2048) throw new AuthenticationError('钉钉未返回有效免登码，请重试')
      loginRequest = { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }
    }
    const result = await request(`${apiBase}/auth/login`, { ...loginRequest, method: 'POST', signal })
    if (!validUser(result.user) || result.token_type !== 'Bearer' || !Number.isInteger(result.expires_in) || result.expires_in <= 0) {
      throw new AuthenticationError('身份服务返回了无效的登录结果')
    }
    persist(result.access_token, signal)
    return result.user
  }

  return { authenticate }
}
