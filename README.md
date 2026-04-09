# Chincoa Backend (Express + PostgreSQL)

API em Node.js + Express para autenticacao e agendamentos, sem dependencia de Supabase.

## Stack

- Node.js + Express
- PostgreSQL (driver `pg`)
- JWT (`Authorization: Bearer <token>`)
- bcrypt para hash de senha
- CORS configuravel por ambiente

## Estrutura

Projeto principal da API: [backend](backend)

- [backend/src/routes](backend/src/routes)
- [backend/src/controllers](backend/src/controllers)
- [backend/src/services](backend/src/services)
- [backend/src/middlewares](backend/src/middlewares)
- [backend/src/db](backend/src/db)
- [backend/src/utils](backend/src/utils)
- [backend/sql/001_init.sql](backend/sql/001_init.sql)

## Variaveis de ambiente

Copie [backend/.env.example](backend/.env.example) para [backend/.env](backend/.env) e preencha:

- PORT
- DATABASE_URL
- JWT_SECRET
- FRONTEND_ORIGIN
- CORS_ORIGINS
- NODE_ENV
- ADMIN_EMAIL (opcional)
- ADMIN_PASSWORD (opcional)

## Como rodar local

1. Instale dependencias:

```bash
cd backend
npm install
```

2. Rode migracao SQL inicial:

```bash
npm run migrate
```

3. Inicie em desenvolvimento:

```bash
npm run dev
```

4. Ou em modo producao:

```bash
npm start
```

## Migracao SQL

Arquivo de migracao inicial: [backend/sql/001_init.sql](backend/sql/001_init.sql)

Ele cria:

- tabela `users`
- tabela `appointments`
- indice unico parcial para impedir conflito de horario ativo no mesmo dia/hora
- indices auxiliares para consultas

Status permitidos em `appointments.status`:

- `agendado`
- `pago`
- `disponivel`

Preco padrao inicial: `45.00`

## Seed opcional de admin

Se `ADMIN_EMAIL` e `ADMIN_PASSWORD` estiverem definidos, ao subir o servidor a API garante um usuario admin inicial.

## Endpoints

### Health

- GET `/api/health`

### Auth

- POST `/api/auth/register`
- POST `/api/auth/login`
- GET `/api/auth/me` (autenticado)

### Cliente / autenticado

- GET `/api/appointments/services`
- GET `/api/appointments/me`
- POST `/api/appointments`
- DELETE `/api/appointments/:id` (dono ou admin)

## Catalogo de servicos e precos

O backend agora define o preco pelo `service_type` informado no agendamento.

- `corte`: R$ 50
- `sobrancelha`: R$ 5
- `barba`: R$ 70
- `sobrancelha_cabelo`: R$ 55
- `cabelo_sobrancelha_barba`: R$ 70
- `massagem_facial_toalha`: R$ 30
- `completo`: R$ 100

Use `GET /api/appointments/services` para obter a lista oficial.

### Admin

- GET `/api/admin/appointments?date=YYYY-MM-DD`
- PATCH `/api/admin/appointments/:id/status`
- DELETE `/api/admin/appointments/:id`
- GET `/api/admin/reports/financial?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
- GET `/api/admin/expenses/fixed`
- POST `/api/admin/expenses/fixed`
- GET `/api/admin/expenses/variable?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
- POST `/api/admin/expenses/variable`

## Exemplos de chamadas

### Registrar usuario

```bash
curl -X POST http://localhost:3001/api/auth/register \
	-H "Content-Type: application/json" \
	-d '{
		"full_name": "Maria Silva",
		"email": "maria@email.com",
		"phone": "11999999999",
		"password": "123456"
	}'
```

### Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
	-H "Content-Type: application/json" \
	-d '{"email": "maria@email.com", "password": "123456"}'
```

### Criar agendamento

```bash
curl -X POST http://localhost:3001/api/appointments \
	-H "Content-Type: application/json" \
	-H "Authorization: Bearer SEU_TOKEN" \
	-d '{
		"appointment_date": "2026-04-20",
		"appointment_time": "14:00",
		"service_type": "corte"
	}'
```

### Admin marcar pago

```bash
curl -X PATCH http://localhost:3001/api/admin/appointments/ID/status \
	-H "Content-Type: application/json" \
	-H "Authorization: Bearer TOKEN_ADMIN" \
	-d '{"status": "pago"}'
```

## Deploy no Render

Este repositorio possui um [package.json](package.json) na raiz que delega para [backend](backend). Assim voce pode usar:

- Build Command: `npm run build`
- Start Command: `npm run start`

Ou, se preferir apontar o Render para [backend](backend):

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`

## Integracao frontend (Vercel)

No frontend, use a URL publica do backend no Render como base da API.
Configure `FRONTEND_ORIGIN` e `CORS_ORIGINS` no backend com o dominio da Vercel.
