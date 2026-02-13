import { defineConfig } from 'vite'
import { resolve } from 'path'
import { singleFilePlugin } from './vite-plugin-single-file.js'

export default defineConfig(({ mode }) => {
  const isSingleFile = mode === 'single-file'

  return {
    base: './',
    build: {
      rollupOptions: {
        input: isSingleFile
          ? {
              main: resolve(__dirname, 'index.html')
            }
          : {
              main: resolve(__dirname, 'index.html'),
              demo: resolve(__dirname, 'demo.html')
            },
        output: {
          entryFileNames: isSingleFile ? 'assets/[name].js' : 'assets/[name]-[hash].js',
          chunkFileNames: isSingleFile ? 'assets/[name].js' : 'assets/[name]-[hash].js',
          assetFileNames: isSingleFile ? 'assets/[name].[ext]' : 'assets/[name]-[hash].[ext]',
          manualChunks: undefined
        }
      },
      target: 'es2018',
      minify: 'terser',
      sourcemap: true,
      codeSplitting: isSingleFile ? false : true,
      cssCodeSplit: false,
      assetsInlineLimit: isSingleFile ? 100000000 : 4096,
      outDir: 'dist'
    },
    server: {
      port: 3000,
      open: true
    },
    define: {
      'process.env.NODE_ENV': '"production"'
    },
    plugins: [
      ...(isSingleFile
        ? [
            singleFilePlugin()
          ]
        : [])
    ],
    esbuild: {
      target: 'es2018'
    }
  }
})
