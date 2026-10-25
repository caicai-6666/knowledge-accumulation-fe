import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { registerIconCache } from './services/iconCache.js'
import { installMobileZoomGuard } from './services/mobileZoom.js'

const removeZoomGuard = installMobileZoomGuard()
if (import.meta.hot) import.meta.hot.dispose(removeZoomGuard)

createApp(App).mount('#app')

void registerIconCache(import.meta.env.BASE_URL)
