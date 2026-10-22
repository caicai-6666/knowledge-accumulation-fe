import { AuthenticationError } from './authentication.js'

export async function requestDingTalkCode({ corpId, signal, loadSdk = () => import('dingtalk-jsapi') }) {
  if (!corpId?.trim()) throw new AuthenticationError('尚未配置钉钉企业标识，请设置 VITE_DINGTALK_CORP_ID')
  signal?.throwIfAborted()
  let dd
  try {
    const module = await loadSdk()
    dd = module.default || module
  } catch {
    throw new AuthenticationError('钉钉组件加载失败，请重试')
  }
  signal?.throwIfAborted()
  if (!dd.env?.platform || dd.env.platform === 'notInDingTalk') {
    throw new AuthenticationError('请从钉钉工作台打开知识沉淀应用')
  }
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error, code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve(code)
    }
    const abort = () => finish(signal.reason || new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(() => finish(new AuthenticationError('钉钉免登超时，请重新打开应用或重试')), 20000)
    signal?.addEventListener('abort', abort, { once: true })
    dd.ready(() => {
      if (settled) return
      try {
        dd.runtime.permission.requestAuthCode({
          corpId,
          onSuccess: result => finish(null, result?.code),
          onFail: () => finish(new AuthenticationError('钉钉免登失败，请重新打开应用或重试')),
        })
      } catch {
        finish(new AuthenticationError('当前钉钉环境无法发起免登，请重新打开应用'))
      }
    })
  })
}
