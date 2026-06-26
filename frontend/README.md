# Interview Coach Frontend

Минимальный фронтенд для Interview Coach на Next.js (app router).

## Запуск

```bash
npm install
npm run dev
```

По умолчанию запросы идут на `http://localhost:8000`. Можно переопределить:

```bash
export NEXT_PUBLIC_API_BASE=http://localhost:8000
```

## Тесты

```bash
npm test
npm run typecheck
```

## CI-проверка

Для pull request ожидается тот же минимальный набор:

```bash
npm test -- --run
npm run typecheck
```
