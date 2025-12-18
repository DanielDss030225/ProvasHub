import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../context/AuthContext";
import { MobileGuard } from "./components/MobileGuard";

import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ProvasHub Nexus AI | Provas Digitais Inteligentes",
  description: "Converta provas de concursos em PDFs em provas digitais interativas com inteligência artificial.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50 transition-colors duration-300`}>
        <MobileGuard>
          <AuthProvider>
            <Providers>
              {children}
            </Providers>
          </AuthProvider>
        </MobileGuard>
      </body>
    </html>
  );
}
