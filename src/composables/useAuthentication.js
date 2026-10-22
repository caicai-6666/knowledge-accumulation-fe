import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ACCESS_TOKEN_KEY, KNOWLEDGE_API_BASE_PATH, createAuthentication } from '../services/authentication.js'
import { requestDingTalkCode } from '../services/dingtalk.js'

export function useAuthentication() {
  const state = ref('loading')
  const user = ref(null)
  const error = ref('')
  let pending
  let controller
  let authentication

  function authenticate() {
    if (pending) return pending
    controller = new AbortController()
    const signal = controller.signal
    if (state.value !== 'ready') state.value = 'loading'
    error.value = ''
    pending = Promise.resolve().then(async () => {
      try {
        // localStorage 的属性访问本身也可能被浏览器策略拒绝。
        authentication ||= createAuthentication({
          mode: import.meta.env.VITE_AUTH_MODE || (import.meta.env.DEV ? 'development' : 'production'),
          apiBase: KNOWLEDGE_API_BASE_PATH,
          storage: window.localStorage,
          requestCode: options => requestDingTalkCode({ ...options, corpId: import.meta.env.VITE_DINGTALK_CORP_ID }),
        })
        const identity = await authentication.authenticate({ signal })
        if (!signal.aborted) { user.value = identity; state.value = 'ready' }
      } catch (failure) {
        if (!signal.aborted) {
          error.value = failure.name === 'SecurityError' ? '请允许此站点使用本地存储后重试' : failure.message || '登录失败，请重试'
          state.value = 'error'
        }
      } finally {
        if (!signal.aborted) pending = null
      }
    })
    return pending
  }

  function syncSharedToken(event) {
    if (event.storageArea !== window.localStorage || (event.key !== ACCESS_TOKEN_KEY && event.key !== null)) return
    controller?.abort()
    pending = null
    state.value = 'loading'
    authenticate()
  }

  function revalidate() {
    if (document.visibilityState === 'visible' && state.value === 'ready') authenticate()
  }

  onMounted(() => {
    authenticate()
    window.addEventListener('storage', syncSharedToken)
    window.addEventListener('focus', revalidate)
  })
  onBeforeUnmount(() => {
    controller?.abort()
    window.removeEventListener('storage', syncSharedToken)
    window.removeEventListener('focus', revalidate)
  })
  return { state, user, error, retry: authenticate }
}
