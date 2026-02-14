import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // 自定义域名直接使用根路径
  base: '/',
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // 将 Vue 相关库单独打包
          'vue-vendor': ['vue'],
          // 将 Naive UI 单独打包
          'naive-ui': ['naive-ui'],
          // 将 ECharts 单独打包
          'echarts': ['echarts', 'vue-echarts'],
          // 将其他第三方库单独打包
          'vendor': ['highlight.js', 'vue-virtual-scroller']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
})