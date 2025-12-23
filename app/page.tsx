"use client";

import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, Search, BookOpen, User, Play, FileText, ArrowRight, Target } from "lucide-react";
import { db } from "../lib/firebase";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import clsx from "clsx";
import { FormattedText } from "./components/FormattedText";
import { ThemeToggle } from "./components/ThemeToggle";

export default function Home() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  const [exams, setExams] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [fetchingExams, setFetchingExams] = useState(true);

  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchPublicExams = async () => {
      try {
        const q = query(
          collection(db, "exams"),
          where("status", "==", "ready"),
          limit(30) // Fetch a bit more to allow sorting
        );
        const snapshot = await getDocs(q);
        const fetchedExams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

        // Sort on client side to avoid Firebase Index requirement
        fetchedExams.sort((a, b) => {
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeB - timeA;
        });

        setExams(fetchedExams.slice(0, 12));
      } catch (e) {
        console.error("Error fetching public exams:", e);
      } finally {
        setFetchingExams(false);
      }
    };
    fetchPublicExams();
  }, []);

  const filteredExams = exams.filter(exam => {
    const queryNormalized = searchTerm.toLowerCase().trim();
    if (!queryNormalized) return true;
    const searchableText = [
      exam.extractedData?.title,
      exam.fileName,
      exam.extractedData?.course,
      exam.extractedData?.description,
      exam.extractedData?.metadata?.concurso,
      exam.extractedData?.metadata?.banca
    ].filter(Boolean).join(" ").toLowerCase();
    return searchableText.includes(queryNormalized);
  });

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-violet-50 dark:bg-slate-950 transition-colors duration-300">
        <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
      </div>
    );
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "ViewGo",
    "url": "https://provashub.vercel.app",
    "description": "Plataforma de estudos para concursos com simulados e extração de questões via IA.",
    "applicationCategory": "EducationalApplication",
    "operatingSystem": "All",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "BRL"
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 md:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logonatal.png" alt="Logo Natalina" className="w-12 h-12 object-contain" />
            <span className="text-xl font-black text-slate-800 dark:text-white tracking-tighter">ViewGo</span>
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            {user ? (
              <button
                onClick={() => router.push("/dashboard")}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-violet-500/20 transition-all active:scale-95 flex items-center gap-2"
              >
                Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={signInWithGoogle}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold transition-all active:scale-95 flex items-center gap-2"
              >
                Entrar
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-12 pb-32 px-4 overflow-hidden perspective-3d">
        {/* Advanced 3D Background Elements */}
        <div className="absolute inset-0 -z-10 bg-slate-50 dark:bg-slate-950/20">
          {/* 3D Moving Floor */}
          <div className="absolute inset-0 opacity-40 dark:opacity-20 pointer-events-none">
            <div className="floating-mesh animate-pulse" style={{ animationDuration: '4s' }}></div>
          </div>

          {/* Floating 3D Tiles - Enhanced Visibility */}
          <div className="absolute top-[10%] left-[15%] w-40 h-40 bg-violet-500/15 border border-violet-500/30 dark:border-violet-500/50 rounded-3xl animate-3d-spin blur-[0.5px]"></div>
          <div className="absolute top-[20%] right-[20%] w-64 h-64 bg-emerald-500/15 border border-emerald-500/30 dark:border-emerald-500/50 rounded-[3rem] animate-3d-spin blur-[1px]" style={{ animationDirection: 'reverse', animationDuration: '30s' }}></div>
          <div className="absolute bottom-[20%] left-[20%] w-32 h-32 bg-blue-500/15 border border-blue-500/30 dark:border-blue-500/50 rounded-2xl animate-3d-spin" style={{ animationDuration: '18s' }}></div>
          <div className="absolute top-[40%] left-[5%] w-24 h-24 bg-indigo-500/10 border border-indigo-500/20 rounded-xl animate-3d-spin" style={{ animationDuration: '12s' }}></div>

          {/* Glowing Light Pillars */}
          <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-violet-500/40 to-transparent blur-sm"></div>
          <div className="absolute top-0 right-1/4 w-px h-full bg-gradient-to-b from-transparent via-emerald-500/40 to-transparent blur-sm"></div>

          {/* Vignette Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-white via-transparent to-white dark:from-slate-950 dark:via-transparent dark:to-slate-950 opacity-100"></div>
        </div>

        <div className="max-w-5xl mx-auto text-center space-y-10 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="flex justify-center mb-[-10px]">
            <img
              src="/logonatal.png"
              alt="Natal ViewGo"
              className="w-32 h-32 md:w-48 md:h-48 object-contain drop-shadow-2xl"
            />
          </div>

          <h1 className="text-5xl md:text-7xl font-black text-slate-800 dark:text-white leading-[1.05] tracking-tight">
            Resolva provas e questões <br className="hidden md:block" />
            <span className="text-violet-600 dark:text-violet-400">
              com foco e agilidade.
            </span> <br className="hidden md:block" />

          </h1>

          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto font-medium leading-relaxed">
            A plataforma definitiva para quem busca aprovação. Estude com questões interativas extraídas por IA de provas anteriores e organize seu progresso de forma inteligente.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-5 pt-6">
            <button
              onClick={() => router.push("/dashboard/questions")}
              className="w-full sm:w-auto px-10 py-5 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl text-lg font-black shadow-2xl shadow-violet-500/30 transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3 group"
            >
              <BookOpen className="w-6 h-6 group-hover:-rotate-12 transition-transform" />
              Ver Banco de Questões
            </button>
            {!user && (
              <button
                onClick={signInWithGoogle}
                className="w-full sm:w-auto px-10 py-5 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-100 rounded-2xl text-lg font-black hover:border-violet-500 dark:hover:border-violet-500 transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3 shadow-xl"
              >
                <img src="https://www.google.com/favicon.ico" className="w-6 h-6" alt="Google" />
                Acesso Gratuito
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Main Content: Exam Search */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 pb-24">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white mb-2">Provas Públicas</h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Explore e resolva provas enviadas pela comunidade.</p>
          </div>

          <div className="relative group w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
            <input
              type="text"
              placeholder="Pesquisar provas, concursos, bancas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition-all"
            />
          </div>
        </div>

        {fetchingExams ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Carregando Provas...</p>
          </div>
        ) : filteredExams.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-20 text-center">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white">Nenhuma prova encontrada</h3>
            <p className="text-slate-500 dark:text-slate-400">Tente ajustar sua busca ou explore o banco de questões.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredExams.map((exam) => (
              <div
                key={exam.id}
                onClick={() => {
                  if (!user) {
                    localStorage.setItem('pending_exam_id', exam.id);
                    localStorage.setItem('pending_exam_title', exam.extractedData?.title || exam.fileName);
                    localStorage.setItem('pending_exam_user_id', exam.userId);
                    signInWithGoogle();
                  } else {
                    router.push(`/dashboard/solve/${exam.id}`);
                  }
                }}
                className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 hover:shadow-2xl hover:shadow-violet-500/5 hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col h-full"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="px-3 py-1 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 text-[10px] font-black uppercase tracking-wider rounded-lg border border-violet-100 dark:border-violet-800">
                    Prova {exam.extractedData?.metadata?.nivel || "Geral"}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                    <Play className="w-3.5 h-3.5" />
                    {exam.resolutions || 0}
                  </div>
                </div>

                <h3 className="font-black text-slate-800 dark:text-white mb-2 line-clamp-2 leading-tight group-hover:text-violet-600 transition-colors">
                  {exam.extractedData?.title || exam.fileName}
                </h3>

                <div className="text-sm text-slate-500 dark:text-slate-400 mb-6 line-clamp-2 leading-relaxed">
                  <FormattedText text={exam.extractedData?.description || "Acesse para ver os detalhes desta prova."} />
                </div>

                <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-50 dark:border-slate-800/50">
                  <div className="flex items-center gap-2">
                    {exam.userPhoto ? (
                      <img src={exam.userPhoto} alt={exam.userName} className="w-6 h-6 rounded-full shadow-sm" />
                    ) : (
                      <div className="w-6 h-6 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-[10px] text-slate-500">
                        <User className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 truncate max-w-[100px]">{exam.userName || "Anônimo"}</span>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-tight">
                    <FileText className="w-3.5 h-3.5" />
                    {exam.extractedData?.questions?.length || 0} questões
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-12 px-4 text-center">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src="/logonatal.png" alt="Logo Natalina" className="w-10 h-10 object-contain opacity-70" />
            <span className="text-lg font-black text-slate-400 tracking-tighter">ViewGo</span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium">Plataforma de Estudos Inteligente</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 italic">© 2025 - Transforme sua preparação para concursos.</p>
        </div>
      </footer>
    </div>
  );
}
