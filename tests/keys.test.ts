import { describe, expect, it } from "vitest";
import {
  Almacenes,
  estaRecordada,
  guardarKey,
  leerKey,
  olvidarKey,
  olvidarTodas,
} from "@/lib/keys";
import { getConfig, saveConfig } from "@/lib/storage";

class MemStorage implements Storage {
  private d = new Map<string, string>();
  get length() {
    return this.d.size;
  }
  clear() {
    this.d.clear();
  }
  getItem(k: string) {
    return this.d.get(k) ?? null;
  }
  key(i: number) {
    return [...this.d.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.d.delete(k);
  }
  setItem(k: string, v: string) {
    this.d.set(k, v);
  }
}

class Roto extends MemStorage {
  getItem(): string | null {
    throw new Error("bloqueado");
  }
  setItem(): void {
    throw new Error("bloqueado");
  }
  removeItem(): void {
    throw new Error("bloqueado");
  }
}

function nuevos() {
  const sesion = new MemStorage();
  const local = new MemStorage();
  const a: Almacenes = { sesion, local };
  return { a, sesion, local };
}

describe("keys", () => {
  it("por defecto va a sessionStorage y no toca localStorage", () => {
    const { a, sesion, local } = nuevos();
    guardarKey("openai", "sk-1", {}, a);
    expect(sesion.getItem("agent-debate-key:openai")).toBe("sk-1");
    expect(local.length).toBe(0);
    expect(leerKey("openai", a)).toBe("sk-1");
    expect(estaRecordada("openai", a)).toBe(false);
  });

  it("con recordar va a localStorage en texto plano y no a sessionStorage", () => {
    const { a, sesion, local } = nuevos();
    guardarKey("openai", "sk-1", { recordar: true }, a);
    expect(local.getItem("agent-debate-key:openai")).toBe("sk-1");
    expect(sesion.length).toBe(0);
    expect(estaRecordada("openai", a)).toBe(true);
    expect(leerKey("openai", a)).toBe("sk-1");
  });

  it("quitar recordar saca la key del disco", () => {
    const { a, local } = nuevos();
    guardarKey("openai", "sk-1", { recordar: true }, a);
    guardarKey("openai", "sk-1", { recordar: false }, a);
    expect(local.length).toBe(0);
    expect(leerKey("openai", a)).toBe("sk-1");
  });

  it("si existe en ambos, sessionStorage gana", () => {
    const { a, sesion, local } = nuevos();
    local.setItem("agent-debate-key:openai", "vieja");
    sesion.setItem("agent-debate-key:openai", "nueva");
    expect(leerKey("openai", a)).toBe("nueva");
  });

  it("una key por proveedor", () => {
    const { a } = nuevos();
    guardarKey("openai", "a", {}, a);
    guardarKey("openrouter", "b", {}, a);
    expect(leerKey("openai", a)).toBe("a");
    expect(leerKey("openrouter", a)).toBe("b");
  });

  it("olvidar borra de los dos almacenes", () => {
    const { a, sesion, local } = nuevos();
    sesion.setItem("agent-debate-key:openai", "x");
    local.setItem("agent-debate-key:openai", "y");
    guardarKey("otro", "z", {}, a);
    olvidarKey("openai", a);
    expect(leerKey("openai", a)).toBe("");
    expect(leerKey("otro", a)).toBe("z");
    olvidarTodas(a);
    expect(sesion.length + local.length).toBe(0);
  });

  it("un storage que lanza no rompe", () => {
    const a: Almacenes = { sesion: new Roto(), local: new Roto() };
    expect(guardarKey("openai", "x", {}, a)).toBe(false);
    expect(leerKey("openai", a)).toBe("");
    expect(() => olvidarKey("openai", a)).not.toThrow();
    expect(() => olvidarTodas(a)).not.toThrow();
    expect(leerKey("openai", { sesion: null, local: null })).toBe("");
  });
});

describe("migración de la config vieja", () => {
  const base = {
    topic: "tema",
    proProvider: "openai",
    proModel: "m1",
    conProvider: "anthropic",
    conModel: "m2",
  };

  it("borra proApiKey/conApiKey y conserva el resto", () => {
    const s = new MemStorage();
    s.setItem(
      "agent-debate-config",
      JSON.stringify({ ...base, proApiKey: btoa("sk-a"), conApiKey: btoa("sk-b") })
    );
    expect(getConfig(s)).toEqual(base);
    const guardado = s.getItem("agent-debate-config") ?? "";
    expect(guardado).not.toContain("ApiKey");
    expect(guardado).not.toContain(btoa("sk-a"));
    expect(JSON.parse(guardado)).toEqual(base);
  });

  it("saveConfig no escribe keys aunque se las cuelen", () => {
    const s = new MemStorage();
    saveConfig({ ...base, proApiKey: "sk-x" } as typeof base, s);
    expect(s.getItem("agent-debate-config")).not.toContain("sk-x");
  });

  it("storage roto o sin config devuelve null", () => {
    expect(getConfig(new Roto())).toBeNull();
    expect(getConfig(new MemStorage())).toBeNull();
    expect(getConfig(null)).toBeNull();
    expect(() => saveConfig(base, new Roto())).not.toThrow();
  });
});
