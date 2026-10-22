import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import { developmentMapping } from './config/developmentMapping.js'
import { developerAuthentication } from './config/developerAuthentication.js'

// https://vite.dev/config/
export default defineConfig(({ command, mode, isPreview }) => {
  const development = command === 'serve' && !isPreview
  const env = loadEnv(mode, process.cwd(), ['KNOWLEDGE_', 'VITE_'])
  const authMode = env.VITE_AUTH_MODE || (development ? 'development' : 'production')
  if (!['development', 'production'].includes(authMode) || (!development && authMode === 'development')) {
    throw new Error('VITE_AUTH_MODE 必须为 development 或 production；构建和预览必须使用 production')
  }
  const target = env.KNOWLEDGE_BACKEND_URL || 'http://127.0.0.1:24000'
  let backendUrl
  try { backendUrl = new URL(target) } catch { throw new Error('KNOWLEDGE_BACKEND_URL 必须为合法的 HTTP/HTTPS 根地址') }
  if (!['http:', 'https:'].includes(backendUrl.protocol) || backendUrl.username || backendUrl.password ||
      backendUrl.pathname !== '/' || backendUrl.search || backendUrl.hash) {
    throw new Error('KNOWLEDGE_BACKEND_URL 必须为不含凭据、路径和查询参数的 HTTP/HTTPS 根地址')
  }
  return {
    base: development ? '/dev/knowledge-accumulation/' : '/knowledge-accumulation/',
    plugins: [vue(), developmentMapping(), ...(authMode === 'development' ? [developerAuthentication(env.KNOWLEDGE_DEVELOPER_LOGIN_CREDENTIAL)] : [])],
    cacheDir: 'node_modules/vite-cache',
    server: {
      host: '0.0.0.0',
      port: 24080,
      strictPort: true,
      allowedHosts: ['pheno.szkl.com'],
      proxy: {
        '/dev/knowledge-accumulation/api': {
          target,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/dev(?=\/knowledge-accumulation\/api)/, ''),
        },
      },
    },
    preview: {
      allowedHosts: ['pheno.szkl.com'],
      proxy: {
        '/knowledge-accumulation/api': { target, changeOrigin: true },
      },
    },
  }
})
