export type StatusButtonType = 'default' | 'info' | 'success' | 'warning'

export const resolveStatusButtonType = (status: string): StatusButtonType => {
  if (status === 'success') return 'success'
  if (status === 'running') return 'info'
  if (status === 'failed') return 'warning'
  return 'default'
}
