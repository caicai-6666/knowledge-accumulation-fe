import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import { developmentMapping } from './config/developmentMapping.js'
import { browserCompatibility, browserTarget } from './config/browserCompatibility.js'
import { developerAuthentication } from './config/developerAuthentication.js'

// https://vite.dev/config/
export default defineConfig(({ command, mode, isPreview }) => {
  // 运行方式决定资源/API 前缀；登录方式只决定固定凭据或钉钉免登。
  const development = command === 'serve' && !isPreview
  const env = loadEnv(mode, process.cwd(), ['KNOWLEDGE_', 'VITE_'])
  const authMode = env.VITE_AUTH_MODE || (development ? 'development' : 'production')
  if (!['development', 'production'].includes(authMode) || (!development && authMode === 'development')) {
    throw new Error('VITE_AUTH_MODE 必须为 development 或 production；构建和预览必须使用 production')
  }
  const target = env.KNOWLEDGE_BACKEND_URL || 'http://127.0.0.1:15000'
  let backendUrl
  try { backendUrl = new URL(target) } catch { throw new Error('KNOWLEDGE_BACKEND_URL 必须为合法的 HTTP/HTTPS 根地址') }
  if (!['http:', 'https:'].includes(backendUrl.protocol) || backendUrl.username || backendUrl.password ||
      backendUrl.pathname !== '/' || backendUrl.search || backendUrl.hash) {
    throw new Error('KNOWLEDGE_BACKEND_URL 必须为不含凭据、路径和查询参数的 HTTP/HTTPS 根地址')
  }
  return {
    // 源码、依赖预构建与部署产物使用一致的旧 Chromium 语法目标。
    oxc: { target: browserTarget },
    build: { target: browserTarget },
    base: development ? '/dev/knowledge-accumulation/' : '/knowledge-accumulation/',
    plugins: [vue(), browserCompatibility(), developmentMapping(), ...(authMode === 'development' ? [developerAuthentication(env.KNOWLEDGE_DEVELOPER_LOGIN_CREDENTIAL)] : [])],
    // 缓存放在项目根目录下，避免 npm 安装依赖时清理 node_modules 中的额外目录。
    cacheDir: 'cache/vite',
    // 显式预构建全部运行依赖，避免首访发现新依赖后更换版本而令并发请求失效。
    optimizeDeps: { include: ['vue', 'markdown-it', 'dingtalk-jsapi', 'pdfjs-dist/build/pdf.mjs'], noDiscovery: true, rolldownOptions: { transform: { target: browserTarget } } },
    server: {
      // 使用 Vite 默认缓存：源码按 ETag 校验，带版本号的预构建依赖长期复用。
      host: '0.0.0.0',
      port: 15080,
      strictPort: true,
      allowedHosts: ['talent.szkl.com'],
      proxy: {
        '/dev/knowledge-accumulation/api': {
          target,
          changeOrigin: true,
        },
      },
    },
    preview: {
      allowedHosts: ['talent.szkl.com'],
      proxy: {
        '/knowledge-accumulation/api': { target, changeOrigin: true },
      },
    },
  }
})
