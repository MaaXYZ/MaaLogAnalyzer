import type { MessageApi } from 'naive-ui'

let messageApi: MessageApi | null = null

/** Register the Naive UI message api once the app has mounted. */
export const registerToastMessageApi = (api: MessageApi): void => {
  messageApi = api
}

type ToastType = 'error' | 'warning' | 'info'

const notify = (type: ToastType, content: string): void => {
  if (messageApi) {
    messageApi[type](content)
    return
  }
  // Message api not ready yet (e.g. early boot); fall back to a blocking alert.
  alert(content)
}

export const toastError = (content: string): void => notify('error', content)
export const toastWarning = (content: string): void => notify('warning', content)
export const toastInfo = (content: string): void => notify('info', content)