import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendPort = env.VITE_BACKEND_PORT || '8001'

  return {
    plugins: [
      react(),
    ],
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
