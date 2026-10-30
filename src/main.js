import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { registerIconCache } from './services/iconCache.js'
import { installButtonPressFeedback } from './services/buttonPressFeedback.js'
import { installMobileZoomGuard } from './services/mobileZoom.js'

const removeButtonFeedback = installButtonPressFeedback()
const removeZoomGuard = installMobileZoomGuard()
if (import.meta.hot) import.meta.hot.dispose(() => { removeZoomGuard(); removeButtonFeedback() })

const app = createApp(App)
app.config.errorHandler = error => {
  // Vue 会捕获组件异常，需将首屏初始化失败交给独立入口呈现，避免静默白屏。
  console.error(error)
  window.dispatchEvent(new CustomEvent('knowledge-app-error', { detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }))
}
app.mount('#app')

void registerIconCache(import.meta.env.BASE_URL)
