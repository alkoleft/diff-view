import { readFileSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'

/**
 * Плагин Vite для создания единого HTML файла
 * Инлайнит все CSS и JS ресурсы в HTML
 */
export function singleFilePlugin() {
  return {
    name: 'single-file-build',
    closeBundle() {
      const distDir = resolve(process.cwd(), 'dist')
      const htmlFile = join(distDir, 'index.html')
      
      try {
        // Читаем HTML файл
        let htmlContent = readFileSync(htmlFile, 'utf-8')
        
        console.log('Обрабатываем HTML файл для создания единого файла')

        const replacements = []

        // Находим все CSS файлы
        const cssRegex = /<link[^>]*href="([^"]*\.css)"[^>]*>/g
        let cssMatch
        
        while ((cssMatch = cssRegex.exec(htmlContent)) !== null) {
          replacements.push({
            type: 'css',
            fullMatch: [cssMatch.index, cssMatch[0].length],
            path: cssMatch[1],
            index: cssMatch.index
          })
        }

        // Находим все JS файлы
        const jsRegex = /<script([^>]*?)src="([^"]*\.js)"([^>]*)><\/script>/g
        let jsMatch
        
        while ((jsMatch = jsRegex.exec(htmlContent)) !== null) {
          replacements.push({
            type: 'js',
            fullMatch: [jsMatch.index, jsMatch[0].length],
            path: jsMatch[2],
            index: jsMatch.index,
            hasModule: /type=["']module["']/.test(jsMatch[0]),
            preAttrs: jsMatch[1],
            postAttrs: jsMatch[3]
          })
        }

        // Находим modulepreload для JS (удаляем, т.к. все инлайним)
        const modulePreloadRegex = /<link[^>]*rel=["']modulepreload["'][^>]*href="([^"]*\.js)"[^>]*>/g
        let preloadMatch
        
        while ((preloadMatch = modulePreloadRegex.exec(htmlContent)) !== null) {
          replacements.push({
            type: 'preload',
            fullMatch: [preloadMatch.index, preloadMatch[0].length],
            path: preloadMatch[1],
            index: preloadMatch.index
          })
        }

        // Сортируем по убыванию индекса
        replacements.sort((a, b) => b.index - a.index)

        // Выполняем замены с конца файла
        for (const replacement of replacements) {
          if (!replacement.path) {
            continue
          }

          if (/^(https?:)?\/\//.test(replacement.path) || replacement.path.startsWith('data:')) {
            continue
          }

          if (replacement.type === 'preload') {
            htmlContent = replaceTextAtPosition(htmlContent,
              replacement.fullMatch[0], replacement.fullMatch[1],
              ''
            )
            continue
          }

          const normalizedPath = replacement.path.startsWith('/')
            ? replacement.path.slice(1)
            : replacement.path

          const fullPath = join(distDir, normalizedPath)
          
          try {
            const content = readFileSync(fullPath, 'utf-8')
            
            if (replacement.type === 'css') {
              console.log('Инлайним CSS:', replacement.path)
              htmlContent = replaceTextAtPosition(htmlContent,
                replacement.fullMatch[0], replacement.fullMatch[1],
                `<style>\n${content}\n</style>`
              )
            } else if (replacement.type === 'js') {
              console.log('Инлайним JS:', replacement.path)
              const rawAttrs = `${replacement.preAttrs || ''}${replacement.postAttrs || ''}`
              const cleanedAttrs = rawAttrs.replace(/\s*src=["'][^"']+["']/i, '')
              const scriptAttrs = cleanedAttrs || (replacement.hasModule ? ' type="module"' : '')
              htmlContent = replaceTextAtPosition(htmlContent,
                replacement.fullMatch[0], replacement.fullMatch[1],
                `<script${scriptAttrs}>\n${content}\n</script>`
              )
            }
          } catch (error) {
            console.warn('Не удалось прочитать файл:', replacement.path, error.message)
          }
        }
        // Создаем копию с другим именем
        const standaloneFile = join(distDir, 'index-standalone.html')
        writeFileSync(standaloneFile, htmlContent, 'utf-8')
        console.log('Создан standalone файл:', standaloneFile)
        
      } catch (error) {
        console.error('Ошибка при создании единого файла:', error.message)
      }
    }
  }
}

function replaceTextAtPosition(originalString, startIndex, endIndex, replacementText) {
  // Get the part of the string before the replacement area
  const before = originalString.substring(0, startIndex);

  // Get the part of the string after the replacement area
  const after = originalString.substring(startIndex + endIndex);

  // Concatenate the parts with the replacement text in between
  return before + replacementText + after;
}
