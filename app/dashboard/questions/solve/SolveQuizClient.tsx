"use client";

import { useAuth } from "../../../../context/AuthContext";
import { useRef, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { db } from "../../../../lib/firebase";
import { doc, getDoc, runTransaction, setDoc, serverTimestamp, collection, getDocs } from "firebase/firestore";
import { Share2, Loader2, ArrowLeft, CheckCircle, XCircle, Clock, AlertTriangle, ChevronLeft, ChevronRight, Eye, FileText, Coins, MessageSquare, X, Lock, User } from "lucide-react";
import { useAlert } from "../../../context/AlertContext";
import clsx from "clsx";
import { FormattedText } from "../../../components/FormattedText";
import { CommentsSection } from "../../../components/CommentsSection";

export default function SolveQuizClient() {
    const { user, loading: authLoading, signInWithGoogle } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { showAlert } = useAlert();
    const headersCreditsRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Quiz Data
    const [questions, setQuestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [historicalResults, setHistoricalResults] = useState<Record<string, boolean>>({});

    // Quiz State
    const [status, setStatus] = useState<'solving' | 'finished'>('solving');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [maxIndex, setMaxIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [timer, setTimer] = useState(0);
    const [showAnswerKey, setShowAnswerKey] = useState(false);
    const [showSupportTextModal, setShowSupportTextModal] = useState(false);
    const [showComments, setShowComments] = useState(false);

    // Credit System & Animation State
    const [userCredits, setUserCredits] = useState(0);
    const [flyingCoins, setFlyingCoins] = useState<{ id: number, startX: number, startY: number, delay: number }[]>([]);
    const [creditPulse, setCreditPulse] = useState(false);
    const [answeredQuestions, setAnsweredQuestions] = useState<Set<number>>(new Set());
    const [rewardAwarded, setRewardAwarded] = useState(false);

    // Load Questions from sessionStorage or search params (for shared links)
    useEffect(() => {
        const questionId = searchParams.get('id');

        const loadQuestions = async () => {
            if (questionId) {
                // Load specific question from Firestore
                try {
                    const questionDoc = await getDoc(doc(db, "questions", questionId));
                    if (questionDoc.exists()) {
                        setQuestions([{ id: questionDoc.id, ...questionDoc.data() }]);
                        setLoading(false);
                    } else {
                        showAlert("Questão não encontrada", "error");
                        router.push("/dashboard/questions");
                    }
                } catch (e) {
                    console.error("Error fetching shared question:", e);
                    showAlert("Erro ao carregar questão compartilhada", "error");
                    router.push("/dashboard/questions");
                }
            } else {
                // Standard flow: Load from sessionStorage
                const savedQuestions = sessionStorage.getItem('filtered_questions');
                if (savedQuestions) {
                    try {
                        const parsed = JSON.parse(savedQuestions);
                        setQuestions(parsed);
                        setLoading(false);
                    } catch (e) {
                        console.error("Error parsing questions from sessionStorage:", e);
                        showAlert("Erro ao carregar questões do quiz", "error");
                        router.push("/dashboard/questions");
                    }
                } else {
                    router.push("/dashboard/questions");
                }
            }
        };

        loadQuestions();
    }, [router, showAlert, searchParams]);

    // Fetch User Credits & Attempts
    useEffect(() => {
        if (user) {
            // Credits
            getDoc(doc(db, "users", user.uid)).then(snap => {
                if (snap.exists()) {
                    setUserCredits(snap.data().credits || 0);
                }
            });

            // Attempts
            const fetchAttempts = async () => {
                try {
                    const attemptsRef = collection(db, "users", user.uid, "questionAttempts");
                    const snap = await getDocs(attemptsRef);
                    const results: Record<string, boolean> = {};
                    snap.forEach(doc => {
                        results[doc.id] = doc.data().isCorrect;
                    });
                    setHistoricalResults(results);
                } catch (e) {
                    console.error("Error fetching historical attempts:", e);
                }
            };
            fetchAttempts();
        }
    }, [user]);

    // Update Max Progress
    useEffect(() => {
        setMaxIndex(prev => Math.max(prev, currentIndex));
    }, [currentIndex]);

    // Timer
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (status === 'solving' && !loading) {
            interval = setInterval(() => {
                setTimer(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [status, loading]);

    const playSound = (type: 'collect' | 'success') => {
        const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReduced) return;

        const audio = new Audio(`/sounds/coin-${type}.mp3`);
        if (type === 'success') {
            audio.volume = 0.2;
        }
        audio.play().catch(e => console.error("Audio play failed", e));
    };

    const handleAnswer = (optionLetter: string) => {
        setAnswers(prev => ({
            ...prev,
            [currentIndex]: optionLetter
        }));
    };

    const handleShare = async () => {
        const currentQuestion = questions[currentIndex];
        if (!currentQuestion) return;

        const url = `${window.location.origin}/dashboard/questions/solve?id=${currentQuestion.id}`;
        try {
            await navigator.clipboard.writeText(url);
            showAlert("Link da questão copiado!", "success");
        } catch (err) {
            console.error("Failed to copy: ", err);
            showAlert("Erro ao copiar o link.", "error");
        }
    };

    if (authLoading) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            </div>
        );
    }

    const questionId = searchParams.get('id');
    if (!user && questionId) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
                <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-xl border border-slate-200 dark:border-slate-800 text-center">
                    <div className="w-20 h-20 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Lock className="w-10 h-10 text-violet-600 dark:text-violet-400" />
                    </div>
                    <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-4">Login Necessário</h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium leading-relaxed">
                        Para visualizar e resolver esta questão compartilhada, você precisa estar conectado à sua conta.
                    </p>
                    <div className="space-y-4">
                        <button
                            onClick={signInWithGoogle}
                            className="w-full py-4 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-2xl shadow-lg shadow-violet-500/30 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                        >
                            <User className="w-5 h-5" />
                            Acessar com Google
                        </button>
                        <button
                            onClick={() => router.push('/dashboard/questions')}
                            className="w-full py-4 text-sm font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        >
                            Voltar para o Banco de Questões
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const confirmAndNext = async (e: React.MouseEvent<HTMLButtonElement>) => {
        const currentAnswer = answers[currentIndex];
        const currentQuestion = questions[currentIndex];
        const isCorrect = currentAnswer && currentQuestion?.correctAnswer?.toLowerCase() === currentAnswer.toLowerCase();

        if (isCorrect && user && !answeredQuestions.has(currentIndex)) {
            if (currentIndex >= maxIndex) {
                try {
                    // Save attempt globally
                    const attemptRef = doc(db, "users", user.uid, "questionAttempts", currentQuestion.id);
                    setDoc(attemptRef, {
                        questionId: currentQuestion.id,
                        isCorrect,
                        userAnswer: currentAnswer,
                        lastAttemptAt: serverTimestamp(),
                        examId: currentQuestion.examId || 'individual_quiz'
                    }, { merge: true }).catch(err => console.error("Error saving global attempt:", err));

                    let startX = 0;
                    let startY = 0;

                    const selectedBtn = document.getElementById(`option-${currentIndex}-${currentAnswer.toLowerCase()}`);
                    if (selectedBtn) {
                        const rect = selectedBtn.getBoundingClientRect();
                        startX = rect.left + rect.width / 2;
                        startY = rect.top + rect.height / 2;
                    } else {
                        const rect = e.currentTarget.getBoundingClientRect();
                        startX = rect.left + rect.width / 2;
                        startY = rect.top + rect.height / 2;
                    }

                    // Persist to Firebase
                    runTransaction(db, async (transaction) => {
                        const userRef = doc(db, "users", user.uid);
                        const userDoc = await transaction.get(userRef);
                        if (!userDoc.exists()) throw "User does not exist!";
                        const newCredits = (userDoc.data().credits || 0) + 1;
                        transaction.update(userRef, { credits: newCredits });
                    }).catch(error => console.error("Error updating credits:", error));

                    setAnsweredQuestions(prev => new Set(prev).add(currentIndex));

                    const newCoin = { id: Date.now(), startX, startY, delay: 0 };
                    setFlyingCoins(prev => [...prev, newCoin]);
                    playSound('collect');

                } catch (error) {
                    console.error("Error updating credits:", error);
                }
            }
        }

        if (currentIndex === questions.length - 1) {
            showAlert(
                "Deseja finalizar o quiz e ver o resultado?",
                "info",
                "Ver resultado",
                () => handleFinish()
            );
        } else {
            setCurrentIndex(prev => prev + 1);
            setShowComments(false);
            scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handleFinish = async () => {
        setStatus('finished');
        if (rewardAwarded || !user || questions.length === 0) return;

        const score = calculateScore();
        let rewardCoins = 0;

        // Base reward for finishing a quiz could be smaller than an entire exam
        if (score.percentage === 100) rewardCoins = 10;
        else if (score.percentage >= 80) rewardCoins = 5;

        if (rewardCoins > 0) {
            try {
                setRewardAwarded(true);
                runTransaction(db, async (transaction) => {
                    const userRef = doc(db, "users", user.uid);
                    const userDoc = await transaction.get(userRef);
                    if (!userDoc.exists()) throw "User does not exist!";
                    const newCredits = (userDoc.data().credits || 0) + rewardCoins;
                    transaction.update(userRef, { credits: newCredits });
                }).catch(error => console.error("Error awarding reward:", error));

                const startX = window.innerWidth / 2;
                const startY = window.innerHeight / 2;
                const coinsToAnimate = Array.from({ length: Math.min(rewardCoins, 10) }).map((_, i) => ({
                    id: Date.now() + i,
                    startX,
                    startY,
                    delay: i * 0.1
                }));

                setFlyingCoins(prev => [...prev, ...coinsToAnimate]);
                playSound('success');
            } catch (error) {
                console.error("Error awarding reward:", error);
            }
        }
    };

    const calculateScore = () => {
        let correct = 0;
        questions.forEach((q, idx) => {
            const userAns = answers[idx]?.toLowerCase();
            const correctAns = q.correctAnswer?.toLowerCase();
            if (userAns && userAns === correctAns) correct++;
        });
        const total = questions.length;
        return { correct, total, percentage: total > 0 ? (correct / total) * 100 : 0 };
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    if (authLoading || loading) return <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950"><Loader2 className="animate-spin text-violet-500" /></div>;

    const currentQuestion = questions[currentIndex];
    const score = calculateScore();

    return (
        <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 transition-all duration-500 overflow-hidden">
            {status === 'finished' ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar pt-20">
                    <div className="max-w-3xl mx-auto px-4 pb-12 space-y-6">
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 text-center space-y-4">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 mb-2">
                                {score.percentage >= 70 ? <CheckCircle className="w-10 h-10 text-green-500" /> : <AlertTriangle className="w-10 h-10 text-violet-500" />}
                            </div>
                            <h1 className="text-3xl font-black text-slate-800 dark:text-white">Resultado do Quiz</h1>

                            <div className="grid grid-cols-3 gap-4 mt-6 max-w-lg mx-auto">
                                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                                    <p className="text-xs text-slate-500 uppercase font-black">Acertos</p>
                                    <p className="text-2xl font-black text-green-600">{score.correct}/{score.total}</p>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                                    <p className="text-xs text-slate-500 uppercase font-black">Aproveitamento</p>
                                    <p className="text-2xl font-black text-blue-600">{score.percentage.toFixed(0)}%</p>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                                    <p className="text-xs text-slate-500 uppercase font-black">Tempo</p>
                                    <p className="text-2xl font-black text-slate-700 dark:text-slate-200">{formatTime(timer)}</p>
                                </div>
                            </div>

                            <div className="flex justify-center gap-4 mt-8">
                                <button onClick={() => router.push('/dashboard/questions')} className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-white font-bold rounded-2xl hover:bg-slate-200 transition">Sair</button>
                                <button onClick={() => {
                                    setStatus('solving');
                                    setCurrentIndex(0);
                                    setAnswers({});
                                    setTimer(0);
                                    setAnsweredQuestions(new Set());
                                    setRewardAwarded(false);
                                    setMaxIndex(0);
                                }} className="px-6 py-3 bg-violet-600 text-white font-bold rounded-2xl hover:bg-violet-700 transition">Tentar Novamente</button>
                            </div>
                        </div>

                        {/* Detailed Gabarito can be added here if needed */}
                        {questions.map((q, idx) => (
                            <div key={idx} className={clsx(
                                "bg-white dark:bg-slate-900 p-6 rounded-2xl border shadow-sm",
                                answers[idx] === q.correctAnswer ? "border-green-200 dark:border-green-900/50" : "border-red-200 dark:border-red-900/50"
                            )}>
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="text-xs font-black px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded">Q.{idx + 1}</span>
                                    {answers[idx] === q.correctAnswer ? <span className="text-xs font-bold text-green-600">Correto</span> : <span className="text-xs font-bold text-red-600">Errado</span>}
                                </div>
                                <FormattedText text={q.text} className="text-slate-800 dark:text-slate-200 mb-4 font-medium" />
                                <div className="space-y-2">
                                    {q.options.map((opt: string, optIdx: number) => {
                                        const letter = String.fromCharCode(97 + optIdx);
                                        const isCorrect = letter === q.correctAnswer?.toLowerCase();
                                        const isSelected = answers[idx] === letter;
                                        return (
                                            <div key={optIdx} className={clsx(
                                                "p-3 rounded-xl border text-sm flex items-center gap-3",
                                                isCorrect ? "bg-green-50 dark:bg-green-900/20 border-green-200 text-green-700 dark:text-green-400" :
                                                    isSelected ? "bg-red-50 dark:bg-red-900/20 border-red-200 text-red-700 dark:text-red-400" : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-800"
                                            )}>
                                                <span className="font-bold uppercase">{letter})</span>
                                                <FormattedText text={opt} />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 md:px-6 shadow-sm z-10 shrink-0 transition-colors gap-2">
                        <div className="flex items-center gap-2 md:gap-4 shrink-0 min-w-0">
                            <button onClick={() => router.push('/dashboard/questions')} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0">
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div className="flex flex-col min-w-0 max-w-[120px] md:max-w-xs">
                                <h1 className="font-black text-slate-800 dark:text-white text-sm md:text-base truncate">Individual Quiz</h1>
                                <span className="text-[10px] md:text-xs text-slate-500 font-bold truncate">Q.{currentIndex + 1}/{questions.length}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 md:gap-4 shrink-0 overflow-x-auto no-scrollbar">
                            <div className="hidden sm:flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full text-slate-600 dark:text-slate-300 font-mono font-bold text-xs">
                                <Clock className="w-3 h-3" />
                                {formatTime(timer)}
                            </div>
                            <div ref={headersCreditsRef} className={clsx(
                                "hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full font-mono font-bold transition-all text-xs shrink-0",
                                creditPulse ? "bg-green-100 text-green-600 scale-110" : "bg-slate-100 dark:bg-slate-800 text-slate-600"
                            )}>
                                <Coins className="w-3 h-3" />
                                <span>{userCredits}</span>
                            </div>

                            <button
                                onClick={() => setShowAnswerKey(true)}
                                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5 p-2 md:p-0 rounded-lg md:rounded-none bg-blue-50 md:bg-transparent"
                                title="Ver Gabarito"
                            >
                                <CheckCircle className="w-4 h-4" />
                                <span className="hidden md:inline">Gabarito</span>
                            </button>

                            <button
                                onClick={() => {
                                    showAlert(
                                        "Deseja finalizar o quiz e ver o resultado?",
                                        "info",
                                        "Ver resultado",
                                        () => handleFinish()
                                    );
                                }}
                                className="bg-violet-600 hover:bg-violet-700 text-white px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition whitespace-nowrap"
                            >
                                <span className="hidden md:inline">Ver resultado</span>
                                <span className="md:hidden">Fim</span>
                            </button>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-1 bg-slate-200 dark:bg-slate-800 w-full shrink-0">
                        <div className="h-full bg-violet-600 transition-all duration-300" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}></div>
                    </div>

                    {/* Content */}
                    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                        <div className="max-w-4xl mx-auto space-y-8 pb-32">
                            {/* Support Text Modal / Info */}
                            {currentQuestion?.supportText && (
                                <button onClick={() => setShowSupportTextModal(true)} className="flex items-center gap-2 px-4 py-2 bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-xl text-xs font-bold border border-amber-200 dark:border-amber-800">
                                    <FileText className="w-4 h-4" /> Ver Texto de Apoio
                                </button>
                            )}

                            {/* Question Card */}
                            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1.5 h-full bg-violet-600"></div>
                                <div className="flex flex-wrap gap-2 mb-6">
                                    <span className="px-2 py-1 bg-violet-50 dark:bg-violet-900/10 text-violet-600 dark:text-violet-400 text-[10px] font-black uppercase tracking-widest rounded">{currentQuestion?.disciplina}</span>
                                    <span className="px-2 py-1 bg-slate-50 dark:bg-slate-800 text-slate-500 text-[10px] font-black uppercase tracking-widest rounded">{currentQuestion?.banca}</span>
                                    <span className="px-2 py-1 bg-slate-50 dark:bg-slate-800 text-slate-500 text-[10px] font-black uppercase tracking-widest rounded">{currentQuestion?.ano}</span>

                                    {historicalResults[currentQuestion?.id] !== undefined && (
                                        historicalResults[currentQuestion?.id] ? (
                                            <span className="px-3 py-1 text-[10px] font-bold rounded-full flex items-center gap-1.5 border bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 uppercase tracking-widest">
                                                <CheckCircle className="w-3 h-3" />
                                                Respondida Corretamente
                                            </span>
                                        ) : (
                                            <span className="px-3 py-1 text-[10px] font-bold rounded-full flex items-center gap-1.5 border bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 uppercase tracking-widest">
                                                <XCircle className="w-3 h-3" />
                                                Respondida Incorretamente
                                            </span>
                                        )
                                    )}
                                </div>
                                <FormattedText text={currentQuestion?.text || ""} className="text-xl md:text-2xl font-medium text-slate-800 dark:text-slate-100 leading-relaxed block" />

                                {currentQuestion?.graphicUrl && (
                                    <div className="mt-6 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 max-w-lg">
                                        <img src={currentQuestion.graphicUrl} alt="Questão" className="w-full h-auto" />
                                    </div>
                                )}
                            </div>

                            {/* Options */}
                            <div className="grid grid-cols-1 gap-4">
                                {currentQuestion?.options?.map((opt: string, idx: number) => {
                                    const letter = String.fromCharCode(97 + idx);
                                    const isSelected = answers[currentIndex] === letter;
                                    return (
                                        <button key={idx} id={`option-${currentIndex}-${letter}`} onClick={() => handleAnswer(letter)} className={clsx(
                                            "w-full text-left p-5 rounded-2xl border-2 transition-all flex items-center gap-5 group",
                                            isSelected ? "border-violet-600 bg-violet-50/50 dark:bg-violet-900/10 shadow-lg" : "border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-violet-300"
                                        )}>
                                            <div className={clsx(
                                                "w-10 h-10 rounded-xl flex items-center justify-center text-base font-black shrink-0 transition-transform",
                                                isSelected ? "bg-violet-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                                            )}>{letter.toUpperCase()}</div>
                                            <FormattedText text={opt} className={clsx("text-lg", isSelected ? "font-bold text-slate-900 dark:text-white" : "text-slate-700 dark:text-slate-300")} />
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Actions Row */}
                            <div className="flex items-center justify-between">
                                {/* Comments Button */}
                                <button onClick={() => setShowComments(!showComments)} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-violet-600 transition-colors">
                                    <MessageSquare className="w-4 h-4" /> {showComments ? "Ocultar Comentários" : "Ver Comentários"}
                                </button>

                                {/* Share Button */}
                                <button
                                    onClick={handleShare}
                                    className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors"
                                >
                                    <Share2 className="w-4 h-4" /> Compartilhar
                                </button>
                            </div>
                            {showComments && (
                                <div className="h-[400px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                                    <CommentsSection questionId={currentQuestion.id} />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer Nav */}
                    <div className="h-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 md:px-12 z-20">
                        <button onClick={() => { setCurrentIndex(prev => Math.max(0, prev - 1)); setShowComments(false); scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={currentIndex === 0} className="flex items-center gap-2 text-slate-500 font-black uppercase text-xs disabled:opacity-30">
                            <ChevronLeft className="w-5 h-5" /> Anterior
                        </button>
                        <button onClick={confirmAndNext} className="flex items-center gap-3 bg-violet-600 text-white px-8 py-3 rounded-2xl font-black transition shadow-xl shadow-violet-500/20 hover:bg-violet-700 active:scale-95">
                            {currentIndex === questions.length - 1 ? 'Ver resultado' : 'Próxima'} <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Support Text Modal */}
                    {showSupportTextModal && (
                        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowSupportTextModal(false)}>
                            <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl p-8 relative animate-in zoom-in-95 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                                <button onClick={() => setShowSupportTextModal(false)} className="absolute right-6 top-6 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                                    <X className="w-6 h-6" />
                                </button>
                                <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-6 flex items-center gap-3"><FileText className="w-6 h-6 text-amber-500" /> Texto de Apoio</h3>
                                <div className="prose dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                                    <FormattedText text={currentQuestion.supportText || ""} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Answer Key Modal */}
                    {showAnswerKey && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowAnswerKey(false)}>
                            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">Gabarito</h3>
                                    <button onClick={() => setShowAnswerKey(false)} className="text-slate-400 hover:text-slate-600">
                                        <XCircle className="w-6 h-6" />
                                    </button>
                                </div>
                                {maxIndex === 0 && Object.keys(answers).length === 0 ? (
                                    <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                                        <p>Responda questões para ter acesso ao gabarito.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-5 gap-2">
                                        {questions.map((q: any, idx: number) => {
                                            if (idx >= maxIndex) return null;
                                            const userAns = answers[idx]?.toLowerCase();
                                            const correctAns = q.correctAnswer?.toLowerCase();
                                            const historyResult = historicalResults[q.id];
                                            const isAnswered = !!userAns || historyResult !== undefined;
                                            const isCorrect = userAns ? (userAns === correctAns) : historyResult;

                                            return (
                                                <div key={idx} className={clsx(
                                                    "p-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all",
                                                    isAnswered
                                                        ? (isCorrect ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400" : "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400")
                                                        : "bg-slate-50 border-slate-100 text-slate-400 dark:bg-slate-800 dark:border-slate-800"
                                                )}>
                                                    <span className="text-[10px] font-bold opacity-60 uppercase">Q.{idx + 1}</span>

                                                    <div className="flex items-center gap-1">
                                                        <span className="font-black text-sm">{correctAns?.toUpperCase()}</span>
                                                        {isAnswered && (
                                                            <span className="text-[10px] opacity-70">
                                                                ({userAns?.toUpperCase()})
                                                            </span>
                                                        )}
                                                    </div>

                                                    {isAnswered ? (
                                                        isCorrect ? (
                                                            <CheckCircle className="w-3 h-3 text-green-500" />
                                                        ) : (
                                                            <XCircle className="w-3 h-3 text-red-500" />
                                                        )
                                                    ) : (
                                                        <div className="h-3 flex items-center">
                                                            <span className="text-[8px] font-black">—</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Flying Coins */}
            {flyingCoins.map(coin => (
                <div key={coin.id} className="fixed z-[100] pointer-events-none w-8 h-8 text-yellow-500 animate-coin-fly" style={{
                    left: coin.startX,
                    top: coin.startY,
                    animationDelay: `${coin.delay}s`,
                    '--tx': `0px`,
                    '--ty': `-100px`,
                    '--target-x': `${(headersCreditsRef.current?.getBoundingClientRect().left ?? 0) + 16 - coin.startX}px`,
                    '--target-y': `${(headersCreditsRef.current?.getBoundingClientRect().top ?? 0) + 16 - coin.startY}px`
                } as any} onAnimationEnd={() => {
                    setFlyingCoins(prev => prev.filter(c => c.id !== coin.id));
                    setUserCredits(prev => prev + 1);
                    setCreditPulse(true);
                    playSound('success');
                    setTimeout(() => setCreditPulse(false), 1000);
                }}><Coins className="w-full h-full fill-yellow-500 animate-pulse" /></div>
            ))}
        </div>
    );
}
