# Agent Debate — Diseño (Ángel contra Diablo)

Juego en pixel art, estilo Undertale: un Ángel y un Diablo se pelean tu decisión en frases cortas y al final eliges a quién le haces caso. Sin API keys del usuario en el modo gratis. Este documento reemplaza al diseño del debate formal PRO/CON (v0.2). Planning de referencia: `Agent Debate - Planning v0.3`.

## Personajes y tono

| Personaje | Rol interno | Qué es | Tono |
| --- | --- | --- | --- |
| Ángel | `pro` | Lo mejor para ti a largo plazo. Si lo mejor es hacerlo, dice que sí | Cálido, sensato, algo cursi; nunca moralista |
| Diablo | `con` | La tentación: vanidad, flojera, impulso | Pícaro, exagerado, divertido; nunca da instrucciones dañinas (en temas delicados sale con una broma) |
| Tú | `user` | La persona que decide; interviene una vez | Azul claro, en segunda persona |

Cada turno son 1 o 2 frases (unas 35 palabras) y refuta lo último que dijo el otro. Todo en español.

## Flujo de pantallas

1. **Panel de cuenta** (`Cuenta`, arriba): si Supabase está configurado, muestra «Entrar» o el correo + créditos + «Comprar» / «Salir»; sin Supabase no aparece.
2. **Configuración** (`/`, `ConfigPanel`): 
   - Textarea: tema o propuesta (máx. 200 caracteres, `MAX_TEMA`).
   - **Selector de modo** (radio buttons):
     - **Gratis**: sin key, contador diario.
     - **Conectar OpenRouter**: botón de conexión OAuth PKCE.
     - **Mi key**: selector de proveedor (OpenRouter, Gemini, Groq, Ollama), modelo y API key por proveedor; checkbox «Recordar en este dispositivo»; botón de desconectar.
     - **Con créditos**: solo si hay cuentas; aviso de costo (1 crédito por debate, devolución si fallan).
   - Selector de proveedor y modelo para Ángel (PRO) y Diablo (CON) en «Mi key» o «OpenRouter» conectado.
   - **Cloudflare Turnstile** (si está configurado).
   - Botón «Iniciar Debate» (habilitado si tema no está vacío, Turnstile pasó, modelos estan listos según el modo).
3. **Arena** (`DebateArena`): 8 turnos (apertura, 3 cruces, última palabra) con caja de diálogo letra por letra. Tras el turno 4 la persona puede intervenir (no es una llamada extra) o seguir. Cada frase se puede marcar con un pulgar y mueve la barra de tentación.
4. **Elección**: «¿A quién le haces caso?»; la barra sugiere (borde azul) al que va ganando.
5. **Tarjeta** (`TarjetaDesenlace`): PNG de 1080×1350 con la decisión, el sprite ganador y un desenlace de 20 palabras; descargar, compartir o jugar otra vez.
6. **Marcador**: puntos Ángel/Diablo guardados en `localStorage` (`lib/marcador.ts`).

## Arquitectura de los modos

Cada modo define quién pone la API key y cuáles modelos se usan.

| Modo | Proveedor | Key | Donde vive | Límite |
| --- | --- | --- | --- | --- |
| **Gratis** | OpenRouter, modelos `:free` | Servidor (`OPENROUTER_API_KEY`) | Modelos en `lib/gratis.ts` | 3 debates/IP/día y cupo global (Upstash; en desarrollo, memoria). |
| **Conectar OpenRouter** | OpenRouter (usuario) | OAuth PKCE (navegador) | Sesión y `sessionStorage`, nunca a nuestro servidor | Sin límite. |
| **Mi key** | Elegible: OpenRouter, Gemini, Groq, Ollama (local) | Usuario (navegador o localStorage) | Pestaña o dispositivo (localStorage si marca «Recordar») | Sin límite. |
| **Con créditos** | OpenRouter, modelos de pago | Servidor (`OPENROUTER_API_KEY`) + Supabase | Modelos en `lib/creditosDebate.ts`; modelos: Claude Haiku / Gemini Flash para PRO, Gemini Flash / DeepSeek V4 Pro para CON (respaldos) | 1 crédito por debate; saldo en `supabase.public.saldos`. Se devuelve si fallan antes de terminar. |

### Guardia de modo

En `ConfigPanel`, `puedeIniciar()` (`lib/modoConfig.ts`) verifica:
- Tema no vacío.
- Turnstile pasado (si hay sitekey).
- Cupo del día no agotado (Gratis).
- Cuenta de OpenRouter conectada (Conectar OpenRouter).

La sesión y el saldo de «Con créditos» los comprueba el servidor al empezar.

En `POST /api/debate/start`, `guardiaCreditos` (la última guardia después de Turnstile) descuenta créditos si toca y devuelve el token firmado con el id del debate.

## Llamadas al modelo

8 turnos + 1 de desenlace = **9 por debate** (`TOTAL_LLAMADAS` en `lib/debateEngine.ts`). La intervención del usuario va en el historial, no cuenta. Si el desenlace falla o pasa de ~8 s, se usa una plantilla local. El modo determina cuáles modelos y qué key se pasan al servidor.

## Tipografías

Cargadas con `next/font/google` en `app/layout.tsx` (`display: "swap"`, subconjunto `latin`).

| Fuente | Variable CSS | Uso |
| --- | --- | --- |
| Press Start 2P | `--font-titulo` | Títulos, botones cortos, nombres de personaje, «GANÓ EL DIABLO». Muy ancha: úsala pequeña (0.6 a 0.85 rem; 22 a 38 px en la tarjeta) |
| Pixelify Sans | `--font-dialogo` | Texto de la caja de diálogo, historial, formularios, tema en la tarjeta (1 a 1.15 rem) |

Glifos verificados en los archivos woff2 del subconjunto `latin` que sirve Google: ambas fuentes traen á é í ó ú ñ ü Á É Í Ó Ú Ñ ¿ ¡ « » — … “ ” y *. Si en el futuro falta alguno, el fallback es `ui-monospace, monospace` (queda declarado después de la variable en cada `font-family`). Un detalle: en Press Start 2P las mayúsculas con tilde (Ó en «GANÓ») ocupan la cuadrícula de 8×8 y el acento queda muy pegado; se lee, pero evita frases largas en mayúsculas con tilde.

## Colores

Una sola paleta en `:root` de `app/globals.css`. Sus valores viven también en `lib/paleta.ts` (`TOKENS`), derivados de `PALETA_SPRITES` (`lib/sprites/paleta.ts`) para que combinen con los sprites; solo `fondo`, `superficie`, `diablo` y `error` son valores propios (más oscuros o más claros que el sprite para que lean como fondo o como texto).

- **CSS** usa los tokens `--color-*`; las variables viejas (`--caja-*`, `--barra-*`, `--nombre-*`, `--arena-*`, `--marcador-*`) apuntan a ellos con `var()`.
- **Canvas de la tarjeta** importa `TOKENS` de `lib/paleta.ts` (no lee el DOM: es más simple y no depende de cuándo cargue el CSS). Las fuentes sí las lee de las variables CSS del `<html>` y espera a `document.fonts.load()` antes de pintar.
- **Fuente de verdad**: `lib/paleta.ts`. `node scripts/contraste.ts` falla (exit 1) si `globals.css` no repite exactamente esos valores o si un par de texto baja de 4.5:1.

### Contraste calculado (WCAG, `node scripts/contraste.ts`)

| Texto / elemento | Fondo | Contraste | Mínimo | Uso |
| --- | --- | --- | --- | --- |
| --color-texto #f5f2ea | --color-fondo #14121c | 16.57:1 | 4.5 | texto sobre el fondo |
| --color-texto #f5f2ea | --color-superficie #0d0a14 | 17.53:1 | 4.5 | texto en la caja de diálogo |
| --color-texto-suave #c7c2d8 | --color-fondo #14121c | 10.71:1 | 4.5 | texto suave sobre el fondo |
| --color-texto-suave #c7c2d8 | --color-superficie #0d0a14 | 11.34:1 | 4.5 | texto suave en la caja |
| --color-angel #ffcc3a | --color-fondo #14121c | 12.31:1 | 4.5 | nombre del Ángel sobre el fondo |
| --color-angel #ffcc3a | --color-superficie #0d0a14 | 13.03:1 | 4.5 | nombre del Ángel en la caja |
| --color-angel-brillo #fff3a0 | --color-superficie #0d0a14 | 17.35:1 | 4.5 | halo brillante en la caja |
| --color-diablo #f0685c | --color-fondo #14121c | 6.04:1 | 4.5 | nombre del Diablo sobre el fondo |
| --color-diablo #f0685c | --color-superficie #0d0a14 | 6.39:1 | 4.5 | nombre del Diablo en la caja |
| --color-diablo-fuego #ff8a2a | --color-superficie #0d0a14 | 8.33:1 | 4.5 | fuego del Diablo en la caja |
| --color-usuario #8fd3ff | --color-fondo #14121c | 11.41:1 | 4.5 | texto del usuario sobre el fondo |
| --color-usuario #8fd3ff | --color-superficie #0d0a14 | 12.08:1 | 4.5 | texto del usuario en la caja |
| --color-acento #ffe066 | --color-superficie #0d0a14 | 15.04:1 | 4.5 | acento en la caja |
| --color-error #ffa8a0 | --color-fondo #14121c | 10.03:1 | 4.5 | error sobre el fondo |
| --color-error #ffa8a0 | --color-superficie #0d0a14 | 10.61:1 | 4.5 | error en la caja |
| --color-borde #ffffff | --color-fondo #14121c | 18.53:1 | 3 | borde sobre el fondo (gráfico) |

Texto normal mínimo 4.5:1 (AA); bordes y elementos gráficos, 3:1.

## Reglas de pixel art

- Sprites de **32×32** dibujados en código (`lib/sprites/`, matrices de caracteres + `PALETA_SPRITES`); nada de imágenes externas.
- Render con `shape-rendering: crispEdges` (SVG) o `imageSmoothingEnabled = false` (canvas); `image-rendering: pixelated` global para `canvas`, `svg` e `img`. Escalas enteras.
- **Bordes duros** de 2 a 4 px (blancos), esquinas rectas: `border-radius: 0` en todo, sin sombras difusas ni degradados ni `backdrop-blur`. La única excepción histórica es el halo del Ángel (resplandor radial).
- Caja de diálogo: fondo `--color-superficie`, borde blanco de 4 px, texto en Pixelify Sans, nombre del personaje en Press Start 2P con su color.
- Foco visible: contorno de 3 px en `--color-acento`.

## Movimiento

- Personajes: flotan suave (2.6 s), el Ángel late con su halo (1.6 s), el Diablo con fuego parpadeante (0.9 s); golpe de 0.55 s al refutar y animaciones de victoria. Librería: `framer-motion`.
- Texto letra por letra en la caja (`hooks/useTypewriter.ts`).
- **`prefers-reduced-motion: reduce`**: el texto aparece completo de golpe y los personajes quedan quietos (`useReducedMotion`).

## Sonido

Blips de 8 bits con Web Audio (`lib/blips.ts`), uno cada pocas letras mientras habla alguien: onda corta de 50 ms con tono base de 880 Hz para el Ángel y 220 Hz para el Diablo (con variación aleatoria). El `AudioContext` se crea en el primer gesto; hay botón de silencio en la barra de la arena.

## Panel de cuenta (Cuenta.tsx)

Arriba de la página (si Supabase está configurado). Ciclo de vida:

1. **Desconectado**: «Entra para comprar créditos y usar los modelos buenos» + botón «Entrar».
2. **Abriendo**:
   - Botón «Entrar con Google» (redirige a Google OAuth con `redirectTo` a `/auth/callback`).
   - Input de correo + botón «Mandar enlace» (OTP a la bandeja, abre un link en el mismo navegador con PKCE).
3. **Conectado**: correo + saldo en créditos (`components/Cuenta.tsx` lee `GET /api/cuenta` al montar) + botones «Comprar créditos» / «Salir».
4. **Comprando**:
   - Lista de paquetes (id, nombre, créditos, precio en COP desde `lib/paquetes.ts`).
   - Click en un paquete → `POST /api/pagos/preferencia { paquete }` → redirige a Mercado Pago Checkout Pro (`init_point`).
   - Vuelta: `GET /pagos/vuelta` (informativa) o webhook `POST /api/pagos/webhook` (acredita).

Credenciales:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (login en el navegador; el saldo se lee en `GET /api/cuenta` con la sesión de la persona y RLS).
- `MERCADOPAGO_ACCESS_TOKEN` (servidor, crea preferencia y consulta pagos).
- `MERCADOPAGO_WEBHOOK_SECRET` (servidor, verifica firma del webhook de Mercado Pago).

Mira **[docs/cuentas.md](./docs/cuentas.md)** para esquema, RLS, movimiento de créditos, pruebas a mano y configuración de Supabase / Mercado Pago.

## Capturas de referencia

`docs/estilo-arena.png`, `docs/estilo-final.png`, `docs/estilo-config.png`, `docs/tarjeta-con.png` (volcado real del canvas con `/arena-demo?final=con&volcado=1`).
