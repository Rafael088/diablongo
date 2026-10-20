// Paquetes de créditos que se pueden comprar. Única fuente de verdad: el precio sale de aquí (servidor),
// nunca del cliente.
//
// PROVISIONAL: nombres, cantidades y precios son valores de relleno. Los reales los decide una persona
// (tarea cotejo-j9s6uq). Cambiarlos solo requiere editar esta lista.

export type Paquete = {
  id: string;
  nombre: string;
  creditos: number;
  /** Precio en pesos colombianos (COP), entero. */
  precioCop: number;
};

export const PAQUETES: readonly Paquete[] = [
  { id: "basico", nombre: "Básico", creditos: 10, precioCop: 5000 },
  { id: "popular", nombre: "Popular", creditos: 30, precioCop: 12000 },
  { id: "pro", nombre: "Pro", creditos: 100, precioCop: 35000 },
];

/** Devuelve el paquete con ese id o null (cualquier cosa que no sea un id conocido). */
export function paquetePorId(id: unknown): Paquete | null {
  if (typeof id !== "string") return null;
  return PAQUETES.find((p) => p.id === id) ?? null;
}

export function textoPrecio(precioCop: number): string {
  return `$${precioCop.toLocaleString("es-CO")} COP`;
}
