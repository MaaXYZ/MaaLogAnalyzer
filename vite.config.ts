import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { resolveUmamiWebsiteId, UMAMI_SCRIPT_SRC } from './scripts/umami-analytics.mjs'

const isTauriDev = Boolean(process.env.TAURI_ENV_PLATFORM || process.env.TAURI_DEV_HOST)
const { version: appVersion } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'emit-app-version-manifest',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version: appVersion }) + '\n',
        })
      },
    },
    // 仅在浏览器构建注入 Umami 统计脚本，index.html 本身保持无远程脚本
    {
      name: 'inject-umami-analytics',
      transformIndexHtml() {
        const websiteId = resolveUmamiWebsiteId(process.env)
        if (!websiteId) return []
        return [
          {
            tag: 'script',
            injectTo: 'head' as const,
            attrs: {
              async: true,
              src: UMAMI_SCRIPT_SRC,
              'data-website-id': websiteId,
            },
          },
        ]
      },
    },
  ],
  base: '/',
  server: {
    port: 5173,
    open: !isTauriDev,
    watch: {
      // 让文件监视器忽略该目录，避免重启和扫描
      ignored: ['**/sample/**'],
    },
  },
  optimizeDeps: {
    // 限制依赖预构建的入口范围，避免 Vite 扫描无关目录
    entries: [
      'src/**/*.{js,ts,jsx,tsx,vue}',
      'index.html',
      // 如果你的项目还有其他入口（如 main.ts），可以继续加
    ],
  },
  worker: {
    format: 'es',
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
          if (normalizedId.includes('/node_modules/elkjs/')) return 'elkjs'
          if (
            normalizedId.includes('/node_modules/highlight.js/') ||
            normalizedId.includes('/node_modules/vue-virtual-scroller/')
          ) {
            return 'vendor'
          }

          return undefined
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
