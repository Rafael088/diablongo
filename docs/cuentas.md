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
