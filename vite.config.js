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
    // 缓存放在项目根目录下，避免 npm 安装依赖时清理 node_modules 中的额外目录。
    cacheDir: 'cache/vite',
    // 显式预构建全部运行依赖，避免首访发现新依赖后更换版本而令并发请求失效。
    optimizeDeps: { include: ['vue', 'markdown-it', 'dingtalk-jsapi', 'pdfjs-dist/build/pdf.mjs'], noDiscovery: true },
    server: {
      // 钉钉预加载的旧开发脚本可能引用已经过期的预构建版本；生产哈希资源继续长期缓存。
      headers: { 'Cache-Control': 'no-store' },
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
