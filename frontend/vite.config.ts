import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendPort = process.env.VITE_BACKEND_PORT || env.VITE_BACKEND_PORT || '8001'
  const backendHost = '127.0.0.1'
  const devServerPort = Number.parseInt(process.env.PORT || env.PORT || '5173', 10)
  const strictDevPort = process.env.ELENCHUS_STRICT_FRONTEND_PORT === '1' || Boolean(process.env.PORT || env.PORT)
  const hmrEnabled = process.env.ELENCHUS_DISABLE_HMR !== '1'
  const proxy: Record<string, ProxyOptions> = {
    '/api/ws': {
      target: `ws://${backendHost}:${backendPort}`,
      ws: true,
      changeOrigin: true,
      configure: (proxy) => {
        proxy.on('error', () => { /* suppress ECONNABORTED noise */ });
      },
    },
    '/api': {
      target: `http://${backendHost}:${backendPort}`,
      changeOrigin: true,
      configure: (proxy) => {
        proxy.on('error', () => { /* suppress proxy noise */ });
      },
    },
  }

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
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'html'],
        reportsDirectory: './coverage',
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/**/*.test.{ts,tsx}',
          'src/test/**',
          'src/main.tsx',
          'src/vite-env.d.ts',
          'src/types/**',
        ],
        // Measured, not gated: `npm run test:coverage` reports the numbers so
        // regressions are visible without blocking CI on a moving target.
      },
    },
    server: {
      host: backendHost,
      port: Number.isInteger(devServerPort) && devServerPort > 0 ? devServerPort : 5173,
      strictPort: strictDevPort,
      hmr: hmrEnabled,
      proxy,
    },
    preview: {
      host: backendHost,
      port: Number.isInteger(devServerPort) && devServerPort > 0 ? devServerPort : 5173,
      strictPort: strictDevPort,
      proxy,
    },
  }
})
