# Google Sheets CRM для cheatXtwitter

Автоматична CRM-таблиця з усіма даними користувачів: Telegram username, Google email, X профіль, дати входу тощо.

## Що синхронізується

| Поле | Опис |
|------|------|
| ID, ім'я, email | Базові дані акаунта |
| Recovery email | Якщо прив'язали для відновлення |
| Способи входу | email, google, telegram, x |
| Telegram | ID, @username, ім'я, прізвище, фото, чи активний бот |
| Google | ID, email, ім'я, фото |
| X | ID, @username, ім'я, фото |
| Дати | реєстрація, оновлення, останній вхід, прив'язка провайдерів |

**Телефон Telegram:** Login Widget **не передає** номер телефону — у таблиці буде примітка. Це обмеження Telegram API.

## Крок 1 — Google Таблиця

1. Відкрийте [Google Sheets](https://sheets.google.com) → **Створити** нову таблицю.
2. Скопіюйте **ID таблиці** з URL:  
   `https://docs.google.com/spreadsheets/d/`**`ЦЕЙ_ID`**`/edit`
3. (Опційно) **Розширення → Apps Script** → вставте код з `scripts/google-sheets-crm-setup.gs` → запустіть `setupCrmSheets()` для фільтрів і кольорів.

## Крок 2 — Service Account (Google Cloud)

1. [Google Cloud Console](https://console.cloud.google.com/) → новий проєкт (або існуючий).
2. **APIs & Services → Library** → увімкніть **Google Sheets API**.
3. **APIs & Services → Credentials → Create credentials → Service account**.
4. Створіть ключ **JSON** і завантажте файл.
5. Відкрийте JSON — знадобиться весь вміст для env.

## Крок 3 — Доступ до таблиці

1. У JSON знайдіть поле `"client_email"` (наприклад `crm-sync@project.iam.gserviceaccount.com`).
2. У Google Таблиці натисніть **Надати доступ** і додайте цей email як **Редактор**.

## Крок 4 — Змінні на сервері (Render / .env)

```env
GOOGLE_SHEETS_ID=ваш_id_таблиці

# Весь JSON service account в один рядок (або base64):
GOOGLE_SHEETS_CREDENTIALS_JSON={"type":"service_account","project_id":"...",...}
```

На Render: вставте JSON як одне значення (без переносів рядків) або закодуйте в base64.

## Крок 5 — Перевірка

1. Задеплойте сервер з новими змінними.
2. Відкрийте `https://ВАШ-API/admin` → увійдіть з `ADMIN_SECRET`.
3. Натисніть **Синхронізувати Google Sheets** — з'являться вкладки **Користувачі** і **Статистика**.

Після цього кожна **реєстрація / вхід / прив'язка email / відключення Telegram** оновлює рядок у таблиці автоматично.

## Вкладки

- **Користувачі** — повна CRM-таблиця (31 колонка).
- **Статистика** — загальні цифри + реєстрації по днях.

## API (для автоматизації)

```http
POST /admin/api/sheets-sync
Authorization: Bearer YOUR_ADMIN_SECRET
```

Відповідь: `{ "total": 42, "updated": 40, "appended": 2 }`
