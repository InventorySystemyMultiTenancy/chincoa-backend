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
- MP_ACCESS_TOKEN
- MP_DEVICE_ID
- BACKEND_PUBLIC_URL (URL publica do backend para receber notificacoes)
- MP_SUBSCRIPTION_BACK_URL (opcional, URL de retorno para fluxo de assinatura)
- MP_API_BASE_URL (opcional, padrao Mercado Pago)
- MP_REQUEST_TIMEOUT_MS (opcional)
- MP_MAX_RETRIES (opcional)
- PAYMENT_DEBUG_LOGS (opcional)

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

Preco padrao inicial: `50.00`

## Seed opcional de admin

Se `ADMIN_EMAIL` e `ADMIN_PASSWORD` estiverem definidos, ao subir o servidor a API garante um usuario admin inicial.

## Endpoints

### Health

- GET `/api/health`

### Auth

- POST `/api/auth/register`
- POST `/api/auth/login`
- GET `/api/auth/me` (autenticado)

Regras atuais de autenticacao:

- email e opcional no cadastro
- telefone e obrigatorio no cadastro
- data de nascimento (`birth_date`) e obrigatoria no cadastro
- login e feito apenas com `phone` + `password`

Regra promocional:

- no aniversario do cliente, servico `corte` recebe 50% de desconto automaticamente
- `GET /api/auth/me` retorna `birthday_discount` para mostrar alerta na home

### Cliente / autenticado

- GET `/api/appointments/services`
- GET `/api/appointments/slots?date=YYYY-MM-DD`
- GET `/api/appointments/me`
- POST `/api/appointments`
- DELETE `/api/appointments/:id` (dono ou admin)

### Pagamentos Mercado Pago

- POST `/api/payments/create-pix` (auth)
- POST `/api/payments/create-point` (auth)
- GET `/api/payments/status/:reference` (auth)
- POST `/api/payments/cancel/:reference` (auth)
- DELETE `/api/payments/cancel/:reference` (auth)
- POST `/api/payments/ipn/mercadopago` (sem auth)
- POST `/api/payments/webhooks/mercadopago` (sem auth)
- POST `/api/payments/subscriptions/plans` (auth admin)
- GET `/api/payments/subscriptions/plans` (auth admin)
- PATCH `/api/payments/subscriptions/plans/:reference` (auth admin)
- GET `/api/payments/subscriptions/plans/public` (publico)
- POST `/api/payments/subscriptions` (auth)
- GET `/api/payments/subscriptions/:reference` (auth)
- POST `/api/payments/subscriptions/:reference/cancel` (auth)
- DELETE `/api/payments/subscriptions/:reference/cancel` (auth)

Compatibilidade com referencia legada: os mesmos endpoints tambem respondem em `/api/payment/*`.

Assinaturas recorrentes:

- usa API `preapproval_plan` e `preapproval` do Mercado Pago
- backend nao salva numero de cartao nem CVV; recebe apenas `token` do SDK
- cobranca recorrente e feita pelo Mercado Pago
- webhook de `preapproval/subscription` atualiza o status local da assinatura
- frontend deve consumir o catalogo em `GET /api/payments/subscriptions/plans/public` para obter `preapproval_plan_id`
- `POST /api/payments/subscriptions` valida se o `preapproval_plan_id` existe e esta ativo no backend
- painel admin pode criar plano mensal em `POST /api/payments/subscriptions/plans` com `frequency=1` e `frequency_type=months`

## Janela movel de agendamento

Para evitar sobrecarga no banco, o backend aplica manutencao automatica:

- mantem apenas historico dos ultimos `60` dias (`BOOKING_HISTORY_RETENTION_DAYS`)
- mantem agenda aberta de hoje ate os proximos `15` dias (`BOOKING_FUTURE_DAYS`)
- remove agendamentos antigos fora do historico
- garante dias futuros da janela em `business_days`

No endpoint `GET /api/appointments/slots`, o backend retorna metadados da janela:

- `booking_window_start`
- `booking_window_end`
- `retention_start`

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
		"phone": "11999999999",
		"birth_date": "1999-05-20",
		"email": "maria@email.com",
		"password": "123456"
	}'
```

### Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
	-H "Content-Type: application/json" \
	-d '{"phone": "11999999999", "password": "123456"}'
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
