# Agent Debate

Pon a dos IAs a debatir cualquier tema. App web construida con Next.js, TypeScript y Tailwind.

## Características

- **Debate PRO vs CON**: dos agentes de IA debaten una propuesta con estructura formal.
- **Múltiples proveedores**: OpenRouter, Google Gemini, Groq y Ollama local.
- **Gratis y open source**: las API keys las pone el usuario usando free tiers.
- **Intervención humana**: puedes pausar y preguntar a cualquier agente.
- **Diseño tipo videojuego**: arena visual con animaciones y tarjetas de personaje.
- **Sin backend propio**: todo corre en el navegador y en las API routes serverless de Next.js.

## Cómo empezar

1. Clona el repo.
2. Instala dependencias:
   ```bash
   npm install
   ```
3. Crea un archivo `.env.local` vacío o con variables opcionales.
4. Corre en desarrollo:
   ```bash
   npm run dev
   ```
5. Abre http://localhost:3000.

## Obtener API keys gratuitas

- **OpenRouter**: https://openrouter.ai/keys (free tier, una key para muchos modelos)
- **Google Gemini**: https://aistudio.google.com/app/apikey
- **Groq**: https://console.groq.com/keys
- **Ollama**: corre localmente sin key en http://localhost:11434

## Estructura del debate

1. Apertura PRO
2. Apertura CON
3. Rondas de refutación y contraargumento (configurable, default 3)
4. Cierre PRO
5. Cierre CON
6. Resumen final

## Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- Framer Motion
- Google Generative AI SDK

## Licencia

MIT
