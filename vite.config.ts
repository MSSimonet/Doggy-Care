import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { configDefaults } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],
  server: {
    port: 5173,
    host: true
  },
  test: {
    environment: 'jsdom',
    // Sólo las pruebas del proyecto: no las de copias privadas ni del proyecto nativo
    exclude: [...configDefaults.exclude, 'scratch/**', 'android/**'],
  },
})
