"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";

export function MobileGuard({ children }: { children: React.ReactNode }) {
    const [isMobile, setIsMobile] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 10);
        };

        // Check initially
        checkMobile();

        // Check on resize
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    // MobileGuard now only tracks state but does not block.
    // We can use isMobile context later if needed, but for now we just render children.
    return <>{children}</>;
}
