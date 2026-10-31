/**
 * JS 侧的状态语义色。
 *
 * CSS 里请用 style.css 的 --app-status-*（图形色）与 --app-status-*-text（文字色）；
 * 但 canvas、SVG 属性与内联样式需要具体色值，拿不到 CSS 变量，所以这里给出同一套值。
 * 两处同源：改任意一处都要同步另一处，__tests__/statusColors.test.ts 会盯着它们别漂移。
 */

/** 图形色：圆点、连线、进度条。只保证非文本 3:1（WCAG 1.4.11），别拿它当文字色用。 */
export const STATUS_COLORS = {
  success: '#18a058',
  // “运行中”与“警告/部分失败”在应用里同色（深色浅色一致）
  warning: '#f0a020',
  failed: '#d03050',
  neutral: '#8f8f8f',
} as const

export type StatusColorName = keyof typeof STATUS_COLORS

/**
 * 文字色：同一批状态当文字用时，图形色差得太多（深色失败 #d03050 压 #18181c 只有 3.56:1，
 * 浅色警告 #f0a020 压白底只有 2.15:1），所以文字按主题各给一套 ≥4.5:1 的值。
 * dark 一列比 light 一列亮，是压在不同底色上的结果，两者不能互换。
 * 与 style.css 的 --app-status-*-text 一一对应。
 */
export const STATUS_TEXT_COLORS = {
  dark: {
    success: '#4ecf8f',
    warning: '#f0a020',
    failed: '#ff6b86',
    // 「识别未命中」这类不参与成功/失败判定的状态用它
    neutral: '#b4b4b4',
  },
  light: {
    success: '#0f7a42',
    warning: '#a34a06',
    failed: '#b01634',
    neutral: '#5f5f5f',
  },
} as const

export type StatusTextTheme = keyof typeof STATUS_TEXT_COLORS
