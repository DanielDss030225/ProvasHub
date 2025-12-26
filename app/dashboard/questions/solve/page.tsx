import SolveQuizClient from "./SolveQuizClient";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";

export default function SolveQuizPage() {
    return (
        <Suspense fallback={
            <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <Loader2 className="animate-spin text-violet-500" />
            </div>
        }>
            <SolveQuizClient />
        </Suspense>
    );
}
