const bigTableColumns = Array.from({ length: 24 }, (_, index) => `Колонка${index + 1}`);

function makeBigTableRows(version: 'left' | 'right') {
  return Array.from({ length: 50 }, (_, rowIndex) => {
    const rowNo = rowIndex + 1;
    const rowId = `ROW-${String(rowNo).padStart(3, '0')}`;

    const cells = Object.fromEntries(
      bigTableColumns.map((column, columnIndex) => {
        const colNo = columnIndex + 1;

        if (version === 'right') {
          if (rowNo % 10 === 0 && colNo % 4 === 0) return [column, `R${rowNo}-C${colNo}-updated`];
          if (rowNo === 7 && colNo >= 20) return [column, `R${rowNo}-C${colNo}-replaced`];
        }

        return [column, `R${rowNo}-C${colNo}`];
      })
    );

    return { id: rowId, cells };
  });
}

const leftBigRows = makeBigTableRows('left');
const rightBigRowsBase = makeBigTableRows('right');

const rightBigRows = [
  ...rightBigRowsBase.filter((row) => row.id !== 'ROW-014' && row.id !== 'ROW-033'),
  {
    id: 'ROW-051',
    cells: Object.fromEntries(bigTableColumns.map((column, index) => [column, `NEW-R51-C${index + 1}`]))
  },
  {
    id: 'ROW-052',
    cells: Object.fromEntries(bigTableColumns.map((column, index) => [column, `NEW-R52-C${index + 1}`]))
  }
];

export const sampleLeft = {
  type: 'structure',
  fields: {
    'Номер': '000000123',
    'Дата и время': '2026-02-08',
    'Контрагент': 'ООО Ромашка',
    'Комментарий': 'Поставка по договору 458/2025 от 12.01.2026',
    'Товары': {
      type: 'table',
      name: 'Товары и услуги',
      columns: ['Номенклатура', 'Количество', 'Цена'],
      rows: [
        { id: '2f1a9c', cells: { 'Номенклатура': 'Кофе', 'Количество': '10', 'Цена': '350' } },
        { id: '9b88d1', cells: { 'Номенклатура': 'Чай', 'Количество': '5', 'Цена': '200' } }
      ]
    },
    'БольшаяТаблица': {
      type: 'table',
      name: 'Таблица производственных показателей',
      columns: bigTableColumns,
      rows: leftBigRows
    },
    'ПеремещенияСтрок': {
      type: 'table',
      name: 'Пример перемещений',
      columns: ['Код', 'Описание'],
      rows: [
        { id: 'A1', cells: { 'Код': 'A1', 'Описание': 'Строка 1' } },
        { id: 'B2', cells: { 'Код': 'B2', 'Описание': 'Строка 2' } },
        { id: 'C3', cells: { 'Код': 'C3', 'Описание': 'Строка 3' } }
      ]
    }
  }
};

export const sampleRight = {
  $format: '1c-diff-json-1',
  type: 'structure',
  fields: {
    'Номер': '000000123',
    'Дата': '2026-02-09',
    'Контрагент': 'ООО Ромашка',
    'Комментарий': 'Поставка по договору 458/2025 от 12.01.2026, доставка перенесена на пятницу',
    'Товары': {
      type: 'table',
      columns: ['Номенклатура', 'Количество', 'Цена'],
      rows: [
        { id: '2f1a9c', cells: { 'Номенклатура': 'Кофе', 'Количество': '12', 'Цена': '350' } },
        { id: '77a221', cells: { 'Номенклатура': 'Сахар', 'Количество': '3', 'Цена': '90' } }
      ]
    },
    'БольшаяТаблица': {
      type: 'table',
      name: 'Таблица производственных показателей',
      columns: bigTableColumns,
      rows: rightBigRows
    },
    'ПеремещенияСтрок': {
      type: 'table',
      name: 'Пример перемещений',
      columns: ['Код', 'Описание'],
      rows: [
        { id: 'B2', cells: { 'Код': 'B2', 'Описание': 'Строка 2' } },
        { id: 'A1', cells: { 'Код': 'A1', 'Описание': 'Строка 1' } },
        { id: 'C3', cells: { 'Код': 'C3', 'Описание': 'Строка 3' } }
      ]
    }
  }
};
