"use client";

import { useAuth } from "../../../../context/AuthContext";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../../lib/firebase";
import { doc, getDoc, updateDoc, increment, setDoc, serverTimestamp, runTransaction, collection, getDocs } from "firebase/firestore";
import { Loader2, ArrowLeft, Eye, Clock, BookOpen, FileText, ChevronDown, ChevronUp, Share2 } from "lucide-react";
import { VideoPlayer } from "../../../components/VideoPlayer";
import { QuestionCard } from "../../../components/QuestionCard";
import { useAlert } from "../../../context/AlertContext";
import clsx from "clsx";

interface VideoLesson {
    id: string;
    title: string;
    description: string;
    embedUrl: string;
    thumbnailUrl?: string;
    duration?: string;
    subject: string;
    category?: string;
    difficulty?: 'Básico' | 'Intermediário' | 'Avançado';
    transcript?: string;
    questionIds: string[];
    createdBy: string;
    createdByEmail: string;
    createdAt: any;
    updatedAt: any;
    viewCount: number;
    isPublished: boolean;
}

interface Question {
    id: string;
    text: string;
    options: string[];
    correctAnswer: string;
    graphicUrl?: string;
    disciplina: string;
    banca: string;
    ano: number;
    concurso: string;
    cargo: string;
    nivel: string;
    supportText?: string;
    [key: string]: any;
}

interface VideoLessonClientProps {
    videoId: string;
}

export default function VideoLessonClient({ videoId }: VideoLessonClientProps) {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { showAlert } = useAlert();

    const [video, setVideo] = useState<VideoLesson | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(true);
    const [showTranscript, setShowTranscript] = useState(false);

    // Question answering state
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [results, setResults] = useState<Record<string, boolean>>({});
    const [previousResults, setPreviousResults] = useState<Record<string, boolean>>({});
    const [userCredits, setUserCredits] = useState(0);
    const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());

    // Fetch video data
    useEffect(() => {
        const fetchVideo = async () => {
            if (!videoId) return;

            try {
                const videoDoc = await getDoc(doc(db, "videoLessons", videoId));

                if (!videoDoc.exists()) {
                    showAlert("Vídeo não encontrado", "error");
                    router.push("/dashboard/videos");
                    return;
                }

                const videoData = { id: videoDoc.id, ...videoDoc.data() } as VideoLesson;
                setVideo(videoData);

                // Increment view count
                await updateDoc(doc(db, "videoLessons", videoId), {
                    viewCount: increment(1)
                });

                // Fetch associated questions
                if (videoData.questionIds && videoData.questionIds.length > 0) {
                    const questionPromises = videoData.questionIds.map(qId =>
                        getDoc(doc(db, "questions", qId))
                    );

                    const questionDocs = await Promise.all(questionPromises);
                    const questionData = questionDocs
                        .filter(doc => doc.exists())
                        .map(doc => {
                            const data = doc.data();
                            return {
                                id: doc.id,
                                ...data,
                                concurso: data?.concurso || "Não informado",
                                cargo: data?.cargo || "Não informado",
                                nivel: data?.nivel || "Não informado",
                                disciplina: data?.disciplina || "Geral",
                                banca: data?.banca || "Não informado",
                                ano: data?.ano || new Date().getFullYear(),
                            } as Question;
                        });

                    setQuestions(questionData);
                }
            } catch (error) {
                console.error("Error fetching video:", error);
                showAlert("Erro ao carregar vídeo", "error");
            } finally {
                setLoading(false);
            }
        };

        fetchVideo();
    }, [videoId, router, showAlert]);

    // Fetch user credits and previous attempts
    useEffect(() => {
        if (!user) return;

        const fetchUserData = async () => {
            try {
                // Fetch credits
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    setUserCredits(userDoc.data().credits || 0);
                }

                // Fetch previous attempts
                const attemptsRef = collection(db, "users", user.uid, "questionAttempts");
                const attemptsSnap = await getDocs(attemptsRef);
                const loadedResults: Record<string, boolean> = {};

                attemptsSnap.forEach(doc => {
                    loadedResults[doc.id] = doc.data().isCorrect;
                });

                setPreviousResults(loadedResults);
            } catch (error) {
                console.error("Error fetching user data:", error);
            }
        };

        fetchUserData();
    }, [user]);

    const handleAnswer = async (questionId: string, optionLetter: string, e: React.MouseEvent<HTMLButtonElement>) => {
        if (!user) {
            showAlert("Faça login para responder questões", "error");
            return;
        }

        if (results[questionId] !== undefined) return;

        const question = questions.find(q => q.id === questionId);
        if (!question) return;

        const isCorrect = optionLetter.toLowerCase() === (question.correctAnswer?.toLowerCase() || '');

        setAnswers(prev => ({ ...prev, [questionId]: optionLetter }));
        setResults(prev => ({ ...prev, [questionId]: isCorrect }));

        try {
            // Save attempt
            const attemptRef = doc(db, "users", user.uid, "questionAttempts", questionId);
            await setDoc(attemptRef, {
                questionId,
                isCorrect,
                userAnswer: optionLetter,
                lastAttemptAt: serverTimestamp(),
                videoId: videoId
            }, { merge: true });

            // Award credit if correct and first time answering
            if (isCorrect && !answeredQuestions.has(questionId)) {
                await runTransaction(db, async (transaction) => {
                    const userRef = doc(db, "users", user.uid);
                    const userDoc = await transaction.get(userRef);
                    if (!userDoc.exists()) throw "User does not exist!";
                    const newCredits = (userDoc.data().credits || 0) + 1;
                    transaction.update(userRef, { credits: newCredits });
                    setUserCredits(newCredits);
                });

                setAnsweredQuestions(prev => new Set(prev).add(questionId));
                showAlert("Resposta correta! +1 crédito", "success");
            } else if (!isCorrect) {
                showAlert("Resposta incorreta. Tente novamente!", "error");
            }
        } catch (error) {
            console.error("Error saving answer:", error);
        }
    };

    const handleQuestionShare = async (questionId: string) => {
        const url = `${window.location.origin}/dashboard/questions/solve?id=${questionId}`;
        try {
            await navigator.clipboard.writeText(url);
            showAlert("Link da questão copiado!", "success");
        } catch (err) {
            console.error("Failed to copy: ", err);
            showAlert("Erro ao copiar o link.", "error");
        }
    };

    const handleVideoShare = async () => {
        const url = window.location.href;

        try {
            await navigator.clipboard.writeText(url);
            showAlert("Link da aula copiado!", "success");
        } catch (err) {
            console.error("Failed to copy: ", err);
            showAlert("Erro ao copiar o link.", "error");
        }
    };

    if (authLoading || loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            </div>
        );
    }

    if (!video) {
        return null;
    }

    const difficultyColors = {
        'Básico': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        'Intermediário': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
        'Avançado': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* Header */}
            <header className="h-16 sticky top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-3 md:px-6 shadow-sm">
                <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0 mr-2">
                    <button
                        onClick={() => router.push('/dashboard/videos')}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0 p-1"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex flex-col min-w-0">
                        <h1 className="text-sm md:text-base font-bold text-slate-800 dark:text-white truncate leading-tight">
                            {video.title}
                        </h1>
                        <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-slate-500">
                            <Eye className="w-3 h-3" />
                            <span>{video.viewCount} <span className="hidden xs:inline">visualizações</span></span>
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleVideoShare}
                    className="p-2 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-full transition-colors shrink-0"
                    title="Compartilhar Aula"
                >
                    <Share2 className="w-5 h-5" />
                </button>
            </header>

            {/* Main Content */}
            <main className="max-w-6xl mx-auto px-4 md:px-8 py-4 md:py-8 space-y-6 md:space-y-8">
                {/* Video Player */}
                <VideoPlayer embedUrl={video.embedUrl} title={video.title} />

                {/* Video Info */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 md:p-6 space-y-4">
                    <div className="flex flex-wrap gap-2">
                        <span className="px-3 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-xs md:text-sm font-bold rounded-lg">
                            {video.subject}
                        </span>

                        {video.difficulty && (
                            <span className={clsx("px-3 py-1 text-sm font-bold rounded-lg", difficultyColors[video.difficulty])}>
                                {video.difficulty}
                            </span>
                        )}

                        {video.duration && (
                            <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-lg flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                {video.duration}
                            </span>
                        )}

                        <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-lg flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5" />
                            {questions.length} {questions.length === 1 ? 'questão' : 'questões'}
                        </span>
                    </div>

                    <div>
                        <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-white mb-2">
                            {video.title}
                        </h2>
                        <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
                            {video.description}
                        </p>
                    </div>

                    {/* Transcript */}
                    {video.transcript && (
                        <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                            <button
                                onClick={() => setShowTranscript(!showTranscript)}
                                className="flex items-center gap-2 text-sm font-bold text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
                            >
                                <FileText className="w-4 h-4" />
                                {showTranscript ? 'Ocultar' : 'Ver'} Transcrição
                                {showTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>

                            {showTranscript && (
                                <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                                    {video.transcript}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Questions Section */}
                {questions.length > 0 && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-3">
                            <BookOpen className="w-5 h-5 md:w-6 md:h-6 text-violet-500" />
                            <h2 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white">
                                Questões associadas ao Vídeo
                            </h2>
                        </div>

                        {questions.map((question, idx) => (
                            <QuestionCard
                                key={question.id}
                                question={{ ...question, questionIndex: idx }}
                                userAnswer={answers[question.id]}
                                isAnswered={results[question.id] !== undefined}
                                isCorrect={results[question.id]}
                                previousResult={previousResults[question.id]}
                                onAnswer={handleAnswer}
                                onShare={handleQuestionShare}
                                hasComments={false}
                            />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
