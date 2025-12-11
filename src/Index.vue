<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { darkTheme, NConfigProvider, NMessageProvider } from 'naive-ui'
import App from './App.vue'

// 主题管理
const isDark = ref(true)

// 从 localStorage 加载主题偏好
onMounted(() => {
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme) {
    isDark.value = savedTheme === 'dark'
  }
  updateThemeColor(isDark.value)
})

// 更新浏览器主题颜色
const updateThemeColor = (dark: boolean) => {
  requestAnimationFrame(() => {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]')
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', dark ? '#18181c' : '#ffffff')
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
