export type StatusButtonType = 'default' | 'info' | 'success' | 'warning'
export type ResultStatusButtonType = 'success' | 'warning' | 'error'

export const resolveStatusButtonType = (status: string): StatusButtonType => {
  if (status === 'success') return 'success'
  if (status === 'running') return 'info'
  if (status === 'failed') return 'warning'
  return 'default'
}

export const resolveResultStatusButtonType = (status: string): ResultStatusButtonType => {
  if (status === 'success') return 'success'
  if (status === 'running') return 'warning'
  return 'error'
}
