"use client";

import { ThemeProvider } from "next-themes";
import { AlertProvider } from "./context/AlertContext";
import { GlobalAlert } from "./components/GlobalAlert";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <AlertProvider>
                <GlobalAlert />
                {children}
            </AlertProvider>
        </ThemeProvider>
    );
}
