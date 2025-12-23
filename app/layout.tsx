import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../context/AuthContext";
import { MobileGuard } from "./components/MobileGuard";

import { Providers } from "./providers";
import ClickSoundProvider from "./components/ClickSoundProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL('https://provashub.vercel.app'),
  title: {
    default: "ViewGo | A Plataforma do Concurseiro",
    template: "%s | ViewGo"
  },
  description: "Resolva provas, pratique questões e transforme PDFs em provas digitais com IA. A plataforma definitiva para concurseiros.",
  keywords: ["concursos", "provas", "questões", "estudos", "IA", "PDF", "concurseiro"],
  authors: [{ name: "ViewGo Team" }],
  creator: "ViewGo",
  publisher: "ViewGo",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icone.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: [
      { url: '/icone.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: "ViewGo | A Plataforma do Concurseiro",
    description: "Resolva provas, pratique questões e transforme PDFs em provas digitais com IA.",
    url: 'https://provashub.vercel.app',
    siteName: 'ViewGo',
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "ViewGo | A Plataforma do Concurseiro",
    description: "Resolva provas, pratique questões e transforme PDFs em provas digitais com IA.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
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
