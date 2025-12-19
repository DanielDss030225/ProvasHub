import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../context/AuthContext";
import { MobileGuard } from "./components/MobileGuard";

import { Providers } from "./providers";
import ClickSoundProvider from "./components/ClickSoundProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ViewGo | Provas Digitais Inteligentes",
  description: "Resolva provas, pratique questões e transforme PDFs em provas digitais com IA.",
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
          <ClickSoundProvider />
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
