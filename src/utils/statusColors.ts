/**
 * JS 侧的状态语义色。
 *
 * CSS 里请用 style.css 的 --app-status-*；但 canvas、SVG 属性与内联样式需要具体色值，
 * 拿不到 CSS 变量，所以这里给出同一套值。两处同源：改任意一处都要同步另一处，
 * __tests__/statusColors.test.ts 会盯着它们别漂移。
 */
export const STATUS_COLORS = {
  success: '#18a058',
  // “运行中”与“警告/部分失败”在应用里同色（深色浅色一致）
  warning: '#f0a020',
  failed: '#d03050',
  neutral: '#8f8f8f',
} as const

export type StatusColorName = keyof typeof STATUS_COLORS
