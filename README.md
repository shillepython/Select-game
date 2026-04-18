# Select-game

Мини-сайт, в котором:
1. Создаёшь опросник с играми (сохраняется, имеет свой ID).
2. Для опросника генерируешь сессию — короткую ссылку для двоих.
3. Оба голосуют, выбирая до 2 игр. Когда оба отголосуют, на странице видны совпадения.

## Локальный запуск

```bash
npm install
npm start
```

Без переменных окружения данные пишутся в `data.json`. Открой `http://localhost:3000`.

## Деплой на Vercel

На Vercel serverless файловая система эфемерна, поэтому для продакшна нужно подключить Redis (Upstash). Один раз, 2 минуты:

### 1. Залей репу на GitHub

```bash
# branch уже запушен — сделай его origin на своём GitHub, например:
git remote add gh git@github.com:<твой-логин>/select-game.git
git push gh claude/game-matching-poll-AG63g:main
```

### 2. Импортируй проект в Vercel

- Зайди на `https://vercel.com/new`.
- Выбери репозиторий.
- В настройках проекта оставь всё по умолчанию (Framework: Other).
- Нажми **Deploy**.

### 3. Подключи Upstash Redis

В дашборде проекта:
- **Storage → Create Database → Upstash for Redis** (бесплатный тир).
- После создания нажми **Connect Project** — Vercel сам добавит переменные окружения `UPSTASH_REDIS_REST_URL` и `UPSTASH_REDIS_REST_TOKEN`.
- **Redeploy** проекта (или пушни пустой коммит).

Проверка: открой `https://<твой-проект>.vercel.app/healthz` — должно быть `"storage":"redis"`.

### Альтернатива через CLI

```bash
npm i -g vercel
vercel login
vercel            # deploy preview
vercel --prod     # prod deploy
```

Хранилище добавляется тем же способом через дашборд Storage.

## Структура

- `lib/app.js` — Express-приложение (используется и локально, и на Vercel)
- `lib/storage.js` — абстракция хранения (Redis если есть env-переменные, иначе `data.json`)
- `server.js` — локальный запуск
- `api/index.js` — serverless-entry для Vercel
- `vercel.json` — rewrite всех `/api/*` на функцию
- `public/` — фронтенд (hash-роутинг, никакого билда)

## Маршруты (фронт)

- `#/` — создать опросник
- `#/p/:pollId` — список сессий опросника, создание новой
- `#/s/:sessionId` — страница голосования/результатов
