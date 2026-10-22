function restoreDevelopmentPrefix(request) {
  if (/^\/knowledge-accumulation(?:\/|\?|$)/.test(request.url || '')) {
    request.url = `/dev${request.url}`
  }
}

export function developmentMapping() {
  return {
    name: 'knowledge-development-mapping',
    apply: 'serve',
    configureServer(server) {
      // 当前网关保留 /dev，完整路径直接通过；仅为旧的去前缀映射补回 /dev。
      server.middlewares.use((request, _response, next) => {
        restoreDevelopmentPrefix(request)
        next()
      })
      const httpServer = server.httpServer
      httpServer?.prependListener('upgrade', restoreDevelopmentPrefix)
      httpServer?.once('close', () => httpServer.removeListener('upgrade', restoreDevelopmentPrefix))
    },
  }
}
