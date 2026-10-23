import { createHash, timingSafeEqual } from "node:crypto";

const sha = (v: string) => createHash("sha256").update(v, "utf8").digest();

export type Acceso = "no-configurado" | "pedir-clave" | "ok";

/** Basic Auth: cualquier usuario, la contraseña es METRICAS_CLAVE. Sin clave configurada: no existe (404). */
export function revisarAcceso(authorization: string | null, env: NodeJS.ProcessEnv = process.env): Acceso {
  const clave = env.METRICAS_CLAVE;
  if (!clave) return "no-configurado";
  const m = /^Basic\s+(.+)$/i.exec(authorization ?? "");
  if (!m) return "pedir-clave";
  let decodificado: string;
  try {
    decodificado = Buffer.from(m[1], "base64").toString("utf8");
  } catch {
    return "pedir-clave";
  }
  const i = decodificado.indexOf(":");
  const dada = i < 0 ? "" : decodificado.slice(i + 1);
  return timingSafeEqual(sha(dada), sha(clave)) ? "ok" : "pedir-clave";
}
