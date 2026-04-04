# Техническое задание (ТЗ)
**Проект:** Interview Coach (помощник для собеседований)

## 1. Цель и польза
**Цель:** помочь junior/middle разработчикам подготовиться к техническим собеседованиям по структурной программе, с ИИ‑симуляцией интервью и измеримым прогрессом.

**Метрики ценности:**
- Рост успешных тех‑скринов (целевое значение: +30% в течение 6 недель)
- Рост самооценки уверенности (NPS‑шкала 1–10, цель: +2 пункта)
- Доля закрытых тем из плана (цель: ≥80% за 4–6 недель)

## 2. Домен, репозиторий и расположение
- **Поддомен UI:** `https://interview.botelo.ru/`
- **Папка проекта:** `/projects/interview-coach/`
- **Репозиторий:** `https://github.com/the-lans/interview-botelo`
- **Правила Git:** пуш в `main` только на старте проекта; далее — только через ветки + PR. Для итераций — заводить issues.

## 3. Стек и архитектура
**Backend:** Python 3.14+, FastAPI (async), PostgreSQL, Redis (опционально для кэша), Celery/RQ (опционально). 
**Frontend:** полноценный UI → **React/Next.js** (требуется авторизация и сложная логика). 
**ИИ:** через локальный **OpenClaw AI Gateway** (прокси‑эндпоинт внутри сервера).

### 3.1. AI Proxy (OpenClaw Gateway)
- **Endpoint:** `POST /ai/chat` (backend‑прокси)
- **Upstream:** `http://127.0.0.1:18789/v1/chat/completions`
- **Auth:** `Authorization: Bearer <OPENCLAW_API_TOKEN>`
- **Model:** `openclaw/devius` (по умолчанию), опционально `openclaw/main`
- **Request body (пример):**
 ```json
 {"model":"openclaw/devius","messages":[{"role":"user","content":"..."}]}
 ```
- **Примечание:** токен хранится только в `.env` (не коммитить).

## 4. Авторизация (простая, но безопасная)
- Email + пароль (bcrypt/argon2), сессии через HTTP‑only cookies.
- CSRF‑защита.
- Rate‑limit на логин.
- Минимальная роль: user (админ необязателен на MVP).

## 5. Входные данные
- Загрузка резюме: **.md, .rtf, .doc/.docx**
- Загрузка вакансии: текст в форме + файл (опционально)

## 6. Функции MVP
1) **План подготовки**
 - Генерация персонального плана на 2–6 недель по резюме и вакансии.
 - Темы: Python core, алгоритмы, system design, БД, async, devops, тесты.

2) **База вопросов**
 - Хранилище вопросов по темам.
 - Метки сложности, теги, пример ответов.

3) **Симуляция интервью**
 - Режим «интервьюер задаёт вопросы» + оценка ответов.
 - Итоговый фидбек (сильные/слабые стороны, next steps).

4) **Трекинг прогресса**
 - Статус тем (todo/in‑progress/done)
 - Прогресс‑бар и история сессий

## 7. Основные экраны UI
- Login/Signup
- Dashboard (статус прогресса)
- План подготовки
- База вопросов (фильтры/поиск)
- Симуляция интервью (чат + оценка)
- История попыток

## 8. API (ключевые эндпоинты)
- `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`
- `POST /upload/resume`
- `POST /plan/generate`
- `GET /questions`, `GET /questions?tags=...`
- `POST /interview/start`
- `POST /interview/answer`
- `GET /progress`

## 9. Модель данных (черновик)
- `users(id, email, hash, created_at)`
- `resumes(id, user_id, content, created_at)`
- `plans(id, user_id, content, created_at)`
- `questions(id, topic, difficulty, text, sample_answer)`
- `interview_sessions(id, user_id, started_at, score)`
- `interview_answers(id, session_id, question, answer, feedback, score)`
- `progress(id, user_id, topic, status, updated_at)`

## 10. Нефункциональные требования
- Асинхронный backend, типизация, ruff форматирование.
- Тесты: unit + интеграционные (pytest).
- API‑валидация входных данных.
- Документация (OpenAPI).

## 11. План работ (MVP)
1) Инициализация проекта, структура `/projects/interview-coach/` 
2) Auth + User модель 
3) Upload резюме + парсинг 
4) Генерация плана 
5) База вопросов 
6) Интервью симуляция 
7) Прогресс‑трекинг 
8) UI + интеграция 
9) Тесты и деплой

---

**Готов согласовать/уточнить. После подтверждения — старт прототипа.**
