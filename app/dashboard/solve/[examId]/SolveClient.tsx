"use client";

import { useAuth } from "../../../../context/AuthContext";
import { useRef, useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../../lib/firebase";
import { doc, getDoc, updateDoc, increment, runTransaction } from "firebase/firestore";
import { Loader2, ArrowLeft, CheckCircle, XCircle, Clock, AlertTriangle, ChevronLeft, ChevronRight, Eye, FileText, Coins } from "lucide-react";
import { useAlert } from "../../../context/AlertContext";
import clsx from "clsx";
import { FormattedText } from "../../../components/FormattedText";

interface SolveClientProps {
    examId: string;
}

export default function SolveClient({ examId }: SolveClientProps) {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { showAlert } = useAlert();
    const headersCreditsRef = useRef<HTMLDivElement>(null); // Ref for the credits in header
    const scrollContainerRef = useRef<HTMLDivElement>(null); // Ref for the scrollable area

    // Exam Data
    const [exam, setExam] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Quiz State
    const [status, setStatus] = useState<'solving' | 'finished'>('solving');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [maxIndex, setMaxIndex] = useState(0); // Track furthest progress
    const [answers, setAnswers] = useState<Record<number, string>>({}); // index -> option letter (a,b,c...)
    const [timer, setTimer] = useState(0);
    const [showAnswerKey, setShowAnswerKey] = useState(false);
    const [showSupportTextModal, setShowSupportTextModal] = useState(false);

    // Credit System & Animation State
    const [userCredits, setUserCredits] = useState(0);
    const [flyingCoins, setFlyingCoins] = useState<{ id: number, startX: number, startY: number, delay: number }[]>([]);
    const [creditPulse, setCreditPulse] = useState(false);
    const [answeredQuestions, setAnsweredQuestions] = useState<Set<number>>(new Set()); // Track correctly answered questions to prevent duplicates
    const [rewardAwarded, setRewardAwarded] = useState(false); // Prevent duplicate final rewards in the same session

    // Graphic Modal State
    const [showGraphicModal, setShowGraphicModal] = useState(false);

    // Fetch Exam
    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/");
        } else if (user && examId) {
            fetchExam(examId);
        }
    }, [user, authLoading, examId, router]);

    // Fetch User Credits
    useEffect(() => {
        if (user) {
            getDoc(doc(db, "users", user.uid)).then(snap => {
                if (snap.exists()) {
                    setUserCredits(snap.data().credits || 0);
                }
            });
        }
    }, [user]);

    // Update Max Progress
    useEffect(() => {
        setMaxIndex(prev => Math.max(prev, currentIndex));
    }, [currentIndex]);

    // Track Resolutions (Debounced)
    useEffect(() => {
        if (!examId || !user) return;

        const timer_id = setTimeout(() => {
            const docRef = doc(db, "exams", examId);
            updateDoc(docRef, {
                resolutions: increment(1)
            }).catch(e => console.error("Error incrementing resolutions:", e));
        }, 2000); // 2 seconds delay to avoid accidental loads and strict mode double-count

        return () => clearTimeout(timer_id);
    }, [examId, user]);

    // Timer
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (status === 'solving' && exam) {
            interval = setInterval(() => {
                setTimer(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [status, exam]);

    const fetchExam = async (id: string) => {
        try {
            const docRef = doc(db, "exams", id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setExam({ id: docSnap.id, ...docSnap.data() });
            } else {
                showAlert("Prova não encontrada", "error", "Erro");
                router.push("/dashboard");
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

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

    const confirmAndNext = async (e: React.MouseEvent<HTMLButtonElement>) => {
        const currentAnswer = answers[currentIndex];
        const isCorrect = currentAnswer && exam.extractedData?.questions[currentIndex]?.correctAnswer?.toLowerCase() === currentAnswer.toLowerCase();

        if (isCorrect && user && !answeredQuestions.has(currentIndex)) {
            if (currentIndex >= maxIndex) {
                try {
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

                    // Persist to Firebase in background (don't await)
                    runTransaction(db, async (transaction) => {
                        const userRef = doc(db, "users", user.uid);
                        const userDoc = await transaction.get(userRef);
                        if (!userDoc.exists()) throw "User does not exist!";
                        const newCredits = (userDoc.data().credits || 0) + 1;
                        transaction.update(userRef, { credits: newCredits });
                    }).catch(error => console.error("Error updating credits in background:", error));

                    setAnsweredQuestions(prev => {
                        const next = new Set(prev);
                        next.add(currentIndex);
                        return next;
                    });

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
                "Deseja realmente finalizar a prova e ver o resultado?",
                "info",
                "Finalizar Prova",
                () => handleFinish()
            );
        } else {
            setCurrentIndex(prev => prev + 1);
            scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handleFinish = async () => {
        setStatus('finished');
        if (rewardAwarded || !user || !exam?.extractedData?.questions) return;

        const score = calculateScore();
        let rewardCoins = 0;

        if (score.percentage === 100) {
            rewardCoins = 50;
        } else if (score.percentage >= 81) {
            rewardCoins = 20;
        } else if (score.percentage >= 71) {
            rewardCoins = 10;
        } else if (score.percentage >= 60) {
            rewardCoins = 5;
        }

        if (rewardCoins > 0) {
            try {
                setRewardAwarded(true);

                // Update Firestore in background
                runTransaction(db, async (transaction) => {
                    const userRef = doc(db, "users", user.uid);
                    const userDoc = await transaction.get(userRef);
                    if (!userDoc.exists()) throw "User does not exist!";
                    const newCredits = (userDoc.data().credits || 0) + rewardCoins;
                    transaction.update(userRef, { credits: newCredits });
                }).catch(error => console.error("Error awarding final reward in background:", error));

                const startX = window.innerWidth / 2;
                const startY = window.innerHeight / 2;

                const coinsToAnimate = Array.from({ length: Math.min(rewardCoins, 15) }).map((_, i) => ({
                    id: Date.now() + i,
                    startX,
                    startY,
                    delay: i * 0.1
                }));

                setFlyingCoins(prev => [...prev, ...coinsToAnimate]);
                playSound('success');

            } catch (error) {
                console.error("Error awarding final reward:", error);
            }
        }
    };

    const calculateScore = () => {
        if (!exam?.extractedData?.questions) return { correct: 0, total: 0, percentage: 0 };
        let correct = 0;
        exam.extractedData.questions.forEach((q: any, idx: number) => {
            const userAns = answers[idx]?.toLowerCase();
            const correctAns = q.correctAnswer?.toLowerCase();
            if (userAns && userAns === correctAns) {
                correct++;
            }
        });
        const total = exam.extractedData.questions.length;
        return {
            correct,
            total,
            percentage: total > 0 ? (correct / total) * 100 : 0
        };
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const getMotivationalMessage = (percentage: number) => {
        if (percentage < 39.5) return {
            title: "😕 Não desanime!",
            body: "Este quiz foi um desafio, mas cada tentativa é um passo no aprendizado.\n👉 Revise o conteúdo e tente novamente!",
            color: "text-slate-800 dark:text-white"
        };
        if (percentage < 59.5) return {
            title: "🙂 Você está no caminho certo!",
            body: "Já demonstrou compreensão em vários pontos.\n🔄 Revise os erros e refaça o quiz para melhorar ainda mais!",
            color: "text-blue-600 dark:text-blue-400"
        };
        if (percentage < 79.5) return {
            title: "😃 Muito bem!",
            body: "Você teve um ótimo desempenho e mostrou bom domínio do conteúdo.\n🚀 Continue praticando para alcançar a excelência!",
            color: "text-green-600 dark:text-green-400"
        };
        return {
            title: "🏆 Parabéns! Excelente resultado!",
            body: "Você demonstrou alto nível de conhecimento neste quiz.\n🎯 Continue assim e avance para o próximo desafio!",
            color: "text-violet-600 dark:text-violet-400"
        };
    };

    if (authLoading || loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-violet-500" /></div>;
    if (!exam) return null;

    const questions = exam.extractedData?.questions || [];
    const currentQuestion = questions[currentIndex];
    const score = calculateScore();
    const motivational = getMotivationalMessage(score.percentage);

    // Support text and graphic check for current question
    const validSupportTexts = exam?.extractedData?.supportTexts?.filter((st: any) => {
        if (!st.associatedQuestions) return false;
        return st.associatedQuestions.includes((currentIndex + 1).toString());
    });
    const hasGraphic = currentQuestion?.graphicUrl;

    return (
        <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 transition-all duration-500 overflow-hidden">
            {status === 'finished' ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar">

                    {/* Fixed Header */}
                    <div className="fixed top-0 left-0 w-full h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-50 flex items-center justify-between px-4 md:px-8 shadow-sm">
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                        >
                            <img src="/icone.png" alt="ViewGo Logo" className="w-8 h-8 object-contain" />
                            <span className="font-bold text-xl text-slate-800 dark:text-white hidden sm:block">ViewGo</span>
                        </button>

                        <div className="flex items-center gap-3">
                            {/* Credits Display in Results Header */}
                            <div
                                ref={headersCreditsRef}
                                className={clsx(
                                    "hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full font-mono font-bold transition-all duration-300 text-xs md:text-sm",
                                    creditPulse ? "bg-green-100 text-green-600 scale-110 shadow-[0_0_15px_rgba(16,185,129,0.5)]" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                                )}
                            >
                                <Coins className={clsx("w-3 h-3 md:w-4 md:h-4", creditPulse && "text-green-500")} />
                                <span>{userCredits}</span>
                            </div>

                            <button
                                onClick={() => router.push('/dashboard')}
                                className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition"
                            >
                                Início
                            </button>
                            <button
                                onClick={() => {
                                    setStatus('solving');
                                    setCurrentIndex(0);
                                    setAnswers({});
                                    setTimer(0);
                                    setRewardAwarded(false);
                                    setAnsweredQuestions(new Set());
                                }}
                                className="px-4 py-2 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition shadow-sm hover:shadow-md"
                            >
                                Refazer Prova
                            </button>
                        </div>
                    </div>

                    {/* Content with Top Padding */}
                    <div className="pt-24 pb-12 px-4 md:px-8">
                        <div className="max-w-3xl mx-auto space-y-6">
                            {/* Header Results */}
                            <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 text-center space-y-4">
                                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 mb-2">
                                    {score.percentage >= 70 ? (
                                        <CheckCircle className="w-10 h-10 text-green-500" />
                                    ) : (
                                        <AlertTriangle className="w-10 h-10 text-violet-500" />
                                    )}
                                </div>

                                <h1 className={clsx("text-2xl md:text-3xl font-bold", motivational.color)}>
                                    {motivational.title}
                                </h1>
                                <p className="text-lg text-slate-600 dark:text-slate-400 max-w-lg mx-auto whitespace-pre-wrap">
                                    {motivational.body}
                                </p>

                                <div className="grid grid-cols-3 gap-4 mt-6 max-w-lg mx-auto">
                                    <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                                        <p className="text-sm text-slate-500 dark:text-slate-400 uppercase font-semibold">Acertos</p>
                                        <p className="text-2xl font-bold text-green-600">{score.correct}/{score.total}</p>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                                        <p className="text-sm text-slate-500 dark:text-slate-400 uppercase font-semibold">Porcentagem</p>
                                        <p className="text-2xl font-bold text-blue-600">{score.percentage.toFixed(0)}%</p>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                                        <p className="text-sm text-slate-500 dark:text-slate-400 uppercase font-semibold">Tempo</p>
                                        <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">{formatTime(timer)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Quick Answer Key (Gabarito Rápido) */}
                            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4">Gabarito Rápido</h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-200 dark:border-slate-700">
                                                <th className="text-left py-2 px-2 text-slate-500 dark:text-slate-400 font-medium">Q</th>
                                                {['A', 'B', 'C', 'D', 'E'].map(letter => (
                                                    <th key={letter} className="text-center py-2 px-2 text-slate-500 dark:text-slate-400 font-medium w-12">{letter}</th>
                                                ))}
                                                <th className="text-center py-2 px-2 text-slate-500 dark:text-slate-400 font-medium">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {questions.map((q: any, idx: number) => {
                                                const userAns = answers[idx]?.toLowerCase();
                                                const correctAns = q.correctAnswer?.toLowerCase();
                                                const isAnswered = !!userAns;
                                                const isCorrect = userAns === correctAns;

                                                return (
                                                    <tr key={idx} className={clsx(
                                                        "border-b border-slate-100 dark:border-slate-800 last:border-none",
                                                        isAnswered
                                                            ? (isCorrect ? "bg-green-50/50 dark:bg-green-900/20" : "bg-red-50/50 dark:bg-red-900/20")
                                                            : "bg-slate-50/50 dark:bg-slate-800/30"
                                                    )}>
                                                        <td className="py-2 px-2 font-bold text-slate-700 dark:text-slate-300">{idx + 1}</td>
                                                        {['a', 'b', 'c', 'd', 'e'].map(letter => {
                                                            const isUserChoice = userAns === letter;
                                                            const isCorrectAnswer = correctAns === letter;

                                                            return (
                                                                <td key={letter} className="py-2 px-2 text-center">
                                                                    <div className={clsx(
                                                                        "w-8 h-8 mx-auto rounded-full flex items-center justify-center text-xs font-bold border-2",
                                                                        isCorrectAnswer && isUserChoice
                                                                            ? "bg-green-500 border-green-500 text-white"
                                                                            : isCorrectAnswer
                                                                                ? "bg-green-100 border-green-400 text-green-700"
                                                                                : isUserChoice
                                                                                    ? "bg-red-500 border-red-500 text-white"
                                                                                    : "bg-slate-100 border-slate-200 text-slate-400"
                                                                    )}>
                                                                        {letter.toUpperCase()}
                                                                    </div>
                                                                </td>
                                                            );
                                                        })}
                                                        <td className="py-2 px-2 text-center">
                                                            {isAnswered ? (
                                                                isCorrect ? (
                                                                    <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                                                                ) : (
                                                                    <XCircle className="w-5 h-5 text-red-500 mx-auto" />
                                                                )
                                                            ) : (
                                                                <span className="text-xs text-slate-400">—</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="flex items-center gap-6 mt-4 text-xs text-slate-500">
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 rounded-full bg-green-500"></div>
                                        <span>Acerto</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 rounded-full bg-red-500"></div>
                                        <span>Erro</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 rounded-full bg-green-100 border-2 border-green-400"></div>
                                        <span>Resposta Correta</span>
                                    </div>
                                </div>
                            </div>

                            {/* Detailed Answer Key */}
                            <div className="space-y-4 pb-20">
                                <h2 className="text-xl font-bold text-slate-800 dark:text-white px-2">Gabarito Detalhado</h2>
                                {questions.map((q: any, idx: number) => {
                                    const userAns = answers[idx]?.toLowerCase();
                                    const correctAns = q.correctAnswer?.toLowerCase();
                                    const isCorrect = userAns === correctAns;
                                    const isAnswered = !!userAns;

                                    return (
                                        <div key={idx} className={clsx(
                                            "bg-white dark:bg-slate-900 p-6 rounded-xl border shadow-sm",
                                            isAnswered
                                                ? (isCorrect ? "border-green-200 dark:border-green-900/50 bg-green-50/30 dark:bg-green-900/10" : "border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-900/10")
                                                : "border-slate-200 dark:border-slate-800"
                                        )}>
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex items-center gap-2">
                                                    <span className={clsx(
                                                        "text-xs font-bold px-2 py-1 rounded",
                                                        isAnswered
                                                            ? (isCorrect ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")
                                                            : "bg-slate-100 text-slate-500"
                                                    )}>
                                                        Questão {idx + 1}
                                                    </span>
                                                    {isAnswered ? (
                                                        isCorrect ? (
                                                            <span className="text-xs font-bold text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Correto</span>
                                                        ) : (
                                                            <span className="text-xs font-bold text-red-600 flex items-center gap-1"><XCircle className="w-3 h-3" /> Errado</span>
                                                        )
                                                    ) : (
                                                        <span className="text-xs font-medium text-slate-400">Não respondida</span>
                                                    )}
                                                </div>
                                            </div>

                                            {q.graphicUrl && (
                                                <div className="mb-4">
                                                    <img
                                                        src={q.graphicUrl}
                                                        alt={`Gráfico da Questão ${idx + 1}`}
                                                        className="max-w-full h-auto max-h-64 rounded-lg border border-slate-200 dark:border-slate-700 object-contain mx-auto"
                                                    />
                                                </div>
                                            )}

                                            <FormattedText text={q.text} className="text-slate-800 dark:text-slate-200 mb-4 text-sm font-medium block" />

                                            <div className="space-y-2">
                                                {q.options?.map((opt: string, optIdx: number) => {
                                                    const letter = String.fromCharCode(97 + optIdx);
                                                    const isSelected = userAns === letter;
                                                    const isTheCorrect = correctAns === letter;

                                                    return (
                                                        <div key={optIdx} className={clsx(
                                                            "p-2 rounded-lg text-sm border flex items-center gap-2",
                                                            isTheCorrect ? "bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300"
                                                                : isSelected ? "bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300"
                                                                    : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                                                        )}>
                                                            <span className="font-bold uppercase w-6">{letter})</span>
                                                            <FormattedText text={opt} className="flex-1" />

                                                            {isTheCorrect && <CheckCircle className="w-4 h-4 ml-auto text-green-600" />}
                                                            {isSelected && !isTheCorrect && <XCircle className="w-4 h-4 ml-auto text-red-600" />}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col relative z-0 overflow-hidden">
                    {/* Header */}
                    <div className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 md:px-6 shadow-sm z-10 shrink-0 transition-colors gap-2">
                        <div className="flex items-center gap-2 md:gap-4 shrink-0">
                            <button onClick={() => router.push('/dashboard')} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0">
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div className="flex flex-col min-w-0 max-w-[120px] md:max-w-xs">
                                <h1 className="font-bold text-slate-800 dark:text-white leading-tight truncate text-sm md:text-base" title={exam?.extractedData?.title || exam?.fileName || "Carregando..."}>
                                    {exam?.extractedData?.title || exam?.fileName || "Carregando..."}
                                </h1>
                                <span className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 truncate">
                                    Q.{currentIndex + 1}/{questions.length} • {Object.keys(answers).length} resp.
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 md:gap-6 shrink-0 overflow-x-auto no-scrollbar">
                            <div className="hidden sm:flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full text-slate-600 dark:text-slate-300 font-mono font-medium text-xs md:text-sm">
                                <Clock className="w-3 h-3 md:w-4 md:h-4 text-slate-400" />
                                {formatTime(timer)}
                            </div>

                            {/* Credits Display */}
                            <div ref={headersCreditsRef} className={clsx(
                                "hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full font-mono font-bold transition-all duration-300 text-xs md:text-sm",
                                creditPulse ? "bg-green-100 text-green-600 scale-110 shadow-[0_0_15px_rgba(16,185,129,0.5)]" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                            )}>
                                <Coins className={clsx("w-3 h-3 md:w-4 md:h-4", creditPulse && "text-green-500")} />
                                <span>{userCredits}</span>
                            </div>

                            <div className="flex items-center gap-2 md:gap-4">
                                <button
                                    onClick={() => setShowAnswerKey(true)}
                                    className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 p-2 md:p-0 rounded-lg md:rounded-none bg-blue-50 md:bg-transparent"
                                    title="Ver Gabarito"
                                >
                                    <CheckCircle className="w-4 h-4" />
                                    <span className="hidden md:inline">Gabarito</span>
                                </button>

                                {validSupportTexts && validSupportTexts.length > 0 && (
                                    <button
                                        onClick={() => setShowSupportTextModal(true)}
                                        className="text-sm font-medium text-purple-600 hover:text-purple-800 hover:underline flex items-center gap-1 p-2 md:p-0 rounded-lg md:rounded-none bg-purple-50 md:bg-transparent"
                                        title="Ver Textos"
                                    >
                                        <FileText className="w-4 h-4" />
                                        <span className="hidden md:inline">Textos ({validSupportTexts.length})</span>
                                    </button>
                                )}

                                {hasGraphic && (
                                    <button
                                        onClick={() => setShowGraphicModal(true)}
                                        className="text-sm font-medium text-violet-600 hover:text-violet-800 hover:underline flex items-center gap-1 p-2 md:p-0 rounded-lg md:rounded-none bg-violet-50 md:bg-transparent"
                                        title="Ver Imagem"
                                    >
                                        <Eye className="w-4 h-4" />
                                        <span className="hidden md:inline">Imagem</span>
                                    </button>
                                )}
                            </div>

                            <button
                                onClick={() => {
                                    showAlert(
                                        "Deseja realmente finalizar a prova e ver o resultado?",
                                        "info",
                                        "Finalizar Prova",
                                        () => handleFinish()
                                    );
                                }}
                                className="bg-violet-600 hover:bg-violet-700 text-white px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition whitespace-nowrap"
                            >
                                <span className="hidden md:inline">Finalizar Prova</span>
                                <span className="md:hidden">Fim</span>
                            </button>
                        </div>
                    </div>

                    {/* Main Quiz Area */}
                    <div className="flex-1 overflow-hidden flex flex-col relative z-0">
                        {/* Progress Bar */}
                        <div className="h-1 bg-slate-200 dark:bg-slate-800 w-full shrink-0">
                            <div
                                className="h-full bg-violet-500 transition-all duration-300 shadow-[0_0_10px_rgba(139,92,246,0.5)]"
                                style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                            ></div>
                        </div>

                        {/* Content */}
                        <div
                            ref={scrollContainerRef}
                            className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-10 pb-10 md:pb-20 flex justify-center custom-scrollbar"
                        >
                            <div className="w-full max-w-4xl space-y-8 pb-20 md:pb-40">
                                {/* Question Text */}
                                <div className="bg-white dark:bg-slate-900 p-6 md:p-10 rounded-3xl shadow-lg border border-slate-100 dark:border-slate-800/50 relative overflow-hidden group">
                                    <div className="absolute top-0 left-0 w-2 h-full bg-violet-600"></div>
                                    <FormattedText text={currentQuestion?.text || ""} className="text-lg md:text-2xl font-medium text-slate-800 dark:text-slate-100 leading-relaxed tracking-wide block" />
                                </div>

                                {/* Options */}
                                <div className="grid grid-cols-1 gap-4">
                                    {currentQuestion?.options?.map((opt: string, idx: number) => {
                                        const letter = String.fromCharCode(97 + idx); // a, b, c...
                                        const isSelected = answers[currentIndex] === letter;

                                        return (
                                            <button
                                                key={idx}
                                                id={`option-${currentIndex}-${letter}`}
                                                onClick={() => handleAnswer(letter)}
                                                className={clsx(
                                                    "w-full text-left p-5 rounded-2xl border-2 transition-all duration-300 flex items-center gap-5 group relative overflow-hidden",
                                                    isSelected
                                                        ? "border-violet-600 bg-violet-50/80 dark:bg-violet-900/20 shadow-lg shadow-violet-200 dark:shadow-none"
                                                        : "border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-md hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                                )}
                                            >
                                                <div className={clsx(
                                                    "w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold shrink-0 transition-transform duration-300 group-hover:scale-110 shadow-sm",
                                                    isSelected
                                                        ? "bg-violet-600 text-white shadow-violet-500/30"
                                                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-violet-100 dark:group-hover:bg-slate-700 group-hover:text-violet-600"
                                                )}>
                                                    {letter.toUpperCase()}
                                                </div>
                                                <FormattedText
                                                    text={opt}
                                                    className={clsx(
                                                        "text-lg",
                                                        isSelected ? "font-semibold" : ""
                                                    )}
                                                />
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="h-12 md:h-24 w-full shrink-0"></div>
                            </div>

                        </div>
                        {/* Footer Navigation */}
                        <div className="h-24 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 md:px-12 shrink-0 z-20">
                            <button
                                onClick={() => {
                                    setCurrentIndex(prev => Math.max(0, prev - 1));
                                    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                disabled={currentIndex === 0}
                                className="flex items-center gap-2 px-4 py-2 text-slate-500 hover:text-violet-600 disabled:opacity-30 disabled:hover:text-slate-500 transition font-bold uppercase tracking-wider text-sm"
                            >
                                <ChevronLeft className="w-5 h-5" />
                                Anterior
                            </button>

                            <button
                                onClick={confirmAndNext}
                                className="flex items-center gap-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-200 px-8 py-3 rounded-2xl font-bold transition shadow-xl shadow-slate-900/10 dark:shadow-none transform hover:-translate-y-0.5 active:translate-y-0"
                            >
                                {currentIndex === questions.length - 1 ? 'Finalizar' : 'Próxima'}
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Modals */}
                    {showAnswerKey && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowAnswerKey(false)}>
                            <div className="bg-white dark:bg-slate-900 w-full max-md:max-w-md md:max-w-md rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">Gabarito</h3>
                                    <button onClick={() => setShowAnswerKey(false)} className="text-slate-400 hover:text-slate-600">
                                        <XCircle className="w-6 h-6" />
                                    </button>
                                </div>
                                {maxIndex === 0 ? (
                                    <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                                        <p>Responda questões para ter acesso ao gabarito.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-5 gap-2">
                                        {questions.map((q: any, idx: number) => {
                                            if (idx >= maxIndex) return null;
                                            const userAns = answers[idx];
                                            let styleClass = "bg-slate-50 border-slate-200 text-slate-400";
                                            if (userAns) {
                                                const isCorrect = userAns.toLowerCase() === q.correctAnswer?.toLowerCase();
                                                styleClass = isCorrect
                                                    ? "bg-green-50 border-green-200 text-green-700"
                                                    : "bg-red-50 border-red-200 text-red-700";
                                            }
                                            return (
                                                <div key={idx} className={clsx(
                                                    "p-2 rounded text-center border text-sm font-bold transition-all",
                                                    styleClass
                                                )}>
                                                    <div className="text-xs text-slate-400 font-normal mb-1">{idx + 1}</div>
                                                    {q.correctAnswer?.toUpperCase() || '-'}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {showSupportTextModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowSupportTextModal(false)}>
                            <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95 max-h-[80vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
                                <div className="flex justify-between items-center mb-4 shrink-0">
                                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-purple-500" />
                                        Textos de Apoio
                                    </h3>
                                    <button onClick={() => setShowSupportTextModal(false)} className="text-slate-400 hover:text-slate-600">
                                        <XCircle className="w-6 h-6" />
                                    </button>
                                </div>
                                <div className="space-y-6 overflow-y-auto">
                                    {exam?.extractedData?.supportTexts
                                        ?.filter((st: any) => st.associatedQuestions?.includes((currentIndex + 1).toString()))
                                        .map((text: any, idx: number) => (
                                            <div key={idx} className="bg-slate-50 dark:bg-slate-800 p-6 rounded-xl border border-slate-100 dark:border-slate-700">
                                                <div className="flex justify-between items-center mb-3">
                                                    <span className="font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded text-sm">{text.id}</span>
                                                </div>
                                                <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                                                    {text.content}
                                                </p>
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        </div>
                    )}

                    {showGraphicModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowGraphicModal(false)}>
                            <div className="bg-transparent w-full max-w-4xl rounded-2xl p-2 relative animate-in zoom-in-95 flex flex-col items-center" onClick={e => e.stopPropagation()}>
                                <button
                                    onClick={() => setShowGraphicModal(false)}
                                    className="absolute -top-10 right-0 text-white/70 hover:text-white transition"
                                >
                                    <XCircle className="w-8 h-8" />
                                </button>
                                {currentQuestion?.graphicUrl && (
                                    <img
                                        src={currentQuestion.graphicUrl}
                                        alt={`Gráfico da Questão ${currentIndex + 1}`}
                                        className="max-w-full max-h-[80vh] rounded-lg shadow-2xl bg-white"
                                    />
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Flying Coins */}
            {flyingCoins.map(coin => (
                <div
                    key={coin.id}
                    className="fixed z-[100] pointer-events-none w-8 h-8 text-yellow-500 animate-coin-fly"
                    style={{
                        left: coin.startX,
                        top: coin.startY,
                        animationDelay: `${coin.delay}s`,
                        '--tx': `0px`,
                        '--ty': `-100px`,
                        '--target-x': `${(headersCreditsRef.current?.getBoundingClientRect().left ?? 0) + (headersCreditsRef.current?.offsetWidth ?? 0) / 2 - coin.startX - 16}px`,
                        '--target-y': `${(headersCreditsRef.current?.getBoundingClientRect().top ?? 0) + (headersCreditsRef.current?.offsetHeight ?? 0) / 2 - coin.startY - 16}px`
                    } as React.CSSProperties}
                    onAnimationEnd={() => {
                        setFlyingCoins(prev => prev.filter(c => c.id !== coin.id));
                        setUserCredits(prev => prev + 1);
                        setCreditPulse(true);
                        if (coin.delay === 0 || coin.id % 5 === 0) playSound('success');
                        setTimeout(() => setCreditPulse(false), 1000);
                    }}
                >
                    <Coins className="w-full h-full fill-yellow-500 animate-[coinPulse_0.5s_linear_infinite]" />
                </div>
            ))}
        </div>
    );
}
