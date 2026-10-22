import type { Metadata } from "next";
import { Press_Start_2P, Atkinson_Hyperlegible_Next } from "next/font/google";
import "./globals.css";

// Solo títulos, logo y etiquetas muy cortas (nombres de personaje).
const titulo = Press_Start_2P({
  variable: "--font-titulo",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

// Todo el texto largo: diálogos, historial, formularios, botones, notas.
// Atkinson Hyperlegible Next: diseñada para distinguir letras parecidas, se lee bien a 16-20 px.
const dialogo = Atkinson_Hyperlegible_Next({
  variable: "--font-dialogo",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Diablongo",
  description: "Tu cabeza es un campo de batalla: el angelito y el diablongo se pelean tu decisión.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${titulo.variable} ${dialogo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
