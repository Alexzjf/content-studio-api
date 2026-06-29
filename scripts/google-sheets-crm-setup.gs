/**
 * cheatXtwitter — оформлення Google Sheets CRM
 *
 * 1. Створіть нову Google Таблицю
 * 2. Розширення → Apps Script
 * 3. Вставте цей код, збережіть
 * 4. Запустіть setupCrmSheets() один раз (дозвольте доступ)
 *
 * Дані підтягуються автоматично з сервера при реєстрації/вході.
 * Повна синхронізація: POST /admin/api/sheets-sync або кнопка в /admin
 */

const USERS_SHEET = 'Користувачі';
const STATS_SHEET = 'Статистика';

const HEADERS = [
  'ID користувача', "Ім'я", 'Email (основний)', 'Placeholder email', 'Recovery email',
  'Дата реєстрації', 'Оновлено', 'Останній вхід', 'Основний спосіб входу', 'Усі способи входу',
  'Є пароль', "Email — прив'язано", 'Google ID', 'Google email', 'Google ім\'я', 'Google фото',
  "Google — прив'язано", 'Telegram ID', 'Telegram @username', 'Telegram ім\'я', 'Telegram прізвище',
  'Telegram фото', 'Telegram бот активний', "Telegram — прив'язано", 'Примітка (телефон TG)',
  'X ID', 'X @username', 'X ім\'я', 'X фото', "X — прив'язано", 'Синхронізовано'
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('cheatX CRM')
    .addItem('Налаштувати таблицю', 'setupCrmSheets')
    .addItem('Оновити фільтри', 'applyFilters')
    .addToUi();
}

function setupCrmSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let users = ss.getSheetByName(USERS_SHEET);
  let stats = ss.getSheetByName(STATS_SHEET);

  if (!users) users = ss.insertSheet(USERS_SHEET);
  if (!stats) stats = ss.insertSheet(STATS_SHEET);

  const first = users.getRange(1, 1).getValue();
  if (first !== HEADERS[0]) {
    users.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }

  const header = users.getRange(1, 1, 1, HEADERS.length);
  header.setFontWeight('bold')
    .setBackground('#1a1a22')
    .setFontColor('#e8e8ec')
    .setWrap(true);
  users.setFrozenRows(1);
  users.setColumnWidths(1, HEADERS.length, 140);
  users.setColumnWidth(1, 280);
  users.setColumnWidth(2, 160);
  users.setColumnWidth(3, 200);

  applyFilters();
  formatProviderColumn(users);
  stats.getRange('A1:B1').setFontWeight('bold').setBackground('#252530');

  SpreadsheetApp.getUi().alert('CRM таблицю налаштовано. Підключіть сервер (див. GOOGLE_SHEETS_CRM.md).');
}

function applyFilters() {
  const users = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USERS_SHEET);
  if (!users) return;
  const lastRow = Math.max(users.getLastRow(), 1);
  const range = users.getRange(1, 1, lastRow, HEADERS.length);
  if (users.getFilter()) users.getFilter().remove();
  range.createFilter();
}

function formatProviderColumn(users) {
  const rules = users.getConditionalFormatRules();
  const col = 9;
  const lastRow = Math.max(users.getMaxRows(), 1000);

  const providers = [
    { text: 'telegram', bg: '#1a3a4a', fg: '#7dd3fc' },
    { text: 'google', bg: '#2a2418', fg: '#fcd34d' },
    { text: 'x', bg: '#1a1a22', fg: '#a1a1aa' },
    { text: 'email', bg: '#1a2a1a', fg: '#86efac' },
  ];

  providers.forEach((p) => {
    const rule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains(p.text)
      .setBackground(p.bg)
      .setFontColor(p.fg)
      .setRanges([users.getRange(2, col, lastRow - 1, 1)])
      .build();
    rules.push(rule);
  });

  users.setConditionalFormatRules(rules);
}
