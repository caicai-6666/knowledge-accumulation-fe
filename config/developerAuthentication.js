export const DEVELOPER_AUTH_PATH = '/dev/knowledge-accumulation/__auth/developer'

// 固定开发凭据仅由开发服务器按需返回，不注入前端模块或生产构建。
export function developerAuthentication(token = '') {
  return {
    name: 'knowledge-developer-authentication',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== DEVELOPER_AUTH_PATH) return next()
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        if (request.method !== 'GET') {
          response.statusCode = 405
          response.setHeader('Allow', 'GET')
          return response.end(JSON.stringify({ detail: '仅支持 GET' }))
        }
        if (token.length > 4096 || !/^[\x21-\x7e]+$/.test(token)) {
          response.statusCode = 503
          return response.end(JSON.stringify({ detail: '请配置 KNOWLEDGE_DEVELOPER_LOGIN_CREDENTIAL' }))
        }
        response.end(JSON.stringify({ login_credential: token }))
      })
    },
  }
}
