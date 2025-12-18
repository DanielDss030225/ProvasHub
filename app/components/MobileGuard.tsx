"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";

export function MobileGuard({ children }: { children: React.ReactNode }) {
    const [isMobile, setIsMobile] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };

        // Check initially
        checkMobile();

        // Check on resize
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    // During hydration/SSR, we render null or children to avoid mismatch
    // But for safety, rendering children is usually better for SEO, 
    // though for a restriction guard, we might want to be careful.
    // However, since we want to BLOCK, we should only block after checking client-side.
    if (!mounted) return <>{children}</>;

    if (isMobile) {
        return (
            <div className="fixed inset-0 z-[100] bg-slate-900 border-2 border-violet-500/50 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
                <div className="w-24 h-24 bg-violet-500/10 rounded-full flex items-center justify-center mb-8 animate-bounce delay-700">
                    <Smartphone className="w-12 h-12 text-violet-500" />
                </div>

                <h1 className="text-3xl font-bold text-white mb-4">
                    Estamos no Mobile!
                </h1>

                <p className="text-slate-400 text-lg mb-8 max-w-sm leading-relaxed">
                    Para a melhor experiência em dispositivos móveis, desenvolvemos um aplicativo exclusivo para você.
                </p>

                <button className="w-full max-w-xs bg-violet-600 hover:bg-violet-700 text-white font-bold py-4 rounded-xl transition-all transform hover:scale-105 shadow-xl shadow-violet-900/20 flex items-center justify-center gap-3 group">
                    <Download className="w-6 h-6 group-hover:animate-bounce" />
                    <span>Baixar na Play Store</span>
                </button>

                <p className="mt-8 text-xs text-slate-600 font-medium tracking-widest uppercase">
                    ProvasHub AI Mobile
                </p>
            </div>
        );
    }

    return <>{children}</>;
}
