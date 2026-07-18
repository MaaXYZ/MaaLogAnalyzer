import { createApp } from 'vue'
import { version } from '../package.json'
import Index from './Index.vue'
import './style.css'
import { reportAnalyticsContext } from './utils/analytics'
import { redirectIfEmbeddedAppIsOutdated } from './utils/appVersionUpdate'
import { installVueLogParserRuntime } from './utils/logParserVueRuntime'

const bootstrap = async () => {
  if (await redirectIfEmbeddedAppIsOutdated(version)) return

  installVueLogParserRuntime()

  const app = createApp(Index)
  app.mount('#app')

  reportAnalyticsContext()
}

void bootstrap()
