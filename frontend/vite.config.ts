import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendPort = env.VITE_BACKEND_PORT || '8001'

  const manualChunks = (id: string) => {
    if (!id.includes('node_modules')) return undefined

    if (
      id.includes('/react/') ||
      id.includes('/react-dom/') ||
      id.includes('/scheduler/')
    ) {
      return 'vendor-react'
    }

    if (
      id.includes('/framer-motion/') ||
      id.includes('/lucide-react/')
    ) {
      return 'vendor-ui'
    }

    return 'vendor'
  }

  return {
    plugins: [
      react(),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
    server: {
      port: 5173,
      proxy: {
        '/api/ws': {
          target: `ws://localhost:${backendPort}`,
          ws: true,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', () => { /* suppress ECONNABORTED noise */ });
          },
        },
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', () => { /* suppress proxy noise */ });
          },
        },
      },
    },
  }
})
