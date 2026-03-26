import { createApp } from 'vue'
import Index from './Index.vue'
import './style.css'
import { reportAnalyticsContext } from './utils/analytics'

const app = createApp(Index)
app.mount('#app')

reportAnalyticsContext()
