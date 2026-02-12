# diff-view

Встраиваемый веб-компонент для визуального сравнения данных в `1С:Предприятие 8`:

- Объекты;
- табличные части (сопоставление строк, добавления/удаления/изменения);
- JSON и вложенные структуры;
- подсветка изменений внутри значений.

Проект ориентирован на использование внутри инструментов тестирования и анализа для 1С.

## Использование в проектах

- Используется: https://github.com/bia-technologies/rat
- Планируется использование:
  - https://github.com/bia-technologies/yaxunit
  - https://github.com/bia-technologies/edt-test-runner

## Возможности

- Сравнение объектов с учетом структуры.
- Сравнение табличных данных с выравниванием строк.
- Выявление `added` / `removed` / `changed` / `unchanged`.
- Кастомная визуализация diff.
- Demo-страница с крупным набором данных (`demo.html`).

## Технологии

- TypeScript
- Vite
- jsondiffpatch (для структурного сравнения полей)

## Запуск

```bash
pnpm install
pnpm dev
```

Demo:

```bash
pnpm demo
```

## Сборка

Обычная сборка:

```bash
pnpm build
```

Сборка single-file (под встраивание одним HTML):

```bash
pnpm vite build --mode single-file
```

После single-file сборки плагин создает `dist/index-standalone.html`.

## Публичный API для интеграции

После инициализации приложение экспортирует функции в `window`:

- `window.setLeftVersion(jsonOrString)`
- `window.setRightVersion(jsonOrString)`
- `window.setVersions(leftJsonOrString, rightJsonOrString)`
- `window.loadSample()`

Это позволяет передавать данные из хоста (в т.ч. из 1С через встроенный браузер/HTML-документ).

## Структура проекта

- `src/app/index.ts` — bootstrap и публичный API
- `src/app/diff.ts` — алгоритмы сравнения структур/таблиц
- `src/app/render.ts` — рендер diff
- `src/app/normalize.ts` — нормализация входных данных
- `src/app/sample.ts` — demo-данные
- `demo.html` + `src/demo.ts` — demo-страница

## Лицензия

Пока не указана.
