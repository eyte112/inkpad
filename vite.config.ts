import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // P1: 重定向到 common 入口，只加载 ~36 种常用语言而非全量 594 种
      'rehype-prism-plus': 'rehype-prism-plus/common',
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/functions': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: 'hidden',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (/react-dom|react-router-dom/.test(id)) return 'react-vendor';
            if (id.includes('@tanstack/react-query')) return 'query';
            if (id.includes('@uiw/react-md-editor')) return 'md-editor';
            // P2: 合并 preview + syntax + unified 为 md-core，消除循环依赖
            if (id.includes('@uiw/react-markdown-preview')) return 'md-core';
            if (/refractor|rehype-prism|prismjs|unified|rehype|remark|hast|mdast|micromark|unist|vfile/.test(id)) return 'md-core';
            if (id.includes('date-fns')) return 'date-fns';
            if (id.includes('@radix-ui')) return 'radix-ui';
            // P3: 合并 lucide 图标碎片到统一 chunk
            if (id.includes('lucide-react')) return 'icons';
          }
        },
      },
    },
  },
});
