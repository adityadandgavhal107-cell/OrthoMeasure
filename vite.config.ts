import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // Ignore Flutter build output and large binary files to prevent EBUSY crashes.
      // Flutter's Android/iOS build directories contain thousands of locked asset
      // files that Vite's file watcher cannot access on Windows.
      ignored: [
        // Flutter build artifacts (main culprit)
        '**/flutter_app/build/**',
        '**/flutter_app/.dart_tool/**',
        '**/flutter_app/.gradle/**',
        '**/flutter_app/android/.gradle/**',
        '**/flutter_app/android/app/build/**',
        // Dataset ZIPs and large files
        '**/*.zip',
        '**/*.stl',
        // Model weight files (large JSON, updated by Python — not source code)
        '**/rl_model_data.json',
        '**/rl_training_notes.json',
      ]
    }
  }
})
