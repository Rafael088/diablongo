/** Ids de personaje: "pro" = Ángel, "con" = Diablo, "usuario" = quien pregunta. */
export type PersonajeSprite = "pro" | "con" | "usuario";

/** Fotogramas del Ángel y el Diablo. */
export type FotogramaDebatiente = "reposo" | "hablar" | "golpe" | "victoria";

/** Fotogramas del usuario. */
export type FotogramaUsuario = "reposo" | "pensar" | "decidir";

export type FotogramaSprite = FotogramaDebatiente | FotogramaUsuario;

/** 32 filas de 32 caracteres; cada carácter es un píxel de la paleta. */
export type MatrizSprite = readonly string[];
