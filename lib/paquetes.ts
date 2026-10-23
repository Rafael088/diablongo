// Paquetes de créditos que se pueden comprar. Única fuente de verdad: el precio sale de aquí (servidor),
// nunca del cliente.
//
// Decididos el 2026-10-22 (tarea cotejo-j9s6uq), 1 crédito = 1 debate. Mercado Pago cobra ~3,29 % + $952
// fijos + IVA por venta: por eso no hay paquetes por debajo de $10.000. Cambiarlos solo requiere editar esta lista.

export type Paquete = {
  id: string;
  nombre: string;
  creditos: number;
  /** Precio en pesos colombianos (COP), entero. */
  precioCop: number;
};

export const PAQUETES: readonly Paquete[] = [
  { id: "probadita", nombre: "Probadita", creditos: 15, precioCop: 10000 },
  { id: "popular", nombre: "Popular", creditos: 50, precioCop: 25000 },
  { id: "diablazo", nombre: "Diablazo", creditos: 150, precioCop: 60000 },
];

/** Devuelve el paquete con ese id o null (cualquier cosa que no sea un id conocido). */
export function paquetePorId(id: unknown): Paquete | null {
  if (typeof id !== "string") return null;
  return PAQUETES.find((p) => p.id === id) ?? null;
}

export function textoPrecio(precioCop: number): string {
  return `$${precioCop.toLocaleString("es-CO")} COP`;
}
