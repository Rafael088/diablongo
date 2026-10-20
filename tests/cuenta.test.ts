import { describe, expect, it } from "vitest";
import { correoValido, estadoDeCuenta, textoCreditos, urlVueltaLogin } from "@/lib/cuenta";
import { claveSecretaSupabase, configSupabase, rutaSegura } from "@/lib/supabase/config";
import { clienteAdmin } from "@/lib/supabase/admin";

describe("configuración de Supabase", () => {
  it("sin URL o sin key pública las cuentas están apagadas", () => {
    expect(configSupabase({})).toBeNull();
    expect(configSupabase({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" })).toBeNull();
    expect(configSupabase({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" })).toBeNull();
    expect(configSupabase({ NEXT_PUBLIC_SUPABASE_URL: " ", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k" })).toBeNull();
  });

  it("con las dos variables queda configurada", () => {
    expect(
      configSupabase({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" })
    ).toEqual({ url: "https://x.supabase.co", clavePublica: "sb_publishable_x" });
  });

  it("sin key secreta no hay cliente que mueva créditos", () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k" };
    expect(claveSecretaSupabase(env)).toBeNull();
    expect(clienteAdmin(env)).toBeNull();
    expect(clienteAdmin({ ...env, SUPABASE_SECRET_KEY: "sb_secret_x" })).not.toBeNull();
  });

  it("tras entrar solo se vuelve a rutas propias", () => {
    expect(rutaSegura(null)).toBe("/");
    expect(rutaSegura("/")).toBe("/");
    expect(rutaSegura("/creditos?x=1")).toBe("/creditos?x=1");
    expect(rutaSegura("https://malo.com")).toBe("/");
    expect(rutaSegura("//malo.com")).toBe("/");
    expect(rutaSegura("/\\malo.com")).toBe("/");
  });
});

describe("estado de la cuenta", () => {
  it("interpreta las respuestas de /api/cuenta", () => {
    expect(estadoDeCuenta({ configurada: false })).toEqual({ configurada: false });
    expect(estadoDeCuenta({ configurada: true, usuario: null })).toEqual({ configurada: true, usuario: null });
    expect(estadoDeCuenta({ configurada: true, usuario: { email: "a@b.co", creditos: 12 } })).toEqual({
      configurada: true,
      usuario: { email: "a@b.co", creditos: 12 },
    });
  });

  it("una respuesta rara cuenta como sin sesión y un saldo raro como 0", () => {
    expect(estadoDeCuenta(null)).toEqual({ configurada: true, usuario: null });
    expect(estadoDeCuenta("<html>")).toEqual({ configurada: true, usuario: null });
    expect(estadoDeCuenta({ configurada: true, usuario: { creditos: 3 } })).toEqual({ configurada: true, usuario: null });
    expect(estadoDeCuenta({ configurada: true, usuario: { email: "a@b.co", creditos: -4 } })).toEqual({
      configurada: true,
      usuario: { email: "a@b.co", creditos: 0 },
    });
  });

  it("textos y validaciones", () => {
    expect(textoCreditos(1)).toBe("1 crédito");
    expect(textoCreditos(0)).toBe("0 créditos");
    expect(correoValido("ana@correo.co")).toBe(true);
    expect(correoValido(" ana@correo.co ")).toBe(true);
    expect(correoValido("ana@correo")).toBe(false);
    expect(correoValido("")).toBe(false);
    expect(urlVueltaLogin("https://juego.co")).toBe("https://juego.co/auth/callback");
  });
});
