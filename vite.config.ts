import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const isTauriDev = Boolean(process.env.TAURI_ENV_PLATFORM || process.env.TAURI_DEV_HOST)

export default defineConfig({
  plugins: [
    vue(),
    // 自定义插件：强制忽略 "pkgs copy" 目录下的模块
    {
      name: 'ignore-pkgs-copy',
      resolveId(source, importer) {
        // 如果导入来源（importer）位于 "pkgs copy" 目录内，直接返回 false 表示外部
        if (importer && importer.replace(/\\/g, '/').includes('pkgs copy')) {
          return { id: source, external: true }
        }
        return null
      }
    }
  ],
  base: '/',
  server: {
    port: 5173,
    open: !isTauriDev,
    watch: {
      // 让文件监视器忽略该目录，避免重启和扫描
      ignored: ['**/sample/**']
    }
  },
  optimizeDeps: {
    // 限制依赖预构建的入口范围，避免 Vite 扫描到那个目录
    entries: [
      'src/**/*.{js,ts,jsx,tsx,vue}',
      'index.html',
      // 如果你的项目还有其他入口（如 main.ts），可以继续加
    ]
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    modulePreload: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')

          if (!normalizedId.includes('/node_modules/')) return undefined

          if (normalizedId.includes('/node_modules/vue/')) return 'vue-vendor'
          if (normalizedId.includes('/node_modules/naive-ui/')) return 'naive-ui'
          if (normalizedId.includes('/node_modules/echarts/') || normalizedId.includes('/node_modules/vue-echarts/')) return 'echarts'
          if (normalizedId.includes('/node_modules/elkjs/')) return 'elkjs'
          if (normalizedId.includes('/node_modules/highlight.js/') || normalizedId.includes('/node_modules/vue-virtual-scroller/')) {
            return 'vendor'
          }

          return undefined
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
