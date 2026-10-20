// Comprueba la validación de /api/debate sin llamar a ningún modelo.
// Uso: node scripts/comprobar-ruta.ts
import { validarTurno } from "../lib/validarTurno.ts";
import { providers } from "../lib/providers.ts";

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

const ok = validarTurno({ ...base, intervention: "ojo" });
afirmar(ok.ok, "caso válido: debía aceptarse");
for (const f of ["opening", "rebuttal", "counter", "closing", "intervention", "desenlace"]) {
  afirmar(validarTurno({ ...base, phase: f }).ok, `fase ${f} debía aceptarse`);
}

if (errores.length) {
  console.error("FALLOS:\n- " + errores.join("\n- "));
  process.exit(1);
}
console.log("comprobar-ruta: todo bien");
