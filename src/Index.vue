<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { darkTheme, NConfigProvider, NMessageProvider } from 'naive-ui'
import App from './App.vue'

// 主题管理 - 检测系统主题
const getSystemTheme = () => {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

const isDark = ref(getSystemTheme())

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
  
  // 监听系统主题变化（仅在没有用户偏好时生效）
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', (e) => {
    // 只有在用户没有手动设置过主题时才跟随系统
    if (!localStorage.getItem('theme')) {
      isDark.value = e.matches
      updateThemeColor(isDark.value)
    }
  })
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
}

// 主题配置
const theme = computed(() => isDark.value ? darkTheme : null)
const themeOverrides = {
  common: {
    primaryColor: '#63e2b7',
    primaryColorHover: '#7fe7c4',
    primaryColorPressed: '#5acea7',
    borderRadius: '2px'
  }
}
</script>


<template>
  <n-config-provider :theme="theme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <app :is-dark="isDark" @toggle-theme="toggleTheme" />
    </n-message-provider>
  </n-config-provider>
</template>