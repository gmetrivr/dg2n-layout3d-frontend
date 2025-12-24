import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from "path"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@/shadcn": path.resolve(__dirname, "./src/shadcn"),
    },
  },
  server: {
    proxy: {
      // Stockflow backend - only handles store 3D zip processing
      '/api/tooling/processStore3DZip': {
        target: 'https://stockflow-core.rc.dg2n.com',
        // target: 'https://stockflow-core.dg2n.com', // Use this for production backend
        changeOrigin: true,
        secure: true,
      },
      // Fastify backend - handles config, brands, fixtures APIs
      '^/(api|config)': {
        // target: 'https://dg2n-layout3d-backend.rc.dg2n.com',
        target: 'http://localhost:4260',
        changeOrigin: true,
        secure: false,
      },
      // Rhino backend - handles DWG upload, job processing, downloads only
      '^/(upload|jobs|download)': {
        target: 'http://0.0.0.0:8081',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
