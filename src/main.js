import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { registerIconCache } from './services/iconCache.js'

createApp(App).mount('#app')

void registerIconCache(import.meta.env.BASE_URL)
