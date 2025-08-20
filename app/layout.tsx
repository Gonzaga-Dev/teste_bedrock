// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthGate from "./AuthGate";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Talent Match Making",
  description: "Acesso aos dados dos profissionais",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
