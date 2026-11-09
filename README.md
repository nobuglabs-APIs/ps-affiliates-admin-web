# Nobug Rewards Admin

Frontend Next.js separado para a gestão administrativa da Nobug Rewards —
recompensas e ecossistema de parceiros.
O acesso é verificado pela API e o painel não é apresentado a contas sem
`is_admin=true`.

## Desenvolvimento

1. Copie `.env.example` para `.env.local`.
2. Configure `NEXT_PUBLIC_PS_AFFILIATES_API_BASE_URL` para a API e, se necessário,
   os IDs públicos de Google e Facebook.
3. Execute `npm install` e `npm run dev` nesta pasta.

A aplicação fica disponível em `http://localhost:3002`. Adicione esta origem a
`CORS_ORIGINS` na API. As operações administrativas continuam protegidas pela
autorização server-side da API; o frontend nunca recebe o App Secret do Facebook.
