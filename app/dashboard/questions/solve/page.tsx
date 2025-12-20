"use client";

import { useAuth } from "../../../../context/AuthContext";
import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { db } from "../../../../lib/firebase";
import { collection, query, getDocs, orderBy, limit, doc, runTransaction } from "firebase/firestore";
import { Loader2, ArrowLeft, CheckCircle, XCircle, ChevronLeft, ChevronRight, Clock, Coins, BookOpen, Trophy } from "lucide-react";
import { useAlert } from "../../../context/AlertContext";
import clsx from "clsx";

interface QuestionBankItem {
    id: string;
    examId: string;
    examTitle: string;
    questionIndex: number;
    text: string;
    options: string[];
    correctAnswer?: string;
    graphicUrl?: string;
    concurso: string;
    banca: string;
    cargo: string;
    nivel: string;
    disciplina: string;
    areaDisciplina?: string;
    supportText?: string;
    ano: number;
    tipoQuestao: 'multipla_escolha' | 'certo_errado';
}

function QuestionSolveContent() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { showAlert } = useAlert();
    const headersCreditsRef = useRef<HTMLDivElement>(null);

    // Questions State
    const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);

    // Answer State
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [showResult, setShowResult] = useState<Record<number, boolean>>({});
    const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());

    // Credits & Animation
    const [userCredits, setUserCredits] = useState(0);
    const [flyingCoin, setFlyingCoin] = useState<{ startX: number; startY: number } | null>(null);
    const [creditPulse, setCreditPulse] = useState(false);

    // Timer
    const [timer, setTimer] = useState(0);
    const [status, setStatus] = useState<'solving' | 'finished'>('solving');

    // Auth redirect
    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/");
        }
    }, [user, authLoading, router]);

    // Fetch user credits
    useEffect(() => {
        if (user) {
            import("firebase/firestore").then(({ getDoc }) => {
                getDoc(doc(db, "users", user.uid)).then(snap => {
                    if (snap.exists()) {
                        setUserCredits(snap.data().credits || 0);
                    }
                });
            });
        }
    }, [user]);

    // Timer
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (status === 'solving' && questions.length > 0) {
            interval = setInterval(() => {
                setTimer(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [status, questions.length]);

    // Fetch questions based on URL filters
    useEffect(() => {
        if (!user) return;
        fetchQuestions();
    }, [user, searchParams]);

    const fetchQuestions = async () => {
        setLoading(true);
        try {
            let q = query(collection(db, "questions"), orderBy("ano", "desc"), limit(50));
            const snapshot = await getDocs(q);
            let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuestionBankItem));

            // Apply URL filters
            const concurso = searchParams.get('concurso')?.split(',') || [];
            const banca = searchParams.get('banca')?.split(',') || [];
            const cargo = searchParams.get('cargo')?.split(',') || [];
            const nivel = searchParams.get('nivel')?.split(',') || [];
            const disciplina = searchParams.get('disciplina')?.split(',') || [];
            const areaDisciplina = searchParams.get('areaDisciplina')?.split(',') || [];
            const ano = searchParams.get('ano')?.split(',').map(Number) || [];
            const tipoQuestao = searchParams.get('tipoQuestao')?.split(',') || [];
            const searchQuery = searchParams.get('q') || '';

            if (concurso.length > 0 && concurso[0]) {
                results = results.filter(q =>
                    concurso.some(c => q.concurso?.toLowerCase().includes(c.toLowerCase()))
                );
            }
            if (banca.length > 0 && banca[0]) {
                results = results.filter(q =>
                    banca.some(b => q.banca?.toLowerCase().includes(b.toLowerCase()))
                );
            }
            if (cargo.length > 0 && cargo[0]) {
                results = results.filter(q =>
                    cargo.some(c => q.cargo?.toLowerCase().includes(c.toLowerCase()))
                );
            }
            if (nivel.length > 0 && nivel[0]) {
                results = results.filter(q =>
                    nivel.some(n => q.nivel?.toLowerCase().includes(n.toLowerCase()))
                );
            }
            if (disciplina.length > 0 && disciplina[0]) {
                results = results.filter(q =>
                    disciplina.some(d => q.disciplina?.toLowerCase().includes(d.toLowerCase()))
                );
            }
            if (areaDisciplina.length > 0 && areaDisciplina[0]) {
                results = results.filter(q =>
                    q.areaDisciplina && areaDisciplina.some(ad => q.areaDisciplina?.toLowerCase().includes(ad.toLowerCase()))
                );
            }
            if (ano.length > 0 && !isNaN(ano[0])) {
                results = results.filter(q => ano.includes(q.ano));
            }
            if (tipoQuestao.length > 0 && tipoQuestao[0]) {
                results = results.filter(q => tipoQuestao.includes(q.tipoQuestao));
            }
            if (searchQuery.trim()) {
                const search = searchQuery.toLowerCase();
                results = results.filter(q =>
                    q.text.toLowerCase().includes(search) ||
                    q.disciplina?.toLowerCase().includes(search) ||
                    q.concurso?.toLowerCase().includes(search)
                );
            }

            // Shuffle questions for variety
            results = results.sort(() => Math.random() - 0.5);

            setQuestions(results);
        } catch (e) {
            console.error("Error fetching questions:", e);
        } finally {
            setLoading(false);
        }
    };

    const playSound = (type: 'collect' | 'success') => {
        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReduced) return;
        const audio = new Audio(`/sounds/coin-${type}.mp3`);
        if (type === 'success') {
            audio.volume = 0.2;
        }
        audio.play().catch(e => console.error("Audio play failed", e));
    };

    const handleAnswer = async (optionLetter: string, e: React.MouseEvent<HTMLButtonElement>) => {
        const currentQuestion = questions[currentIndex];
        if (!currentQuestion || showResult[currentIndex]) return;

        setAnswers(prev => ({ ...prev, [currentIndex]: optionLetter }));
        setShowResult(prev => ({ ...prev, [currentIndex]: true }));

        const isCorrect = optionLetter.toLowerCase() === (currentQuestion.correctAnswer?.toLowerCase() || '');

        // Award credit if correct and not already answered
        if (isCorrect && user && !answeredQuestions.has(currentQuestion.id)) {
            try {
                // Capture position for animation
                const rect = e.currentTarget.getBoundingClientRect();
                const startX = rect.left + rect.width / 2;
                const startY = rect.top + rect.height / 2;

                // Update credits in Firestore
                await runTransaction(db, async (transaction) => {
                    const userRef = doc(db, "users", user.uid);
                    const userDoc = await transaction.get(userRef);
                    if (!userDoc.exists()) throw "User does not exist!";
                    const newCredits = (userDoc.data().credits || 0) + 1;
                    transaction.update(userRef, { credits: newCredits });
                });

                setAnsweredQuestions(prev => new Set(prev).add(currentQuestion.id));
                setFlyingCoin({ startX, startY });
                playSound('collect');

            } catch (error) {
                console.error("Error updating credits:", error);
            }
        }
    };

    const goToNext = () => {
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(prev => prev + 1);
        }
    };

    const goToPrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    const calculateScore = () => {
        let correct = 0;
        questions.forEach((q, idx) => {
            const userAns = answers[idx]?.toLowerCase();
            const correctAns = q.correctAnswer?.toLowerCase();
            if (userAns && userAns === correctAns) {
                correct++;
            }
        });
        const answered = Object.keys(answers).length;
        return {
            correct,
            answered,
            total: questions.length,
            percentage: answered > 0 ? (correct / answered) * 100 : 0
        };
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    if (authLoading || loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            </div>
        );
    }

    if (questions.length === 0) {
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
                <BookOpen className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4" />
                <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">
                    Nenhuma questão encontrada
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-center mb-6">
                    Não há questões que correspondam aos filtros selecionados.
                </p>
                <button
                    onClick={() => router.push('/dashboard/questions')}
                    className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold transition"
                >
                    Voltar ao Banco de Questões
                </button>
            </div>
        );
    }

    // Finished state
    if (status === 'finished') {
        const score = calculateScore();
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 p-4 md:p-8">
                <div className="max-w-2xl mx-auto">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center shadow-lg">
                        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                            <Trophy className="w-10 h-10 text-violet-600" />
                        </div>

                        <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
                            Sessão Finalizada!
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 mb-6">
                            Confira seu desempenho nesta sessão de estudos.
                        </p>

                        <div className="grid grid-cols-3 gap-4 mb-8">
                            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl">
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Acertos</p>
                                <p className="text-2xl font-bold text-green-600">{score.correct}/{score.answered}</p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl">
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Aproveitamento</p>
                                <p className="text-2xl font-bold text-blue-600">{score.percentage.toFixed(0)}%</p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl">
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Tempo</p>
                                <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">{formatTime(timer)}</p>
                            </div>
                        </div>

                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={() => router.push('/dashboard/questions')}
                                className="px-6 py-3 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                            >
                                Voltar ao Banco
                            </button>
                            <button
                                onClick={() => {
                                    setStatus('solving');
                                    setCurrentIndex(0);
                                    setAnswers({});
                                    setShowResult({});
                                    setTimer(0);
                                }}
                                className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold transition"
                            >
                                Recomeçar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const currentQuestion = questions[currentIndex];

    return (
        <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
            {/* Header */}
            <div className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 md:px-6 shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push('/dashboard/questions')}
                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="font-bold text-slate-800 dark:text-white text-sm md:text-base">
                            Banco de Questões
                        </h1>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Q.{currentIndex + 1}/{questions.length} • {Object.keys(answers).length} resp.
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full text-xs font-mono">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {formatTime(timer)}
                    </div>

                    <div
                        ref={headersCreditsRef}
                        className={clsx(
                            "hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full font-mono font-bold transition-all text-xs",
                            creditPulse
                                ? "bg-green-100 text-green-600 scale-110 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                        )}
                    >
                        <Coins className={clsx("w-3 h-3", creditPulse && "text-green-500")} />
                        {userCredits}
                    </div>

                    <button
                        onClick={() => setStatus('finished')}
                        className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs md:text-sm font-bold rounded-xl transition"
                    >
                        Finalizar
                    </button>
                </div>
            </div>

            {/* Progress */}
            <div className="h-1 bg-slate-200 dark:bg-slate-800 w-full shrink-0">
                <div
                    className="h-full bg-violet-500 transition-all duration-300"
                    style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                />
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-32">
                <div className="max-w-4xl mx-auto space-y-6">
                    {/* Question Metadata */}
                    <div className="flex flex-wrap gap-2">
                        {currentQuestion.banca && (
                            <span className="px-3 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                                {currentQuestion.banca}
                            </span>
                        )}
                        {currentQuestion.ano && (
                            <span className="px-3 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full">
                                {currentQuestion.ano}
                            </span>
                        )}
                        {currentQuestion.disciplina && (
                            <span className="px-3 py-1 text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-full">
                                {currentQuestion.disciplina}
                            </span>
                        )}
                        {currentQuestion.concurso && (
                            <span className="px-3 py-1 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
                                {currentQuestion.concurso}
                            </span>
                        )}
                    </div>

                    {/* Support Text if any */}
                    {currentQuestion.supportText && (
                        <div className="bg-amber-50/50 dark:bg-amber-900/5 border border-amber-100 dark:border-amber-900/20 rounded-2xl p-6 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="flex items-center gap-2 mb-3">
                                <BookOpen className="w-4 h-4 text-amber-600" />
                                <span className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-400 tracking-wider">Texto de Apoio</span>
                            </div>
                            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-medium">
                                {currentQuestion.supportText}
                            </p>
                        </div>
                    )}

                    {/* Question Text */}
                    <div className="bg-white dark:bg-slate-900 p-6 md:p-10 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-800 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-2 h-full bg-violet-600" />
                        <p className="text-lg md:text-xl font-medium text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap">
                            {currentQuestion.text}
                        </p>
                    </div>

                    {/* Graphic if any */}
                    {currentQuestion.graphicUrl && (
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-300">
                            <img
                                src={currentQuestion.graphicUrl}
                                alt="Imagem da questão"
                                className="max-w-full h-auto max-h-96 rounded-lg mx-auto shadow-sm"
                            />
                        </div>
                    )}

                    {/* Options */}
                    <div className="grid grid-cols-1 gap-3">
                        {currentQuestion.options?.map((opt, idx) => {
                            const letter = String.fromCharCode(97 + idx);
                            const isSelected = answers[currentIndex] === letter;
                            const hasResult = showResult[currentIndex];
                            const isCorrect = letter.toLowerCase() === (currentQuestion.correctAnswer?.toLowerCase() || '');

                            let bgStyle = "border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-violet-300 dark:hover:border-violet-700";

                            if (hasResult) {
                                if (isCorrect) {
                                    bgStyle = "border-green-400 bg-green-50 dark:bg-green-900/20";
                                } else if (isSelected && !isCorrect) {
                                    bgStyle = "border-red-400 bg-red-50 dark:bg-red-900/20";
                                }
                            } else if (isSelected) {
                                bgStyle = "border-violet-600 bg-violet-50 dark:bg-violet-900/20";
                            }

                            return (
                                <button
                                    key={idx}
                                    id={`option-${currentIndex}-${letter}`}
                                    onClick={(e) => handleAnswer(letter, e)}
                                    disabled={hasResult}
                                    className={clsx(
                                        "w-full text-left p-4 rounded-xl border-2 transition-all flex items-center gap-4",
                                        bgStyle,
                                        hasResult && "cursor-default"
                                    )}
                                >
                                    <div className={clsx(
                                        "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0",
                                        hasResult && isCorrect
                                            ? "bg-green-500 text-white"
                                            : hasResult && isSelected && !isCorrect
                                                ? "bg-red-500 text-white"
                                                : isSelected
                                                    ? "bg-violet-600 text-white"
                                                    : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                                    )}>
                                        {hasResult && isCorrect ? (
                                            <CheckCircle className="w-5 h-5" />
                                        ) : hasResult && isSelected && !isCorrect ? (
                                            <XCircle className="w-5 h-5" />
                                        ) : (
                                            letter.toUpperCase()
                                        )}
                                    </div>
                                    <span className={clsx(
                                        "text-base",
                                        hasResult && isCorrect
                                            ? "text-green-800 dark:text-green-200 font-medium"
                                            : hasResult && isSelected && !isCorrect
                                                ? "text-red-800 dark:text-red-200"
                                                : isSelected
                                                    ? "text-violet-900 dark:text-violet-100 font-medium"
                                                    : "text-slate-700 dark:text-slate-300"
                                    )}>
                                        {opt}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Footer Navigation */}
            <div className="h-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 shrink-0 z-20">
                <button
                    onClick={goToPrev}
                    disabled={currentIndex === 0}
                    className="flex items-center gap-2 px-4 py-2 text-slate-500 hover:text-violet-600 disabled:opacity-30 transition font-medium"
                >
                    <ChevronLeft className="w-5 h-5" />
                    Anterior
                </button>

                <button
                    onClick={goToNext}
                    disabled={currentIndex === questions.length - 1}
                    className="flex items-center gap-2 px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold transition hover:scale-105 disabled:opacity-50"
                >
                    Próxima
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>

            {/* Flying Coin Animation */}
            {flyingCoin && headersCreditsRef.current && (
                <div
                    className="fixed z-[100] pointer-events-none w-8 h-8 text-yellow-500 animate-coin-fly"
                    style={{
                        left: flyingCoin.startX,
                        top: flyingCoin.startY,
                        '--tx': `0px`,
                        '--ty': `-100px`,
                        '--target-x': `${headersCreditsRef.current.getBoundingClientRect().left + headersCreditsRef.current.offsetWidth / 2 - flyingCoin.startX - 16}px`,
                        '--target-y': `${headersCreditsRef.current.getBoundingClientRect().top + headersCreditsRef.current.offsetHeight / 2 - flyingCoin.startY - 16}px`
                    } as React.CSSProperties}
                    onAnimationEnd={() => {
                        setFlyingCoin(null);
                        setUserCredits(prev => prev + 1);
                        setCreditPulse(true);
                        playSound('success');
                        setTimeout(() => setCreditPulse(false), 1000);
                    }}
                >
                    <Coins className="w-full h-full fill-yellow-500 animate-[coinPulse_0.5s_linear_infinite]" />
                </div>
            )}
        </div>
    );
}

export default function QuestionSolvePage() {
    return (
        <Suspense fallback={
            <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            </div>
        }>
            <QuestionSolveContent />
        </Suspense>
    );
}
