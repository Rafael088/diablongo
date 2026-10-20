// Comprueba la validación de /api/debate sin llamar a ningún modelo.
// Uso: node scripts/comprobar-ruta.ts
import { validarTurno } from "../lib/validarTurno.ts";
import { providers, proveedoresDisponibles, getProviderById } from "../lib/providers.ts";
import {
  MAX_INTERVENCION,
  MAX_INTERVENCIONES_USUARIO,
  MAX_MENSAJE_HISTORIAL,
  MAX_MENSAJES_HISTORIAL,
  MAX_TEMA,
} from "../lib/topes.ts";

const errores: string[] = [];
function afirmar(cond: boolean, msg: string) {
  if (!cond) errores.push(msg);
}

const gemini = providers.find((p) => p.id === "gemini")!;
const otro = providers.find((p) => p.id !== "gemini" && !p.models.includes(gemini.models[0]))!;
const base = {
  topic: "¿Gatos o perros?",
  role: "pro",
  phase: "opening",
  provider: "gemini",
  model: gemini.models[0],
  apiKey: "k",
  history: [{ role: "user", content: "hola" }],
};

function rechaza(nombre: string, cuerpo: unknown, secreto?: string) {
  const r = validarTurno(cuerpo);
  afirmar(!r.ok, `${nombre}: debía rechazarse`);
  if (!r.ok) {
    afirmar(r.status === 400, `${nombre}: status ${r.status}`);
    afirmar(r.error.length > 0, `${nombre}: sin mensaje`);
    if (secreto) afirmar(!r.error.includes(secreto), `${nombre}: el error repite el valor enviado`);
  }
}

rechaza("modelo fuera de lista", { ...base, model: "modelo-inventado-xyz" }, "modelo-inventado-xyz");
rechaza("modelo de otro proveedor", { ...base, model: otro.models[0] }, otro.models[0]);
rechaza("proveedor desconocido", { ...base, provider: "proveedor-raro" }, "proveedor-raro");
rechaza("role inválido", { ...base, role: "rol-raro" }, "rol-raro");
rechaza("phase inválida", { ...base, phase: "fase-rara" }, "fase-rara");
rechaza("history con role raro", { ...base, history: [{ role: "admin-raro", content: "x" }] }, "admin-raro");
rechaza("history con content no string", { ...base, history: [{ role: "pro", content: 5 }] });
rechaza("history no array", { ...base, history: "x" });
rechaza("topic vacío", { ...base, topic: "  " });
rechaza("intervention no string", { ...base, intervention: 3 });
rechaza("cuerpo null", null);
rechaza("cuerpo array", []);

// Topes de largo
const X = "x";
rechaza("tema demasiado largo", { ...base, topic: X.repeat(MAX_TEMA + 1) });
rechaza("tema largo solo por espacios no cuenta", { ...base, topic: " ".repeat(5) });
rechaza("intervención demasiado larga", { ...base, intervention: X.repeat(MAX_INTERVENCION + 1) });
rechaza("mensaje de historial demasiado largo", {
  ...base,
  history: [{ role: "pro", content: X.repeat(MAX_MENSAJE_HISTORIAL + 1) }],
});
rechaza("demasiados mensajes", {
  ...base,
  history: Array.from({ length: MAX_MENSAJES_HISTORIAL + 1 }, (_, i) => ({ role: i % 2 ? "pro" : "con", content: "a" })),
});
rechaza("demasiadas intervenciones", {
  ...base,
  history: Array.from({ length: MAX_INTERVENCIONES_USUARIO + 1 }, () => ({ role: "user", content: "a" })),
});
const mensajes = (n: number, role: string) => Array.from({ length: n }, () => ({ role, content: X.repeat(MAX_MENSAJE_HISTORIAL) }));
afirmar(validarTurno({ ...base, topic: X.repeat(MAX_TEMA) }).ok, "tema justo en el tope debía aceptarse");
afirmar(validarTurno({ ...base, topic: "  " + X.repeat(MAX_TEMA) + "  " }).ok, "tema con espacios en los bordes debía recortarse y aceptarse");
afirmar(validarTurno({ ...base, intervention: X.repeat(MAX_INTERVENCION) }).ok, "intervención justa debía aceptarse");
afirmar(
  validarTurno({
    ...base,
    history: [...mensajes(MAX_MENSAJES_HISTORIAL - MAX_INTERVENCIONES_USUARIO, "pro"), ...mensajes(MAX_INTERVENCIONES_USUARIO, "user")],
  }).ok,
  "historial justo en los topes debía aceptarse",
);

const ok = validarTurno({ ...base, intervention: "ojo" });
afirmar(ok.ok, "caso válido: debía aceptarse");
for (const f of ["opening", "rebuttal", "counter", "closing", "intervention", "desenlace"]) {
  afirmar(validarTurno({ ...base, phase: f }).ok, `fase ${f} debía aceptarse`);
}

// Ollama solo con NODE_ENV === "development"
const ollama = providers.find((p) => p.id === "ollama")!;
const cuerpoOllama = { ...base, provider: "ollama", model: ollama.models[0], apiKey: "" };
const desconocido = validarTurno({ ...base, provider: "proveedor-raro" }, "production");
for (const entorno of ["production", "test", undefined]) {
  const e = String(entorno);
  const r = validarTurno(cuerpoOllama, entorno);
  afirmar(!r.ok, `ollama con entorno ${e}: debía rechazarse`);
  if (!r.ok && !desconocido.ok) {
    afirmar(r.status === 400, `ollama con entorno ${e}: status ${r.status}`);
    afirmar(r.error === desconocido.error, `ollama con entorno ${e}: el mensaje debe ser el de proveedor desconocido`);
  }
  afirmar(!proveedoresDisponibles(entorno).some((p) => p.id === "ollama"), `ollama no debía aparecer en la lista (${e})`);
  afirmar(getProviderById("ollama", entorno) === undefined, `getProviderById(ollama) debía ser undefined (${e})`);
  afirmar(proveedoresDisponibles(entorno)[0].id !== "ollama", `el primero de la lista no puede ser ollama (${e})`);
}
afirmar(validarTurno(cuerpoOllama, "development").ok, "ollama en development debía aceptarse");
afirmar(proveedoresDisponibles("development").some((p) => p.id === "ollama"), "ollama debía aparecer en development");
afirmar(validarTurno(base, "production").ok, "gemini en production debía aceptarse");

if (errores.length) {
  console.error("FALLOS:\n- " + errores.join("\n- "));
  process.exit(1);
}
console.log("comprobar-ruta: todo bien");
