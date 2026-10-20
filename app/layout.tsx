import type { Metadata } from "next";
import { Press_Start_2P, Pixelify_Sans } from "next/font/google";
import "./globals.css";

// Títulos, botones cortos y nombres de personaje.
const titulo = Press_Start_2P({
  variable: "--font-titulo",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

// Diálogos, historial y formularios.
const dialogo = Pixelify_Sans({
  variable: "--font-dialogo",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agent Debate",
  description: "Pon a dos IAs a debatir cualquier tema",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${titulo.variable} ${dialogo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
