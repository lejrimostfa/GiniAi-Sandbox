import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/layout.scss'
import './styles/panels.scss'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
