# Steam Library Mini App (Vercel + Supabase)

Структура: `public/index.html` (интерфейс) · `api/` (функции Vercel) · `lib/core.js` (БД, шифрование, проверка Telegram) · `db/` (схема и данные) · `scripts/add-account.js`.

## Запуск
1. Залей папку в GitHub-репозиторий и импортируй его в Vercel.
2. Создай проект в Supabase. Project Settings, Database, Connection string, **Transaction pooler**: скопируй строку (подставь пароль БД), это будет `DATABASE_URL`.
3. В Supabase, SQL Editor: выполни `db/schema.sql`, затем `db/seed.sql`.
4. Переменные окружения в Vercel (Settings, Environment Variables):
   - `BOT_TOKEN` токен бота из @BotFather
   - `WEBHOOK_SECRET` любая длинная случайная строка
   - `ACC_KEY` ключ шифрования: `openssl rand -base64 32` (потеряешь ключ, потеряешь пароли)
   - `OWNER_ID` числовой Telegram ID владельца (@nellmet), узнать можно у @userinfobot. Если не задать, первый вход @nellmet привяжет его ID сам, но надёжнее задать
   - `CRON_SECRET` любая длинная случайная строка (Vercel сам подставит её в запросы крона)
   - `STARS_PER_RUB` сколько Stars за 1 ₽, например `0.7`
   - `KZT_RUB` запасной курс, если сайт ЦБ недоступен, например `0.17`
5. Деплой. Потом вебхук бота:
   `curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" -d "url=https://<домен>/api/bot" -d "secret_token=<WEBHOOK_SECRET>"`
6. В @BotFather: Menu Button или Mini App, адрес `https://<домен>`.
7. Аккаунты лежат в `accounts.local.json` (в git не попадает). Загрузи их зашифрованными: `node --env-file=.env.local scripts/seed-accounts.js`, затем **удали этот файл**. Ещё один аккаунт можно добавить так:
    (локально, с `.env.local` из Vercel: `vercel env pull .env.local`):
   `node --env-file=.env.local scripts/add-account.js 1 логин пароль 5`
8. Цены Steam: крон запускается раз в сутки в 04:00 UTC. Первый раз можно вызвать вручную:
   `curl -H "Authorization: Bearer <CRON_SECRET>" https://<домен>/api/cron/steam`

## Уже работает
Вход только через Telegram (проверка подписи), роли владелец и админ, выдача и снятие админки, оплата Stars, выдача слота, автовозврат Stars, шифрование паролей, цены Steam (KZ, в рублях).

## Дальше
Подключить фронтенд к `/api/orders` (сейчас покупки и баланс в нём демо), админка на сервере, коды Steam Guard, тикеты, статистика.
