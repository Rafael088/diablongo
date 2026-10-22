# Diablongo — Diseño

Marca: **Diablongo**, «Tu cabeza es un campo de batalla». Antes se llamaba Agent Debate. Juego en pixel art, estilo Undertale: un Ángel y un Diablo se pelean tu decisión en frases cortas y al final eliges a quién le haces caso. Sin API keys del usuario en el modo gratis. Este documento reemplaza al diseño del debate formal PRO/CON (v0.2). Planning de referencia: `Agent Debate - Planning v0.3`.

## Términos y condiciones

`/terminos` (`app/terminos/page.tsx`), modo lectura: resumen en una caja y 11 secciones (qué es, no es consejo profesional, tus decisiones son tuyas, contenido de IA, uso permitido, modos y terceros, créditos y pagos, datos, propiedad intelectual, cambios, contacto y ley colombiana). La fecha y el canal de contacto viven en `lib/legal.ts`. Capturas: `docs/inicio-sencillo.png`, `docs/inicio-movil.png`, `docs/ajustes.png`, `docs/terminos.png`.

## Personajes y tono

| Personaje | Rol interno | Qué es | Tono |
| --- | --- | --- | --- |
| Ángel | `pro` | Lo mejor para ti a largo plazo. Si lo mejor es hacerlo, dice que sí | Cálido, sensato, algo cursi; nunca moralista |
| Diablo | `con` | La tentación: vanidad, flojera, impulso | Pícaro, exagerado, divertido; nunca da instrucciones dañinas (en temas delicados sale con una broma) |
| Tú | `user` | La persona que decide; interviene una vez | Azul claro, en segunda persona |

Cada turno son 1 o 2 frases (unas 35 palabras) y refuta lo último que dijo el otro. Todo en español.

## Flujo de pantallas

1. **Inicio** (`/`, `ConfigPanel`): una sola columna centrada con lo mínimo para jugar.
   - Logo entre el Ángel y el Diablo.
   - «¿Qué dilema tienes?»: textarea (máx. 200 caracteres, `MAX_TEMA`).
   - Una línea de estado (`EstadoModo`) que dice cómo vas a jugar: en Gratis, cuántos debates te quedan hoy; en los otros modos, con qué juegas. «Cambiar» abre Ajustes (en rojo claro y «Conectar» si falta algo).
   - **Cloudflare Turnstile** (si está configurado).
   - Botón «Iniciar Debate» (habilitado si el tema no está vacío, Turnstile pasó y el modo está listo; `puedeIniciar`).
   - Aviso legal corto: es un juego, la IA no aconseja, tú decides; enlace a `/terminos`.
2. **Ajustes** (`PanelAjustes`, botón arriba a la derecha): panel lateral que entra desde la derecha, con foco atrapado, Esc y el fondo para cerrar, y el inicio `inert` detrás. Se abre solo al volver de OpenRouter (`?code=`) o de un login fallido (`?cuenta=error`). Lleva:
   - **Selector de modo**: Gratis, Conectar OpenRouter, Mi key y Con créditos (solo si hay cuentas).
   - Lo propio de cada modo: conexión OAuth, modelo y key del Ángel y del Diablo (en columna), aviso de créditos, nota de privacidad.
   - **Tu cuenta** (`Cuenta`): entrar con Google o enlace al correo, créditos, comprar, salir. Sin Supabase no aparece.
   - Enlace a los términos.
3. **Arena** (`DebateArena`): 8 turnos (apertura, 3 cruces, última palabra) con caja de diálogo letra por letra. Tras el turno 4 la persona puede intervenir (no es una llamada extra) o seguir. Cada frase se puede marcar con un pulgar y mueve la barra de tentación.
4. **Elección**: «¿A quién le haces caso?»; la barra sugiere (borde azul) al que va ganando.
5. **Tarjeta** (`TarjetaDesenlace`): PNG de 1080×1350 con la decisión, el sprite ganador y un desenlace de 20 palabras; descargar, compartir o jugar otra vez.
6. **Marcador**: puntos Ángel/Diablo guardados en `localStorage` (`lib/marcador.ts`).

## Arquitectura de los modos

Cada modo define quién pone la API key y cuáles modelos se usan.

| Modo | Proveedor | Key | Donde vive | Límite |
| --- | --- | --- | --- | --- |
| **Gratis** | OpenRouter: Haiku 5.5 / Gemini 3.1 Flash Lite pagados por el servidor, `:free` de respaldo | Servidor (`OPENROUTER_API_KEY`) | Modelos en `lib/gratis.ts` | 3 debates/IP/día y cupo global (Upstash; en desarrollo, memoria). |
| **Conectar OpenRouter** | OpenRouter (usuario) | OAuth PKCE (navegador) | Sesión y `sessionStorage`, nunca a nuestro servidor | Sin límite. |
| **Mi key** | Elegible: OpenRouter, Gemini, Groq, Ollama (local) | Usuario (navegador o localStorage) | Pestaña o dispositivo (localStorage si marca «Recordar») | Sin límite. |
| **Con créditos** | OpenRouter, modelos de pago | Servidor (`OPENROUTER_API_KEY`) + Supabase | Modelos en `lib/creditosDebate.ts`; modelos: Claude Haiku 5.5 / Gemini 3.1 Flash Lite para PRO, Gemini 3.1 Flash Lite / DeepSeek V4 Pro para CON (respaldos) | 1 crédito por debate; saldo en `supabase.public.saldos`. Se devuelve si fallan antes de terminar. |

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
| Press Start 2P | `--font-titulo` | Solo títulos (h1 a h4), logo, nombres de personaje, «GANÓ EL DIABLO» y el marcador. Muy ancha e ilegible en párrafos: 0.75 a 0.85 rem en la pantalla, 22 a 38 px en la tarjeta. Ya no se usa en botones |
| Atkinson Hyperlegible Next | `--font-dialogo` | Todo el texto largo: caja de diálogo, historial, formularios, notas, avisos, panel de cuenta y todos los botones (700 en botones y nombres de modo) |

Por qué Atkinson Hyperlegible Next: la hizo el Braille Institute para distinguir letras parecidas (I/l/1, O/0); es la más legible de las candidatas a 16-20 px y, por ser plana y de trazo firme, combina con el marco pixel sin fatigar. Pixelify Sans se descartó por ilegible en párrafos.

Tamaños mínimos: diálogo de la arena 1.2 rem (19 px) en móvil y 1.35 rem desde 768 px, interlineado 1.5; formularios, historial y notas 1 rem (16 px); texto informativo nunca bajo 0.9 rem (14 px, `text-sm`); cuerpo 1.0625 rem. La tarjeta PNG sigue leyendo `--font-dialogo` para el tema y espera con `document.fonts.load()` a la fuente correcta (no cambió el código).

Glifos: Atkinson Hyperlegible Next trae el subconjunto `latin` (á é í ó ú ñ ü ¿ ¡ « » — … “ ”). Press Start 2P: las mayúsculas con tilde (Ó en «GANÓ») quedan pegadas al acento; evita frases largas en mayúsculas con tilde. Fallback: `system-ui, sans-serif` para el diálogo y `ui-monospace, monospace` para los títulos.

## Marca

Sale del tablero de marca pixel art de Diablongo. Los sprites de los personajes no cambiaron; lo que es de la marca es el logo, el ícono, la paleta y dos pantallas copiadas del «ejemplo de interfaz».

- **Logo** (`components/Logo.tsx`): «DIABLONGO» en Press Start 2P con el degradado del tablero en escalones (crema → oro → rojo), contorno rojo duro, sombra noche y dos cuernos de píxel dibujados en código. Con `lema` añade «Tu cabeza es un campo de batalla». Va arriba de la configuración, entre el Ángel y el Diablo (los sprites se ocultan bajo 520 px para que quepa en el celular).
- **Ícono y favicon** (`app/icon.svg`, `app/apple-icon.png`, `app/favicon.ico`): el sprite del Diablo sobre fondo noche con borde rojo, como el «ícono de app» del tablero. No se editan a mano: `node scripts/generar-iconos.ts` los vuelve a generar desde `lib/sprites`.
- **Pantalla final**: dos botones grandes como en el tablero, «Escucha al angelito (Es la decisión inteligente)» con borde celeste y «Dale al diablongo (La vida es corta)» con borde rojo, cada uno con su sprite de victoria. El que iba ganando lleva un anillo oro y la nota «Iba ganando en la barra».
- **Escenario**: suelo violeta en escalones bajo los personajes, como «sprites en acción».
- **Botón principal** («Iniciar Debate»): rojo Diablongo con texto noche y, al pasar el ratón, oro.
- **Nombre**: título de la pestaña, cabecera, tarjeta PNG («DIABLONGO» en rojo; archivo `diablongo-<tema>.png`), concepto de Mercado Pago y cabeceras hacia OpenRouter (`diablongo.vercel.app`). Las claves guardadas en el navegador (`agent-debate-key:*`, `agent-debate-config`) se quedan como estaban para no borrarle la key a nadie.

## Colores

Una sola paleta en `:root` de `app/globals.css`, con los ocho colores del tablero de marca: `#FF4D6D` (rojo Diablongo), `#D7263D` (rojo oscuro), `#F6E7C3` (crema), `#6A5ACD` (violeta), `#0F0E17` (noche), `#4B4862` (gris violeta), `#FFC857` (oro) y `#7ED6FF` (celeste). Tres valores son derivados porque el original no llega a 4.5:1 como texto: `superficie` (#17151F, un paso sobre la noche), `texto-suave` (#B4ACCF, del gris violeta) y `usuario` (#9D93F0, del violeta). `#D7263D`, `#6A5ACD` y `#4B4862` solo se usan como gráfico (contornos, suelo, separadores), nunca para texto.

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-fondo` | #0F0E17 | Página y escenario |
| `--color-superficie` | #17151F | Caja de diálogo, marcador, campos |
| `--color-borde` / `--color-texto` | #F6E7C3 | Bordes duros y texto principal |
| `--color-borde-suave` | #4B4862 | Separadores decorativos |
| `--color-texto-suave` | #B4ACCF | Texto secundario |
| `--color-angel` | #7ED6FF | Ángel: nombre, barra, botón «Escucha al angelito» |
| `--color-angel-brillo` / `--color-acento` | #FFC857 | Halo, foco, selección, sugerido |
| `--color-diablo` | #FF4D6D | Diablo: nombre, barra, botón principal, «Dale al diablongo» |
| `--color-diablo-fuego` | #D7263D | Contorno del logo, borde del ícono |
| `--color-violeta` | #6A5ACD | Suelo del escenario |
| `--color-usuario` | #9D93F0 | Lo que dice o pregunta la persona |
| `--color-error` | #FFA8B6 | Errores |

- **CSS** usa los tokens `--color-*`; las variables viejas (`--caja-*`, `--barra-*`, `--nombre-*`, `--arena-*`, `--marcador-*`) apuntan a ellos con `var()`.
- **Canvas de la tarjeta** importa `TOKENS` de `lib/paleta.ts` (no lee el DOM: es más simple y no depende de cuándo cargue el CSS). Las fuentes sí las lee de las variables CSS del `<html>` y espera a `document.fonts.load()` antes de pintar.
- **Fuente de verdad**: `lib/paleta.ts`. `node scripts/contraste.ts` falla (exit 1) si `globals.css` no repite exactamente esos valores o si un par baja de su mínimo.

### Contraste calculado (WCAG, `node scripts/contraste.ts`)

| Texto / elemento | Fondo | Contraste | Mínimo | Uso |
| --- | --- | --- | --- | --- |
| --color-texto #F6E7C3 | --color-fondo #0F0E17 | 15.64:1 | 4.5 | texto sobre el fondo |
| --color-texto #F6E7C3 | --color-superficie #17151F | 14.73:1 | 4.5 | texto en la caja de diálogo |
| --color-texto-suave #B4ACCF | --color-fondo #0F0E17 | 8.89:1 | 4.5 | texto suave sobre el fondo |
| --color-texto-suave #B4ACCF | --color-superficie #17151F | 8.37:1 | 4.5 | texto suave en la caja |
| --color-angel #7ED6FF | --color-fondo #0F0E17 | 11.82:1 | 4.5 | nombre del Ángel sobre el fondo |
| --color-angel #7ED6FF | --color-superficie #17151F | 11.13:1 | 4.5 | nombre del Ángel en la caja |
| --color-angel-brillo #FFC857 | --color-superficie #17151F | 11.73:1 | 4.5 | halo brillante en la caja |
| --color-diablo #FF4D6D | --color-fondo #0F0E17 | 5.96:1 | 4.5 | nombre del Diablo sobre el fondo |
| --color-diablo #FF4D6D | --color-superficie #17151F | 5.62:1 | 4.5 | nombre del Diablo en la caja |
| --color-diablo-fuego #D7263D | --color-superficie #17151F | 3.64:1 | 3 | rojo oscuro del Diablo en la caja (gráfico) |
| --color-violeta #6A5ACD | --color-fondo #0F0E17 | 3.61:1 | 3 | suelo violeta del escenario (gráfico) |
| --color-usuario #9D93F0 | --color-fondo #0F0E17 | 7.18:1 | 4.5 | texto del usuario sobre el fondo |
| --color-usuario #9D93F0 | --color-superficie #17151F | 6.76:1 | 4.5 | texto del usuario en la caja |
| --color-acento #FFC857 | --color-superficie #17151F | 11.73:1 | 4.5 | acento en la caja |
| --color-fondo #0F0E17 | --color-diablo #FF4D6D | 5.96:1 | 4.5 | texto del botón rojo |
| --color-error #FFA8B6 | --color-fondo #0F0E17 | 10.52:1 | 4.5 | error sobre el fondo |
| --color-error #FFA8B6 | --color-superficie #17151F | 9.91:1 | 4.5 | error en la caja |
| --color-borde #F6E7C3 | --color-fondo #0F0E17 | 15.64:1 | 3 | borde sobre el fondo (gráfico) |

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

Marca Diablongo: `docs/marca-inicio.png` (configuración en escritorio), `docs/marca-movil.png` (a 400 px), `docs/marca-final.png` (elección final) y `docs/marca-icono.png` (ícono de 180 px). Anteriores a la marca: `docs/estilo-arena.png`, `docs/estilo-final.png`, `docs/estilo-config.png`, `docs/tarjeta-con.png` (volcado real del canvas con `/arena-demo?final=con&volcado=1`).
