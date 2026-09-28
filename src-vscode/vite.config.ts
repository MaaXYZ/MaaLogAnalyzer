import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// VS Code Webview 专用构建配置
export default defineConfig({
  plugins: [vue()],
  base: './',
  root: path.resolve(__dirname, '..'),
  worker: {
    format: 'es',
  },
  build: {
    outDir: path.resolve(__dirname, 'webview'),
    assetsDir: 'assets',
    sourcemap: false,
    // 固定入口与动态 chunk 的文件名（webview 里靠相对路径加载，不能带 hash）
    rollupOptions: {
      output: {
        manualChunks: undefined,
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    chunkSizeWarningLimit: 5000,
  },
  define: {
    // 标记为 VS Code 环境
    __VSCODE__: JSON.stringify(true),
  },
})
