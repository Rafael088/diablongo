# Agent Debate

Pon a dos IAs a debatir cualquier tema. Ángel vs Diablo en una arena visual de pixel art. App web construida con Next.js, TypeScript y Tailwind.

## Características

- **Juego Ángel contra Diablo**: dos personajes pixel art debaten tu decisión; tú eliges a quién creerle.
- **Cuatro modos de juego**:
  - **Gratis**: sin key, con un límite diario por IP.
  - **Conectar OpenRouter**: tu cuenta OAuth PKCE, la key no llega a nuestro servidor.
  - **Mi key**: tu propia API key en la pestaña, opcional recordar en el dispositivo.
  - **Con créditos**: modelos mejores usando Supabase y Mercado Pago; 1 crédito por debate.
- **Cuentas opcionales**: Supabase con Google y enlace al correo; compra de créditos con Mercado Pago Checkout Pro.
- **Diseño tipo videojuego**: arena visual con animaciones, tarjetas y sprites de 32×32 en pixel art.
- **Sin backend propio**: todo en Next.js App Router, API routes serverless y Supabase sin servidor.

## Cómo empezar

1. Clona el repo.
2. Instala dependencias:
   ```bash
   npm install
   ```
3. Crea un archivo `.env.local` vacío o con las variables que quieras (mira **Variables de entorno**).
4. Corre en desarrollo:
   ```bash
   npm run dev
   ```
5. Abre http://localhost:3000.

## Modos de juego

### Gratis
Sin API key. El servidor corre los modelos del free tier de OpenRouter; 1 debate por día por IP.

### Conectar OpenRouter
Conecta tu cuenta OpenRouter con OAuth PKCE en el navegador. La key solo vive en tu pestaña; nunca se envía a nuestro servidor.

### Mi key
Pega tu propia API key de OpenRouter, Google Gemini, Groq u Ollama (local). Marca «Recordar en este dispositivo» para guardarla en `localStorage`.

### Con créditos
Solo si configuras Supabase y Mercado Pago. Entra con Google o un enlace al correo, compra créditos y juega con Claude Haiku / Gemini Flash. 1 crédito por debate; se devuelve si los modelos fallan.

Mira **[Cuentas y créditos (docs/cuentas.md)](./docs/cuentas.md)** para la guía completa.

## Variables de entorno

En `.env.local` (desarrollo) o en Vercel (producción). Véase también [docs/cuentas.md](./docs/cuentas.md) para Supabase y Mercado Pago.

| Variable | Para qué | ¿Obligatoria? | ¿Solo servidor? |
| --- | --- | --- | --- |
| `DEBATE_TOKEN_SECRET` | Firma HMAC-SHA256 de los tokens del debate. Generar: `openssl rand -base64 48` | En producción | Sí |
| `OPENROUTER_API_KEY` | Key del servidor para el modo Gratis y Con créditos | No | Sí |
| `UPSTASH_REDIS_REST_URL` | Endpoint de Redis (Upstash) para el contador diario | No | Sí |
| `UPSTASH_REDIS_REST_TOKEN` | Token de Redis (Upstash) | No | Sí |
| `LIMITE_IP_DIARIO` | Debates libres por IP y día; default 1 | No | Sí |
| `CUPO_GLOBAL_DIARIO` | Debates gratis totales por día (fallback si Redis no anda); default ilimitado | No | Sí |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Key pública de Cloudflare Turnstile (CAPTCHA) | No | No |
| `TURNSTILE_SECRET_KEY` | Key secreta de Cloudflare Turnstile | No | Sí |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | No | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Key pública de Supabase (lectura de saldo) | No | No |
| `SUPABASE_SECRET_KEY` | Key secreta de Supabase (mover créditos); nunca con `NEXT_PUBLIC_` | No | Sí |
| `MERCADOPAGO_ACCESS_TOKEN` | Credenciales de Mercado Pago (usar de prueba al principio) | No | Sí |
| `MERCADOPAGO_WEBHOOK_SECRET` | Clave secreta de Webhooks en Mercado Pago | No | Sí |
| `NEXT_PUBLIC_SITE_URL` | URL pública de la app (para Mercado Pago; `https://...`) | No | No |

## Comandos

```bash
npm run dev          # Desarrollo en http://localhost:3000
npm test             # Pruebas unitarias (Vitest) — migración de Supabase en PGlite
npm run lint         # ESLint
npm run typecheck    # TypeScript
npm run seguridad    # Auditoría de seguridad (Node.js, npm, custom)
```

## Stack

- **Next.js 16** (App Router, API routes)
- **TypeScript**
- **Tailwind CSS 4**
- **Framer Motion** (animaciones)
- **Supabase** (auth, Postgres, créditos)
- **Mercado Pago** (pagos, webhooks)
- **Cloudflare Turnstile** (CAPTCHA)
- **Upstash Redis** (límite diario)

## Licencia

MIT
