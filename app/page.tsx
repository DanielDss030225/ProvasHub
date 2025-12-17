"use client";

import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.push("/dashboard");
    }
  }, [user, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-violet-50 dark:bg-slate-950 transition-colors duration-300">
        <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-violet-100 to-white dark:from-slate-900 dark:to-slate-950 px-4 transition-colors duration-300">
      <div className="max-w-md w-full text-center space-y-8">
        <div>
          <img
            src="/icone.png"
            alt="ProvasHub Nexus AI Logo"
            className="w-24 h-24 mx-auto mb-4 object-contain"
          />
          <h1 className="text-4xl font-bold tracking-tight text-violet-600 dark:text-violet-400">
            ProvasHub Nexus AI
          </h1>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
            Ei, concurseiro! Basta enviar o PDF para transformá-lo em uma prova 100% digital e interativa.       </p>
        </div>

        <button
          onClick={signInWithGoogle}
          className="w-full flex items-center justify-center gap-3 px-8 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:shadow-md dark:hover:bg-slate-700 transition-all text-slate-700 dark:text-slate-200 font-medium text-lg group"
        >
          <img
            src="https://www.google.com/favicon.ico"
            alt="Google"
            className="w-6 h-6"
          />
          <span>Entrar com o Google</span>
        </button>

        <p className="text-sm text-slate-400 dark:text-slate-500">
          Inteligencia artificial      </p>
      </div>
    </div>
  );
}
