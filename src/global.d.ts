import type { MessageApi } from 'naive-ui'

declare global {
  interface Window {
    $message: MessageApi | undefined
  }
}

export {}
