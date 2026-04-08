# The Barber Hub Backend

API Node.js/Express para deploy no Render.

## Variaveis de ambiente

Use `.env` com base em `.env.example`:

- `PORT`: porta da API (Render injeta automaticamente, fallback local: `3001`)
- `FRONTEND_ORIGIN`: origem principal do frontend (ex.: dominio da Vercel)
- `CORS_ORIGINS`: lista separada por virgula de origens permitidas no CORS

Exemplo:

```env
PORT=3001
FRONTEND_ORIGIN=https://seu-frontend.vercel.app
CORS_ORIGINS=https://seu-frontend.vercel.app,http://localhost:8080
```

## Scripts

- `npm run dev`: modo desenvolvimento
- `npm start`: modo producao

## Rota de health check

- `GET /api/health`
