"use client";

import { useAuth } from "../../../context/AuthContext";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../lib/firebase";
import { collection, query, getDocs, orderBy, limit, doc, runTransaction, getDoc, collectionGroup } from "firebase/firestore";
import { Loader2, Filter, X, Coins, ArrowLeft, Search, ChevronDown } from "lucide-react";
import { QuestionCard } from "../../components/QuestionCard";
import { useAlert } from "../../context/AlertContext";
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
    estado?: string;
    municipio?: string;
    tipoQuestao: 'multipla_escolha' | 'certo_errado';
    isVerified?: boolean;
    createdBy?: string;
    createdByDisplayName?: string;
    createdByPhotoURL?: string;
}

interface FilterState {
    concurso: string;
    banca: string;
    cargo: string;
    nivel: string;
    disciplina: string;
    ano: string;
    estado: string;
    municipio: string;
    tipoQuestao: string;
}

const initialFilters: FilterState = {
    concurso: "",
    banca: "",
    cargo: "",
    nivel: "",
    disciplina: "",
    ano: "",
    estado: "",
    municipio: "",
    tipoQuestao: "",
};

const normalizeText = (text: string) => {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
};

export default function QuestionsListPage() {
    const { user, loading: authLoading, signInWithGoogle } = useAuth();
    const router = useRouter();
    const { showAlert } = useAlert();

    const [allQuestions, setAllQuestions] = useState<QuestionBankItem[]>([]);
    const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState<FilterState>(initialFilters);
    const [hideAnswered, setHideAnswered] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [results, setResults] = useState<Record<string, boolean>>({});
    const [previousResults, setPreviousResults] = useState<Record<string, boolean>>({});
    const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
    const [userCredits, setUserCredits] = useState(0);
    const [flyingCoins, setFlyingCoins] = useState<{ id: number; startX: number; startY: number; delay: number }[]>([]);
    const [creditPulse, setCreditPulse] = useState(false);

    const [visibleCount, setVisibleCount] = useState(20);
    const [questionsWithComments, setQuestionsWithComments] = useState<Set<string>>(new Set());
    const observerTarget = useRef<HTMLDivElement>(null);
    const headersCreditsRef = useRef<HTMLDivElement>(null);

    // Dynamic filter options
    const [dynamicOptions, setDynamicOptions] = useState<{
        concursos: string[];
        bancas: string[];
        cargos: string[];
        niveis: string[];
        disciplinas: string[];
        anos: string[];
        estados: string[];
        municipios: string[];
        tipos: { label: string, value: string }[];
    }>({
        concursos: [],
        bancas: [],
        cargos: [],
        niveis: [],
        disciplinas: [],
        anos: [],
        estados: [],
        municipios: [],
        tipos: [
            { label: "Múltipla Escolha", value: "multipla_escolha" },
            { label: "Certo ou Errado", value: "certo_errado" }
        ],
    });

    // Infinite Scroll Logic (Parity with QuestionBankPage)
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && questions.length > visibleCount) {
                    setVisibleCount((prev) => prev + 20);
                }
            },
            { threshold: 0.1, rootMargin: '100px' }
        );

        const currentTarget = observerTarget.current;
        if (currentTarget) {
            observer.observe(currentTarget);
        }

        return () => {
            if (currentTarget) {
                observer.unobserve(currentTarget);
            }
        };
    }, [questions.length, visibleCount]);

    // Fetch User Question Attempts
    useEffect(() => {
        if (!user) return;

        const fetchAttempts = async () => {
            try {
                const attemptsRef = collection(db, "users", user.uid, "questionAttempts");
                const snap = await getDocs(attemptsRef);

                const loadedPreviousResults: Record<string, boolean> = {};

                snap.forEach(doc => {
                    const data = doc.data();
                    // Do NOT populate 'answers' or 'results' to keep UI unlocked
                    // loadedAnswers[doc.id] = data.userAnswer; 
                    // loadedResults[doc.id] = data.isCorrect;

                    // Populate previousResults for the badge
                    loadedPreviousResults[doc.id] = data.isCorrect;
                });

                // setAnswers(prev => ({ ...prev, ...loadedAnswers }));
                // setResults(prev => ({ ...prev, ...loadedResults }));
                setPreviousResults(loadedPreviousResults);

                // We typically don't set answeredQuestions if we want to allow re-answering for credits/logic
                // But if you want to prevent double credits for *historical* answers, you might keep loadedSet
                // The user said "possibility to resolve again". Usually this implies they can try again.
                // However, credit logic usually prevents spamming. The current logic checks 'answeredQuestions.has(questionId)'
                // If we want to allow them to "try again" but maybe not get credits again if they already got them?
                // For now, let's NOT populate answeredQuestions from history, so it acts like a fresh session visually. 
                // IF credit logic checks Firestore, it will be safe. 
                // BUT the code checks 'answeredQuestions' state. Let's see:
                // "if (isCorrect && !answeredQuestions.has(questionId))"
                // If we don't set this Set, they might get credits again. 
                // Let's populate the Set to prevent abuse, or let them have credits? 
                // "always show to the user... enable to resolve again".
                // I will NOT populate 'results'/'answers', so the UI is unlocked. 
                // I WILL populate 'previousResults' for the badge.

            } catch (err) {
                console.error("Error fetching question attempts:", err);
            }
        };

        fetchAttempts();
    }, [user]);

    // Auth redirect removed to allow guest browsing <!-- id: 44 -->

    // Fetch user credits
    useEffect(() => {
        if (!user) return;

        const fetchCredits = async () => {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                setUserCredits(userDoc.data().credits || 0);
            }
        };

        fetchCredits();
    }, [user]);

    // Fetch questions with comments
    useEffect(() => {
        const fetchQuestionsWithComments = async () => {
            try {
                // Use a collection group query to find all 'comments' collections
                const commentsQuery = query(collectionGroup(db, "comments"));
                const snapshot = await getDocs(commentsQuery);

                const qIds = new Set<string>();
                snapshot.docs.forEach(doc => {
                    // The parent of the comment doc is the 'comments' collection
                    // The parent of that collection is the question document
                    const questionId = doc.ref.parent.parent?.id;
                    if (questionId) {
                        qIds.add(questionId);
                    }
                });
                setQuestionsWithComments(qIds);
            } catch (err) {
                console.error("Error fetching questions with comments:", err);
            }
        };

        fetchQuestionsWithComments();
    }, []);

    // Persistence for hideAnswered (Initial Load Only)
    useEffect(() => {
        const saved = localStorage.getItem("hideAnsweredQuestions");
        if (saved !== null) {
            setHideAnswered(saved === "true");
        }
    }, []);

    // Initial fetch
    useEffect(() => {
        const fetchInitialQuestions = async () => {
            setLoading(true);
            try {
                const q = query(collection(db, "questions"), orderBy("createdAt", "desc"), limit(2000));
                const snapshot = await getDocs(q);

                const resultsMap = new Map<string, QuestionBankItem>();
                snapshot.docs.forEach(doc => {
                    resultsMap.set(doc.id, { id: doc.id, ...doc.data() } as QuestionBankItem);
                });
                setAllQuestions(Array.from(resultsMap.values()));
            } catch (e) {
                console.error("Error fetching initial questions:", e);
                showAlert("Erro ao carregar questões", "error");
            } finally {
                setLoading(false);
            }
        };

        fetchInitialQuestions();
    }, [user]);

    // Dynamic Filtering Logic
    useEffect(() => {
        let filtered = [...allQuestions];

        const applyFilters = (items: QuestionBankItem[], currentFilters: FilterState, skipKey?: keyof FilterState) => {
            let res = items;
            Object.entries(currentFilters).forEach(([key, value]) => {
                if (value && key !== skipKey) {
                    const normFilter = normalizeText(value);
                    if (key === 'ano') {
                        res = res.filter(q => String(q.ano) === value);
                    } else if (key === 'tipoQuestao') {
                        res = res.filter(q => q.tipoQuestao === value);
                    } else {
                        res = res.filter(q => normalizeText((q as any)[key] || "").includes(normFilter));
                    }
                }
            });
            return res;
        };

        filtered = applyFilters(allQuestions, filters);

        // Natural Language Pattern Detection
        if (searchQuery.trim()) {
            const lowerQuery = searchQuery.toLowerCase().trim();

            const disciplinePatterns = [
                { pattern: /quest[õo]es\s+de\s+(portugu[êe]s|l[íi]ngua\s+portuguesa)/i, discipline: "Língua Portuguesa" },
                { pattern: /quest[õo]es\s+de\s+matem[áa]tica/i, discipline: "Matemática" },
                { pattern: /quest[õo]es\s+de\s+(racioc[íi]nio\s+l[óo]gico|l[óo]gica)/i, discipline: "Raciocínio Lógico-Matemático" },
                { pattern: /quest[õo]es\s+de\s+inform[áa]tica/i, discipline: "Informática" },
                { pattern: /quest[õo]es\s+de\s+(direito\s+)?constitucional/i, discipline: "Direito Constitucional" },
                { pattern: /quest[õo]es\s+de\s+(direito\s+)?administrativo/i, discipline: "Direito Administrativo" },
                { pattern: /quest[õo]es\s+de\s+(direito\s+)?penal/i, discipline: "Direito Penal" },
                { pattern: /quest[õo]es\s+de\s+(direito\s+)?civil/i, discipline: "Direito Civil" },
                { pattern: /quest[õo]es\s+de\s+[ée]tica/i, discipline: "Ética no Serviço Público" },
                { pattern: /quest[õo]es\s+de\s+atualidades/i, discipline: "Atualidades" },
            ];

            let detectedDiscipline = "";
            for (const { pattern, discipline } of disciplinePatterns) {
                if (pattern.test(lowerQuery)) {
                    detectedDiscipline = discipline;
                    break;
                }
            }

            if (detectedDiscipline) {
                filtered = filtered.filter(q =>
                    normalizeText(q.disciplina || "").includes(normalizeText(detectedDiscipline))
                );
            } else {
                const tokens = normalizeText(searchQuery).split(/\s+/).filter(Boolean);
                filtered = filtered.filter(q => {
                    const searchableText = normalizeText([
                        q.text,
                        q.disciplina,
                        q.concurso,
                        q.banca,
                        q.cargo,
                        q.examTitle,
                        ...(q.options || [])
                    ].filter(Boolean).join(" "));
                    return tokens.every(token => searchableText.includes(token));
                });
            }
        }

        if (hideAnswered) {
            filtered = filtered.filter(q => previousResults[q.id] === undefined);
        }

        setQuestions(filtered);

        // Recalculate Facets
        const getUniqueOptions = (key: keyof QuestionBankItem, skipKey: keyof FilterState) => {
            // Apply all filters EXCEPT the one being calculated (skipKey)
            // AND ensure hideAnswered is respected if active
            let availableItems = applyFilters(allQuestions, filters, skipKey);

            if (hideAnswered) {
                availableItems = availableItems.filter(q => previousResults[q.id] === undefined);
            }

            const set = new Set<string>();
            availableItems.forEach(item => {
                const val = (item as any)[key];
                if (val) set.add(String(val));
            });

            const map = new Map<string, string>();
            Array.from(set).forEach(val => {
                const norm = normalizeText(val);
                if (!map.has(norm)) map.set(norm, val);
            });
            return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
        };

        setDynamicOptions(prev => ({
            ...prev,
            concursos: getUniqueOptions('concurso', 'concurso'),
            bancas: getUniqueOptions('banca', 'banca'),
            cargos: getUniqueOptions('cargo', 'cargo'),
            niveis: getUniqueOptions('nivel', 'nivel'),
            disciplinas: getUniqueOptions('disciplina', 'disciplina'),
            anos: getUniqueOptions('ano' as any, 'ano').sort((a, b) => Number(b) - Number(a)),
            estados: getUniqueOptions('estado' as any, 'estado'),
            municipios: getUniqueOptions('municipio' as any, 'municipio'),
            tipos: (() => {
                let availableItems = applyFilters(allQuestions, filters, 'tipoQuestao');
                if (hideAnswered) {
                    availableItems = availableItems.filter(q => previousResults[q.id] === undefined);
                }
                const types = new Set<string>();
                availableItems.forEach(q => q.tipoQuestao && types.add(q.tipoQuestao));
                const res = [];
                if (types.has('multipla_escolha')) res.push({ label: "Múltipla Escolha", value: "multipla_escolha" });
                if (types.has('certo_errado')) res.push({ label: "Certo ou Errado", value: "certo_errado" });
                return res;
            })(),
        }));

        setVisibleCount(20);
        if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [allQuestions, filters, searchQuery, hideAnswered, previousResults]);

    const playSound = (type: 'collect' | 'success') => {
        const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReduced) return;

        const audio = new Audio(`/sounds/coin-${type}.mp3`);
        if (type === 'success') {
            audio.volume = 0.2;
        }
        audio.play().catch(e => console.error("Audio play failed", e));
    };

    const handleAnswer = async (questionId: string, optionLetter: string, e: React.MouseEvent<HTMLButtonElement>) => {
        // Capture position for animation synchronously BEFORE ANY async operations
        const rect = e.currentTarget.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;

        if (!user) {
            await signInWithGoogle();
            return;
        }

        if (results[questionId] !== undefined) return;

        const question = questions.find(q => q.id === questionId);
        if (!question) return;

        const isCorrect = optionLetter.toLowerCase() === (question.correctAnswer?.toLowerCase() || '');

        // Trigger coin animation immediately if correct and not already answered for instant feedback
        if (isCorrect && !answeredQuestions.has(questionId)) {
            const newCoin = { id: Date.now(), startX, startY, delay: 0 };
            setFlyingCoins(prev => [...prev, newCoin]);
            playSound('collect');
            // Set as answered immediately to prevent duplicate animations
            setAnsweredQuestions(prev => new Set(prev).add(questionId));
        }

        setAnswers(prev => ({ ...prev, [questionId]: optionLetter }));
        setResults(prev => ({ ...prev, [questionId]: isCorrect }));

        try {
            const attemptRef = doc(db, "users", user.uid, "questionAttempts", questionId);
            await import("firebase/firestore").then(({ setDoc, serverTimestamp }) => {
                setDoc(attemptRef, {
                    questionId,
                    isCorrect,
                    userAnswer: optionLetter,
                    lastAttemptAt: serverTimestamp(),
                    examId: question.examId
                }, { merge: true });
            });

            if (isCorrect) {
                // The answeredQuestions check and set were moved above for immediate feedback
                await runTransaction(db, async (transaction) => {
                    const userRef = doc(db, "users", user.uid);
                    const userDoc = await transaction.get(userRef);
                    if (!userDoc.exists()) throw "User does not exist!";
                    const newCredits = (userDoc.data().credits || 0) + 1;
                    transaction.update(userRef, { credits: newCredits });
                    setUserCredits(newCredits);
                });
            }
        } catch (error) {
            console.error("Error saving answer:", error);
        }
    };

    const handleShare = async (questionId: string) => {
        const url = `${window.location.origin}/dashboard/questions/solve?id=${questionId}`;
        try {
            await navigator.clipboard.writeText(url);
            showAlert("Link copiado para a área de transferência!", "success");
        } catch (err) {
            console.error("Failed to copy: ", err);
            showAlert("Erro ao copiar o link.", "error");
        }
    };

    const handleFilterChange = (key: keyof FilterState, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const clearFilters = () => {
        setFilters(initialFilters);
        setSearchQuery("");
    };

    if (authLoading || loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            </div>
        );
    }

    const hasActiveFilters = Object.values(filters).some(v => v) || searchQuery.trim();

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* Fixed Header */}
            <header className="h-16 sticky top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 md:px-6 shadow-sm shrink-0 transition-colors gap-2">
                <div className="flex items-center gap-2 md:gap-4 shrink-0">
                    <button
                        onClick={() => router.push(user ? '/dashboard' : '/')}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex flex-col min-w-0 max-w-[200px] md:max-w-md">
                        <h1 className="text-lg md:text-xl font-black text-slate-800 dark:text-white flex items-center gap-2 truncate"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-book-open w-5 h-5 md:w-6 md:h-6 text-violet-500 shrink-0" aria-hidden="true"><path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path></svg><span className="truncate">Resolver Questões</span></h1>
                        <span className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 truncate">
                            {questions.length} de {allQuestions.length} questões disponíveis • {Object.keys(results).length} respondidas agora
                        </span>
                    </div>
                </div>

                {user && (
                    <div className="flex items-center gap-2 md:gap-6 shrink-0">
                        <div
                            ref={headersCreditsRef}
                            className={clsx(
                                "flex items-center gap-2 px-3 py-1.5 rounded-full font-mono font-bold transition-all duration-300 text-xs md:text-sm",
                                creditPulse
                                    ? "bg-green-100 text-green-600 scale-110 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                            )}
                        >
                            <Coins className={clsx("w-3 h-3 md:w-4 md:h-4", creditPulse && "text-green-500")} />
                            <span>{userCredits}</span>
                        </div>
                    </div>
                )}
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
                {/* Advanced Filter Panel */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xl mb-8">
                    <div className="px-6 py-4 md:py-6 border-b border-slate-100 dark:border-slate-800 flex flex-col xs:flex-row items-start xs:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/50">
                        <div className="flex items-center gap-2">
                            <Filter className="w-5 h-5 text-violet-500" />
                            <h2 className="font-bold text-sm md:text-base text-slate-800 dark:text-white uppercase tracking-tight">Filtros Inteligentes</h2>
                        </div>
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={hideAnswered}
                                    onChange={(e) => {
                                        const newValue = e.target.checked;
                                        setHideAnswered(newValue);
                                        localStorage.setItem("hideAnsweredQuestions", String(newValue));
                                    }}
                                    className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                />
                                <span className="text-sm text-slate-600 dark:text-slate-300 font-medium">Ocultar Respondidas</span>
                            </label>
                            {hasActiveFilters && (
                                <button
                                    onClick={clearFilters}
                                    className="text-[10px] md:text-xs font-bold text-red-500 hover:text-red-600 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition border border-red-100 dark:border-red-900/20"
                                >
                                    <X className="w-3.5 h-3.5" />
                                    LIMPAR FILTROS
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="p-8 space-y-8">
                        {/* Search Bar */}
                        <div className="relative group">
                            <Search className="absolute left-5 top-4 w-5 h-5 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
                            <input
                                type="text"
                                placeholder='Busca inteligente (ex: "questões de português")'
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-14 pr-5 py-4 bg-slate-50 dark:bg-slate-800/70 border-2 border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none text-sm font-medium transition-all placeholder:text-slate-400"
                            />
                        </div>

                        {/* Filter Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            <SelectFilter
                                label="Concurso"
                                value={filters.concurso}
                                options={dynamicOptions.concursos}
                                onChange={(v) => handleFilterChange('concurso', v)}
                                placeholder="Todos os concursos"
                            />
                            <SelectFilter
                                label="Banca"
                                value={filters.banca}
                                options={dynamicOptions.bancas}
                                onChange={(v) => handleFilterChange('banca', v)}
                                placeholder="Todas as bancas"
                            />
                            <SelectFilter
                                label="Cargo"
                                value={filters.cargo}
                                options={dynamicOptions.cargos}
                                onChange={(v) => handleFilterChange('cargo', v)}
                                placeholder="Todos os cargos"
                            />
                            <SelectFilter
                                label="Nível"
                                value={filters.nivel}
                                options={dynamicOptions.niveis}
                                onChange={(v) => handleFilterChange('nivel', v)}
                                placeholder="Todos os níveis"
                            />
                            <SelectFilter
                                label="Disciplina"
                                value={filters.disciplina}
                                options={dynamicOptions.disciplinas}
                                onChange={(v) => handleFilterChange('disciplina', v)}
                                placeholder="Todas as matérias"
                            />
                            <SelectFilter
                                label="Ano"
                                value={filters.ano}
                                options={dynamicOptions.anos}
                                onChange={(v) => handleFilterChange('ano', v)}
                                placeholder="Qualquer ano"
                            />
                            <SelectFilter
                                label="Estado (UF)"
                                value={filters.estado}
                                options={dynamicOptions.estados}
                                onChange={(v) => handleFilterChange('estado', v)}
                                placeholder="Todos os estados"
                            />
                            <SelectFilter
                                label="Município"
                                value={filters.municipio}
                                options={dynamicOptions.municipios}
                                onChange={(v) => handleFilterChange('municipio', v)}
                                placeholder="Todos os municípios"
                            />
                            <SelectFilter
                                label="Tipo de Questão"
                                value={filters.tipoQuestao}
                                options={dynamicOptions.tipos}
                                onChange={(v) => handleFilterChange('tipoQuestao', v)}
                                placeholder="Todos os tipos"
                            />
                        </div>
                    </div>
                </div>

                {/* Questions List */}
                <div className="space-y-6">
                    {questions.slice(0, visibleCount).map((question, idx) => (
                        <QuestionCard
                            key={question.id}
                            question={{ ...question, questionIndex: idx }}
                            userAnswer={answers[question.id]}
                            isAnswered={results[question.id] !== undefined}
                            isCorrect={results[question.id]}
                            previousResult={previousResults[question.id]}
                            onAnswer={handleAnswer}
                            onShare={handleShare}
                            hasComments={questionsWithComments.has(question.id)}
                        />
                    ))}

                    {/* Sentinel Element for Lazy Loading */}
                    {visibleCount < questions.length && (
                        <div ref={observerTarget} className="py-8 flex justify-center">
                            <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
                        </div>
                    )}

                    {questions.length === 0 && !loading && (
                        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
                            <p className="text-lg font-medium text-slate-500 dark:text-slate-400 mb-2">
                                Nenhuma questão encontrada
                            </p>
                            <p className="text-sm text-slate-400 dark:text-slate-500">
                                Tente ajustar os filtros ou realizar uma nova busca
                            </p>
                        </div>
                    )}
                </div>
            </main>

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
                        playSound('success');
                        setTimeout(() => setCreditPulse(false), 1000);
                    }}
                >
                    <Coins className="w-full h-full fill-yellow-500 animate-[coinPulse_0.5s_linear_infinite]" />
                </div>
            ))}
        </div>
    );
}

const SelectFilter = ({ label, value, options, onChange, placeholder }: {
    label: string;
    value: string;
    options: string[] | { label: string, value: string }[];
    onChange: (value: string) => void;
    placeholder: string;
}) => (
    <div className="relative">
        <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
            {label}
        </label>
        <div className="relative">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none appearance-none pr-10 transition-all"
            >
                <option value="">{placeholder}</option>
                {options.map(opt => {
                    if (typeof opt === 'string') {
                        return <option key={opt} value={opt}>{opt}</option>;
                    }
                    return <option key={opt.value} value={opt.value}>{opt.label}</option>;
                })}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
    </div>
);
