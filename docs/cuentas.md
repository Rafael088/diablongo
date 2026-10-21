# Cuentas y créditos (Supabase)

Las cuentas solo existen para los créditos: el modo gratis, «Conectar OpenRouter» y «Mi key» funcionan sin
entrar. Sin las variables de Supabase la app se comporta como antes y el panel de cuenta no aparece.

**Decisión (2026-10-20):** Supabase para el login y la base. Un solo servicio da Auth (Google y enlace al
correo) y Postgres, y los créditos necesitan transacciones de verdad. Descartados Auth.js (en mantenimiento)
y Better Auth + Neon (más piezas).

## Qué hay

| Pieza | Dónde |
| --- | --- |
| Esquema: `saldos`, `movimientos`, RLS y las funciones que mueven créditos | `supabase/migrations/20261020000000_cuentas_creditos.sql` |
| Envoltorio para el servidor (`acreditarCompra`, `descontarDebate`, `devolverDebate`) | `lib/creditos.ts` |
| Clientes: navegador, servidor con sesión, admin con key secreta | `lib/supabase/` |
| Refresco de la sesión en cada visita | `proxy.ts` |
| Vuelta del login | `app/auth/callback/route.ts` |
| Quién está conectado y su saldo | `GET /api/cuenta` |
| Panel «Entrar / créditos / Salir» | `components/Cuenta.tsx` |

## Cómo se mueven los créditos

Nadie escribe `saldos` ni `movimientos` directamente; el navegador solo puede **leer su propio** saldo
(RLS). Todo cambio pasa por tres funciones de Postgres que solo puede ejecutar la key secreta del servidor:

- `acreditar_compra(usuario, creditos, pago)`: la llama el webhook de Mercado Pago con el id del pago.
  Si el webhook llega repetido devuelve `acreditado = false` y no suma otra vez.
- `descontar_debate(usuario, creditos, debate)`: al empezar un debate de pago, con el id del token del
  debate. Si no alcanza el saldo lanza `saldo_insuficiente` (en TS: `{ ok: false }`) y no deja rastro.
  Un reintento con el mismo debate no cobra dos veces.
- `devolver_debate(usuario, debate)`: si el debate falla antes de terminar. Devuelve lo cobrado una sola vez.

Cada movimiento queda en `movimientos` con `(motivo, referencia)` único: eso es lo que impide repetir.

## Ponerlo en marcha (lo hace una persona)

1. Crear un proyecto en [supabase.com](https://supabase.com) (región São Paulo, la más cercana a Colombia).
   En el plan gratis el proyecto se pausa tras 7 días sin uso; se reactiva desde el panel.
2. Correr la migración: pegar el archivo `.sql` en **SQL Editor** y ejecutarlo, o con la CLI
   `supabase link` + `supabase db push`.
3. **Authentication → Sign In / Providers**:
   - **Email**: activado. «Confirm email» puede quedar activado (el enlace mágico ya confirma).
   - **Google**: crear un cliente OAuth «Aplicación web» en Google Cloud Console, con la URI de
     redirección autorizada `https://<proyecto>.supabase.co/auth/v1/callback`, y pegar el Client ID y el
     secreto en Supabase.
4. **Authentication → URL Configuration**:
   - Site URL: la URL de producción (la de Vercel).
   - Redirect URLs: `http://localhost:3000/auth/callback` y `https://<dominio>/auth/callback`.
5. **Project Settings → API Keys**: copiar la publishable key y la secret key.
6. Variables en `.env.local` y en Vercel:

   ```sh
   NEXT_PUBLIC_SUPABASE_URL=https://<proyecto>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   SUPABASE_SECRET_KEY=sb_secret_...   # solo servidor; nunca con NEXT_PUBLIC_
   ```

## Para probarlo a mano

1. `npm run dev`, abrir `http://localhost:3000`: arriba aparece «Entra para comprar créditos».
2. **Entrar → Entrar con Google**: vuelve a la app con tu correo y «0 créditos».
3. Salir, y **Entrar → Mandar enlace** con tu correo: abre el enlace **en el mismo navegador** (el login
   usa PKCE y la llave queda en ese navegador) y vuelves conectado.
4. Para ver créditos sin Mercado Pago, en el SQL Editor:
   `select * from public.acreditar_compra('<id del usuario>', 10, 'prueba-1');` → el panel muestra 10.
   Correrlo otra vez devuelve `acreditado = false` y el saldo sigue en 10.

## Pruebas automáticas

`npm test` corre la migración de verdad sobre Postgres en memoria (PGlite) con lo que Supabase pone por su
cuenta imitado (`auth.users`, `auth.uid()`, roles): acreditar una sola vez, no quedar en negativo, cobrar un
debate una sola vez, devolver una sola vez, que cada quien vea solo su saldo y que el navegador no pueda
mover créditos (`tests/creditos.test.ts`). Lo que no cubre: dos peticiones simultáneas reales (PGlite tiene
una sola conexión); ahí protege el `UPDATE … WHERE creditos >= n` y el índice único de `movimientos`.

## Comprar créditos (Mercado Pago Checkout Pro)

Cada paquete (`lib/paquetes.ts`, **precios provisionales** hasta la tarea cotejo-j9s6uq) se paga con una
preferencia de Checkout Pro:

1. «Comprar créditos» en el panel → `POST /api/pagos/preferencia { paquete }`.
2. La ruta exige sesión (401), valida el paquete (400; el precio sale del servidor, nunca del cliente) y
   llama a `https://api.mercadopago.com/checkout/preferences` (COP, `external_reference` =
   `usuario:paquete:uuid`, `X-Idempotency-Key`). Devuelve `{ url }` (el `init_point`) y el navegador va ahí.
3. Mercado Pago devuelve a `/pagos/vuelta` (informativa: **no acredita**) y avisa a
   `/api/pagos/webhook`, que es lo único que suma créditos (abajo).

Variables:

```sh
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...   # solo servidor; credenciales de Mercado Pago (usar las de prueba primero)
MERCADOPAGO_WEBHOOK_SECRET=...         # solo servidor; «clave secreta» de Webhooks en Tus integraciones
NEXT_PUBLIC_SITE_URL=https://<dominio> # opcional
```

Sin `MERCADOPAGO_ACCESS_TOKEN` la ruta responde 503. **URL pública:** se usa `NEXT_PUBLIC_SITE_URL` si
existe; si no, el origen de la propia petición. En Vercel con dominio propio conviene fijarla (el origen
podría ser el de un preview). Con una URL que no sea `https` (localhost) no se manda `auto_return`, porque
Mercado Pago lo rechaza; la persona vuelve con el botón de Mercado Pago. El webhook no llega a localhost:
para probarlo entero hace falta un túnel https y `NEXT_PUBLIC_SITE_URL` apuntando a él.

## Webhook de Mercado Pago (`POST /api/pagos/webhook`)

Lo único que suma créditos. Mercado Pago avisa con `?data.id=<pago>&type=payment` y reintenta cada
15 minutos mientras no reciba un 2xx.

1. **Firma:** `x-signature: ts=…,v1=…` debe ser el HMAC-SHA256 (hex) de
   `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con `MERCADOPAGO_WEBHOOK_SECRET`; es el mismo
   algoritmo que `WebhookSignatureValidator` del SDK oficial (`lib/webhookMp.ts`). Si no cuadra: 401.
2. **Consulta el pago** a `GET /v1/payments/<id>`: nunca se cree lo que trae el aviso.
3. **Acredita solo** si el pago está `approved`, en `COP`, con monto ≥ el precio del paquete y con una
   `external_reference` nuestra (`usuario:paquete:uuid`). Los créditos salen de `lib/paquetes.ts`.
4. `acreditar_compra` usa el **id del pago** como referencia única: un aviso repetido responde
   `{ acreditado: false }` y no suma otra vez.

| Respuesta | Cuándo | ¿Mercado Pago reintenta? |
| --- | --- | --- |
| 200 | acreditado, ya acreditado, pendiente/rechazado, aviso que no es de pago, pago inexistente (avisos de prueba del panel), algo no cuadra (monto, moneda, referencia, cuenta borrada: queda en el log para revisar a mano) | No |
| 401 | firma inválida o ausente | Sí, y seguirá fallando: revisar la clave |
| 502 | Mercado Pago no devolvió el pago | Sí |
| 500 / 503 | la base falló / falta configuración | Sí |

**Configurarlo:** en Mercado Pago → Tus integraciones → la aplicación → **Webhooks**: URL
`https://<dominio>/api/pagos/webhook`, evento **Pagos**, y copiar la clave secreta a
`MERCADOPAGO_WEBHOOK_SECRET`. La preferencia también manda `notification_url` con esa misma ruta.

**Fuera de alcance por ahora:** reembolsos y contracargos (`refunded`, `charged_back`) no descuentan
créditos; si pasan, ajustar a mano con un movimiento `ajuste`. Si se cambia el precio de un paquete
mientras hay pagos en curso, se compara con el precio nuevo.

**Probarlo a mano:** con credenciales de prueba y la app en un dominio https (Vercel preview o túnel con
`NEXT_PUBLIC_SITE_URL`), comprar un paquete con una tarjeta de prueba aprobada: a los segundos el panel
muestra los créditos. «Simular notificación» del panel de Webhooks debe responder 200 sin acreditar (el
pago de la simulación no existe).

## Debates con créditos (modo «Con créditos»)

Cuarto modo de la configuración; solo aparece si las cuentas están configuradas. Ángel y Diablo juegan con
modelos de pago y la key del servidor (`OPENROUTER_API_KEY`), como el modo gratis pero sin límite diario.
Modelos y costo están en `lib/creditosDebate.ts` (**provisionales** hasta cotejo-j9s6uq): 1 crédito por
debate; Claude Haiku 5.5 / Gemini 3.1 Flash Lite para el Ángel y Gemini 3.1 Flash Lite / DeepSeek V4 Pro para el
Diablo (el segundo de cada lista es el respaldo). Un debate de 9 llamadas cuesta menos de 2 centavos de dólar.

- **Cobro:** `POST /api/debate/start` exige sesión (401), los dos personajes en créditos (400) y saldo (402).
  `guardiaCreditos` (la última guardia, después de Turnstile) llama a `descontar_debate` con el **id del
  debate** que se va a firmar, y el token lleva la cuenta que pagó (`u`). Si algo falla después de cobrar y
  antes de dar el token, se devuelve.
- **Devolución:** si en un **turno del debate** fallan todos los modelos (o la key del servidor), se llama a
  `devolver_debate`, se cierran los turnos que quedaban (nadie sigue jugando gratis tras la devolución) y la
  respuesta lleva `devuelto: true, terminado: true`. El crédito vuelve a quien pagó, una sola vez.
- **Desenlace:** si falla solo el desenlace no se devuelve (el cliente tiene plantilla local y el debate ya se
  jugó); el turno se libera para reintentarlo.
- Un debate abandonado a medias no se devuelve: el crédito se cobra al empezar.

**Probarlo a mano:** con cuentas y `OPENROUTER_API_KEY` configuradas, sumar créditos de prueba en el SQL Editor
(`select * from public.acreditar_compra('<id>', 3, 'prueba-1');`), elegir «Con créditos» y jugar: el saldo baja
en 1 al empezar (se ve al volver a la portada). Sin créditos, «Iniciar Debate» responde que no alcanzan.
