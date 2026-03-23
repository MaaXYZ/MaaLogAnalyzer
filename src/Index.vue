<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { darkTheme, NConfigProvider, NMessageProvider } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'
import App from './App.vue'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import { BRIDGE_THEME_UPDATED_EVENT } from './utils/bridgeEvents'

// 注册 JSON 语言支持
hljs.registerLanguage('json', json)

// 主题管理 - 检测系统主题
const getSystemTheme = () => {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

const isDark = ref(getSystemTheme())
const vscodeThemeVersion = ref(0)

const refreshVscodeTheme = () => {
  vscodeThemeVersion.value++
}

const hasCssSupportsApi = typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
const cssColorValidationCache = new Map<string, boolean>()
const cssColorCandidatePattern = /^(#|[a-z]+|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\()/i

const isValidCssColor = (value: string): boolean => {
  const normalized = value.trim()
  if (!normalized) return false

  const cached = cssColorValidationCache.get(normalized)
  if (cached !== undefined) return cached

  // Naive UI 内部会用 rgba 处理主题色，var(...) 会报错，直接判无效并回退。
  if (normalized.includes('var(')) {
    cssColorValidationCache.set(normalized, false)
    return false
  }

  // 先做快速前置过滤，避免对明显无效值调用 CSS.supports。
  if (!cssColorCandidatePattern.test(normalized)) {
    cssColorValidationCache.set(normalized, false)
    return false
  }

  const valid = hasCssSupportsApi ? CSS.supports('color', normalized) : true
  cssColorValidationCache.set(normalized, valid)
  return valid
}

const pickCssVarColor = (styleDecl: CSSStyleDeclaration | null, names: string[], fallback: string): string => {
  if (!styleDecl) return fallback
  for (const name of names) {
    const value = styleDecl.getPropertyValue(name).trim()
    if (value && isValidCssColor(value)) return value
  }
  return fallback
}

const handleSystemThemeChange = (e: MediaQueryListEvent) => {
  // 只有在用户没有手动设置过主题时才跟随系统
  if (!localStorage.getItem('theme')) {
    isDark.value = e.matches
    updateThemeColor(isDark.value)
  }
  refreshVscodeTheme()
}

let mediaQuery: MediaQueryList | null = null

// 从 localStorage 加载主题偏好，如果没有则跟随系统
onMounted(() => {
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme) {
    isDark.value = savedTheme === 'dark'
  } else {
    // 没有保存的偏好，跟随系统主题
    isDark.value = getSystemTheme()
  }
  updateThemeColor(isDark.value)
  refreshVscodeTheme()

  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', handleSystemThemeChange)
  window.addEventListener(BRIDGE_THEME_UPDATED_EVENT, refreshVscodeTheme)
})

onBeforeUnmount(() => {
  if (mediaQuery) {
    mediaQuery.removeEventListener('change', handleSystemThemeChange)
    mediaQuery = null
  }
  window.removeEventListener(BRIDGE_THEME_UPDATED_EVENT, refreshVscodeTheme)
})

// 更新浏览器主题颜色和 body 类
const updateThemeColor = (dark: boolean) => {
  requestAnimationFrame(() => {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]')
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', dark ? '#18181c' : '#ffffff')
    }
    
    // 添加/移除 body 类
    document.body.classList.remove('force-light', 'force-dark')
    if (localStorage.getItem('theme')) {
      // 用户手动设置了主题
      document.body.classList.add(dark ? 'force-dark' : 'force-light')
    }
  })
}

// 切换主题
const toggleTheme = () => {
  isDark.value = !isDark.value
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
  updateThemeColor(isDark.value)
  refreshVscodeTheme()
}

// 主题配置
const theme = computed(() => isDark.value ? darkTheme : null)
const themeOverrides = computed<GlobalThemeOverrides>(() => {
  // 让 bridge 主题更新事件触发重算
  void vscodeThemeVersion.value

  const fallbackBg = isDark.value ? '#18181c' : '#ffffff'
  const fallbackText = isDark.value ? 'rgba(255, 255, 255, 0.82)' : 'rgba(0, 0, 0, 0.82)'
  const fallbackBorder = isDark.value ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'
  const styleDecl = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null

  const primaryColor = pickCssVarColor(styleDecl, ['--vscode-button-background'], '#63e2b7')
  const primaryColorHover = pickCssVarColor(styleDecl, ['--vscode-button-hoverBackground'], '#7fe7c4')
  const bodyColor = pickCssVarColor(styleDecl, ['--vscode-editor-background'], fallbackBg)
  const widgetColor = pickCssVarColor(styleDecl, ['--vscode-editorWidget-background', '--vscode-editor-background'], bodyColor)
  const inputColor = pickCssVarColor(styleDecl, ['--vscode-input-background', '--vscode-editor-background'], bodyColor)
  const borderColor = pickCssVarColor(styleDecl, ['--vscode-panel-border', '--vscode-widget-border'], fallbackBorder)
  const textColor = pickCssVarColor(styleDecl, ['--vscode-editor-foreground'], fallbackText)
  const subTextColor = pickCssVarColor(styleDecl, ['--vscode-descriptionForeground', '--vscode-editor-foreground'], textColor)
  const inputTextColor = pickCssVarColor(styleDecl, ['--vscode-input-foreground', '--vscode-editor-foreground'], textColor)
  const placeholderColor = pickCssVarColor(styleDecl, ['--vscode-input-placeholderForeground', '--vscode-descriptionForeground'], subTextColor)

  return {
    common: {
      // 解析成真实颜色值，避免 Naive UI 在 seemly/rgba 中处理 var(...) 报错。
      primaryColor,
      primaryColorHover,
      primaryColorPressed: primaryColor,
      borderRadius: '2px',
      bodyColor,
      cardColor: widgetColor,
      modalColor: widgetColor,
      popoverColor: widgetColor,
      tableColor: widgetColor,
      inputColor,
      borderColor,
      dividerColor: borderColor,
      textColorBase: textColor,
      textColor1: textColor,
      textColor2: subTextColor,
      textColor3: subTextColor,
      inputTextColor,
      placeholderColor,
    }
  }
})
</script>


<template>
  <n-config-provider :theme="theme" :theme-overrides="themeOverrides" :hljs="hljs">
    <n-message-provider>
      <app :is-dark="isDark" @toggle-theme="toggleTheme" />
    </n-message-provider>
  </n-config-provider>
</template>
