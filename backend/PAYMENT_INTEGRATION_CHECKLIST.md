# Checklist de Validacao Mercado Pago

## Pre-requisitoss

- `MP_ACCESS_TOKEN` configurado.
- `MP_DEVICE_ID` configurado para testes de Point.
- `BACKEND_PUBLIC_URL` apontando para URL publica do backend (necessario para webhook/IPN externo).
- Usuario autenticado com token JWT.
- Agendamento existente (`appointment_id`).

## 1) Criar PIX

```bash
curl -X POST http://localhost:3001/api/payments/create-pix \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: pix-app-001" \
  -d '{
    "appointment_id": "UUID_DO_AGENDAMENTO",
    "description": "Pagamento agendamento",
    "payer_email": "cliente@email.com",
    "payer_name": "Cliente"
  }'
```

Esperado:
- HTTP `201`
- `data.paymentId`
- `data.paymentStatus` em `pending` ou `approved`
- `data.qrCodeBase64` e `data.qrCodeCopyPaste`

## 2) Consultar status PIX

```bash
curl -X GET http://localhost:3001/api/payments/status/PAYMENT_ID \
  -H "Authorization: Bearer SEU_TOKEN"
```

Esperado:
- HTTP `200`
- `data.status` em `approved|pending|rejected|canceled`
- ao aprovar, `appointments.status` deve virar `pago`

## 3) Criar cartao Point (Payment Intent)

```bash
curl -X POST http://localhost:3001/api/payments/create-point \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: point-app-001" \
  -d '{
    "appointment_id": "UUID_DO_AGENDAMENTO",
    "description": "Pagamento presencial"
  }'
```

Esperado:
- HTTP `201`
- `data.paymentIntentId`
- `data.paymentStatus` em `pending` inicialmente

## 4) Consultar status cartao

```bash
curl -X GET http://localhost:3001/api/payments/status/PAYMENT_INTENT_ID \
  -H "Authorization: Bearer SEU_TOKEN"
```

Esperado:
- HTTP `200`
- prioridade de consulta por intent e fallback para pagamento real
- `data.status` mapeado para `approved|pending|rejected|canceled`

## 5) Cancelar pagamento

```bash
curl -X POST http://localhost:3001/api/payments/cancel/PAYMENT_O_INTENT_ID \
  -H "Authorization: Bearer SEU_TOKEN"
```

Esperado:
- HTTP `200`
- `data.status = canceled`
- se pagamento estiver finalizado/aprovado, deve retornar `409`

## 6) Receber IPN

```bash
curl -X POST "http://localhost:3001/api/payments/ipn/mercadopago?id=PAYMENT_ID&topic=payment" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Esperado:
- HTTP `200` imediato
- processamento assincorno em background
- notificacao deduplicada em `payment_notifications`

## 7) Receber Webhook

```bash
curl -X POST http://localhost:3001/api/payments/webhooks/mercadopago \
  -H "Content-Type: application/json" \
  -d '{
    "action": "payment.updated",
    "type": "payment",
    "data": { "id": "PAYMENT_ID" }
  }'
```

Esperado:
- HTTP `200` imediato
- processamento em background
- atualizacao de `appointments.payment_status` e `appointments.status`

## 8) Verificacoes no banco

```sql
SELECT id, status, payment_status, payment_method, payment_id, payment_intent_id
FROM appointments
WHERE id = 'UUID_DO_AGENDAMENTO';

SELECT source, topic, resource_id, processing_status, created_at, processed_at
FROM payment_notifications
ORDER BY created_at DESC
LIMIT 20;
```

## Regras de negocio validadas

- `agendado` + `payment_status = pending` => nao liberado como pago.
- somente `payment_status = approved` promove `appointments.status` para `pago`.
- cancelado/rejeitado nao promove para `pago`.
- idempotencia aplicada em criacao com `X-Idempotency-Key`.
