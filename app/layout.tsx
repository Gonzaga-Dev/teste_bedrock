import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // <- use só o globals

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Talent Match Making",
  description: "Acesso aos dados dos profissionais",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
