"use client";

import { useAuth } from "../../../context/AuthContext";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../lib/firebase";
import { collection, query, getDocs, orderBy, limit } from "firebase/firestore";
import { Loader2, Filter, Search, BookOpen, ChevronDown, X, Play, ArrowLeft, User, AlertTriangle, CheckCircle, XCircle, MessageSquare, Coins } from "lucide-react";
import { FormattedText } from "../../components/FormattedText";
import { CommentsSection } from "../../components/CommentsSection";
import { QuestionCard } from "../../components/QuestionCard";
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

export default function QuestionBankPage() {
    const { user, loading: authLoading, signInWithGoogle } = useAuth();
    const router = useRouter();
    const [isSigningInToSolve, setIsSigningInToSolve] = useState(false);

    const [allQuestions, setAllQuestions] = useState<QuestionBankItem[]>([]);
    const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [visibleCount, setVisibleCount] = useState(20);
    const [solveLimit, setSolveLimit] = useState(20);
    const observerTarget = useRef<HTMLDivElement>(null);
    const [filters, setFilters] = useState<FilterState>(initialFilters);
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

    const [searchQuery, setSearchQuery] = useState("");
    const [questionAttempts, setQuestionAttempts] = useState<Map<string, { isCorrect: boolean }>>(new Map());
    const [activeQuestionIdForComments, setActiveQuestionIdForComments] = useState<string | null>(null);

    // Answer tracking for vertical list
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [results, setResults] = useState<Record<string, boolean>>({});
    const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
    const [userCredits, setUserCredits] = useState(0);
    const [showFilters, setShowFilters] = useState(false);

    // Fetch User Question Attempts
    useEffect(() => {
        if (!user) return;

        const fetchAttempts = async () => {
            try {
                const attemptsRef = collection(db, "users", user.uid, "questionAttempts");
                const qAttempts = query(attemptsRef);
                const snap = await getDocs(qAttempts);
                const map = new Map<string, { isCorrect: boolean }>();
                snap.forEach(doc => {
                    const data = doc.data();
                    map.set(doc.id, { isCorrect: data.isCorrect });
                });
                setQuestionAttempts(map);
            } catch (err) {
                console.error("Error fetching question attempts:", err);
            }
        };

        fetchAttempts();
    }, [user]);

    // 1. Initial Data Fetch (One time)
    useEffect(() => {
        const fetchInitialQuestions = async () => {
            setLoading(true);
            try {
                // Fetch a large enough batch to populate filters and browse
                const q = query(collection(db, "questions"), orderBy("createdAt", "desc"), limit(2000));
                const snapshot = await getDocs(q);

                // Use a Map to ensure unique IDs from the source
                const resultsMap = new Map<string, QuestionBankItem>();
                snapshot.docs.forEach(doc => {
                    resultsMap.set(doc.id, { id: doc.id, ...doc.data() } as QuestionBankItem);
                });
                setAllQuestions(Array.from(resultsMap.values()));
            } catch (e) {
                console.error("Error fetching initial questions:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchInitialQuestions();
    }, []);

    // 2. Dynamic Filtering Logic (Facets)
    useEffect(() => {
        // Apply Global Filters to the main list
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

        // Final Filtered List for Display
        filtered = applyFilters(allQuestions, filters);

        // Natural Language Pattern Detection
        if (searchQuery.trim()) {
            const lowerQuery = searchQuery.toLowerCase().trim();

            // Detect patterns like "questões de [disciplina]" or "questoes de [disciplina]"
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
                { pattern: /quest[õo]es\s+de\s+geografia/i, discipline: "Geografia" },
                { pattern: /quest[õo]es\s+de\s+hist[óo]ria/i, discipline: "História" },
                { pattern: /quest[õo]es\s+de\s+(ingl[êe]s|l[íi]ngua\s+inglesa)/i, discipline: "Língua Inglesa" },
            ];

            // Check if query matches any discipline pattern
            let detectedDiscipline = "";
            for (const { pattern, discipline } of disciplinePatterns) {
                if (pattern.test(lowerQuery)) {
                    detectedDiscipline = discipline;
                    break;
                }
            }

            // If a discipline was detected, apply it as a filter
            if (detectedDiscipline) {
                filtered = filtered.filter(q =>
                    normalizeText(q.disciplina || "").includes(normalizeText(detectedDiscipline))
                );
            } else {
                // Standard search query (Tokens) - only if no discipline pattern detected
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

        setQuestions(filtered);

        // 3. Recalculate Facets (Dynamic Options)
        const getUniqueOptions = (key: keyof QuestionBankItem, skipKey: keyof FilterState) => {
            // To be truly "smart", when picking options for "Banca", we should consider filters applied to OTHER fields
            // but NOT the "Banca" field itself, so you can still see/pick other Bancas.
            const availableItems = applyFilters(allQuestions, filters, skipKey);
            const set = new Set<string>();
            availableItems.forEach(item => {
                const val = (item as any)[key];
                if (val) set.add(String(val));
            });

            // Unify display labels
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
                const availableItems = applyFilters(allQuestions, filters, 'tipoQuestao');
                const types = new Set<string>();
                availableItems.forEach(q => q.tipoQuestao && types.add(q.tipoQuestao));
                const res = [];
                if (types.has('multipla_escolha')) res.push({ label: "Múltipla Escolha", value: "multipla_escolha" });
                if (types.has('certo_errado')) res.push({ label: "Certo ou Errado", value: "certo_errado" });
                return res;
            })(),
        }));

        setVisibleCount(20);
    }, [allQuestions, filters, searchQuery]);

    // Infinite Scroll Logic
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && questions.length > visibleCount) {
                    setVisibleCount(prev => prev + 20);
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

    const handleFilterChange = (key: keyof FilterState, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const clearFilters = () => {
        setFilters(initialFilters);
        setSearchQuery("");
    };

    const hasActiveFilters = Object.values(filters).some(v => v !== "") || searchQuery.trim() !== "";

    const startSolving = useCallback(async () => {
        if (!user) {
            setIsSigningInToSolve(true);
            await signInWithGoogle();
            return;
        }

        // Save filtered questions to session storage so they can be picked up by the solve page
        if (questions.length > 0) {
            try {
                // Slice based on user choice
                const selectedQuestions = questions.slice(0, solveLimit);
                sessionStorage.setItem('filtered_questions', JSON.stringify(selectedQuestions));
            } catch (e) {
                console.error("Error saving questions to sessionStorage:", e);
            }
        }

        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value) params.set(key, value);
        });
        if (searchQuery) params.set('q', searchQuery);
        router.push(`/dashboard/questions/solve?${params.toString()}`);
    }, [user, questions, solveLimit, filters, searchQuery, router, signInWithGoogle]);

    useEffect(() => {
        if (user && isSigningInToSolve) {
            setIsSigningInToSolve(false);
            startSolving();
        }
    }, [user, isSigningInToSolve, startSolving]);

    if (authLoading) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            </div>
        );
    }

    const SelectFilter = ({ label, value, options, onChange, placeholder }: {
        label: string;
        value: string;
        options: (string | { label: string, value: string })[];
        onChange: (val: string) => void;
        placeholder: string;
    }) => {
        // Hide filter if there are no options available AND it's not currently active (selected)
        // We want to keep active filters visible so they can be cleared.
        if (options.length === 0 && !value) return null;

        return (
            <div className="flex flex-col gap-1.5 min-w-[180px] animate-in fade-in zoom-in duration-300">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                    {label}
                </label>
                <div className="relative group">
                    <select
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className={clsx(
                            "w-full appearance-none px-4 py-2.5 bg-white dark:bg-slate-800 border rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/20",
                            value
                                ? "border-violet-300 dark:border-violet-700 text-slate-900 dark:text-white font-medium shadow-sm"
                                : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
                        )}
                    >
                        <option value="">{placeholder}</option>
                        {options.map((opt, i) => {
                            const labelValue = typeof opt === 'string' ? opt : opt.label;
                            const dataValue = typeof opt === 'string' ? opt : opt.value;
                            return <option key={i} value={dataValue}>{labelValue}</option>
                        })}
                    </select>
                    <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none group-hover:text-slate-500 transition-colors" />
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 md:px-8 py-3 md:py-4">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 md:gap-4">
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="p-2 md:p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-xl transition shadow-sm shrink-0"
                        >
                            <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-lg md:text-xl font-black text-slate-800 dark:text-white flex items-center gap-2 truncate">
                                <BookOpen className="w-5 h-5 md:w-6 md:h-6 text-violet-500 shrink-0" />
                                <span className="truncate">Banco de Questões</span>
                            </h1>
                            <p className="text-[10px] md:text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                                {visibleCount < questions.length ? (
                                    <>Mostrando {visibleCount} de {questions.length} questões</>
                                ) : (
                                    <>{questions.length} questões encontradas</>
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-row items-center gap-2 md:gap-4">
                        <div className="hidden sm:flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 pl-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                            <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest shrink-0">Resolver:</span>
                            <select
                                value={solveLimit}
                                onChange={(e) => setSolveLimit(Number(e.target.value))}
                                className="bg-white dark:bg-slate-900 border-none rounded-xl px-4 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-violet-500/10 outline-none transition-all cursor-pointer shadow-sm"
                            >
                                {[5, 10, 20, 50, 80, 100].map(n => (
                                    <option key={n} value={n}>{n} questões</option>
                                ))}
                            </select>
                        </div>

                        {/* Mobile version of quantity selector - more compact */}
                        <div className="sm:hidden flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                            <select
                                value={solveLimit}
                                onChange={(e) => setSolveLimit(Number(e.target.value))}
                                className="bg-transparent border-none px-2 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                            >
                                {[5, 10, 20, 50, 100].map(n => (
                                    <option key={n} value={n}>{n}Q</option>
                                ))}
                            </select>
                        </div>

                        {questions.length > 0 && (
                            <button
                                onClick={startSolving}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 md:py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs md:text-sm font-black transition shadow-lg shadow-violet-500/25 active:scale-95 whitespace-nowrap"
                            >
                                <Play className="w-3 h-3 md:w-4 md:h-4 shrink-0" />
                                <span className="uppercase tracking-wide">Iniciar Quiz</span>
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
                {/* Advanced Filter Panel */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xl mb-8">
                    <div className="px-6 py-4 md:py-6 border-b border-slate-100 dark:border-slate-800 flex flex-col xs:flex-row items-start xs:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/50">
                        <div className="flex items-center gap-2">
                            <Filter className="w-5 h-5 text-violet-500" />
                            <h2 className="font-bold text-sm md:text-base text-slate-800 dark:text-white uppercase tracking-tight">Filtros Inteligentes</h2>
                        </div>
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

                    <div className="p-8 space-y-8">
                        {/* Search Bar */}
                        <div className="relative group">
                            <Search className="absolute left-5 top-4 w-5 h-5 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="Busca rápida por texto da questão, cargo ou palavras-chave..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-14 pr-6 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition-all font-medium"
                            />
                        </div>

                        {/* Dropdown Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                                label="Tipo"
                                value={filters.tipoQuestao}
                                options={dynamicOptions.tipos}
                                onChange={(v) => handleFilterChange('tipoQuestao', v)}
                                placeholder="Ambos os tipos"
                            />
                        </div>
                    </div>
                </div>

                {/* Questions Display */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-4">
                        <div className="relative">
                            <div className="w-16 h-16 border-4 border-violet-500/20 rounded-full"></div>
                            <div className="w-16 h-16 border-4 border-t-violet-500 rounded-full animate-spin absolute top-0 left-0"></div>
                        </div>
                        <p className="text-sm font-bold text-slate-500 animate-pulse uppercase tracking-widest">Filtrando Banco de Dados...</p>
                    </div>
                ) : questions.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 p-20 text-center animate-in fade-in duration-500 shadow-sm">
                        <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                            <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-2">
                            Nenhum resultado encontrado
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto font-medium leading-relaxed">
                            Não encontramos questões com esses filtros. Tente expandir sua busca ou remover alguns critérios.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {questions.slice(0, visibleCount).map((question, idx) => (
                            <div
                                key={question.id}
                                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 hover:shadow-2xl hover:shadow-violet-500/5 hover:-translate-y-0.5 transition-all duration-300 cursor-default group"
                            >
                                <div className="flex flex-wrap items-center gap-3 mb-5">
                                    <span className="px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-violet-600 text-white rounded-lg shadow-md shadow-violet-500/20">
                                        {idx + 1}
                                    </span>

                                    {question.isVerified === false && (
                                        <span className="px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white rounded-lg shadow-md shadow-amber-500/20 flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" />
                                            Pendente de Gabarito
                                        </span>
                                    )}
                                    {question.banca && (
                                        <span className="px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                                            {question.banca}
                                        </span>
                                    )}

                                    {question.ano && (
                                        <span className="px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                                            {question.ano}
                                        </span>
                                    )}
                                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block"></div>
                                    <span className="text-xs font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/10 px-2 py-1 rounded-md">
                                        {question.disciplina}
                                    </span>
                                    {/* Answer Status Badge */}
                                    {questionAttempts.has(question.id) && (
                                        <span className={clsx(
                                            "px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg shadow-sm flex items-center gap-1.5 border",
                                            questionAttempts.get(question.id)?.isCorrect
                                                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                                                : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800"
                                        )}>
                                            {questionAttempts.get(question.id)?.isCorrect ? (
                                                <>
                                                    <CheckCircle className="w-3 h-3" />
                                                    Respondida Corretamente
                                                </>
                                            ) : (
                                                <>
                                                    <XCircle className="w-3 h-3" />
                                                    Respondida Incorretamente
                                                </>
                                            )}
                                        </span>
                                    )}
                                </div>

                                <div className="flex gap-6">
                                    <div className="flex-1 space-y-4">
                                        <div className="text-slate-700 dark:text-slate-200 text-base leading-relaxed font-medium line-clamp-3">
                                            <FormattedText text={question.text} />
                                        </div>

                                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-4 border-t border-slate-50 dark:border-slate-800/20">
                                            {question.concurso && (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400"></div>
                                                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight italic">
                                                        {question.concurso}
                                                    </span>
                                                </div>
                                            )}
                                            {question.cargo && (
                                                <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-4">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                                                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-tight">
                                                        {question.cargo}
                                                    </span>
                                                </div>
                                            )}
                                            {question.supportText && (
                                                <div className="flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-800 pl-4">
                                                    <BookOpen className="w-3 h-3 text-amber-500" />
                                                    <span className="text-[11px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-tight">
                                                        Contém Texto de Apoio
                                                    </span>
                                                </div>
                                            )}

                                            {/* Owner Info */}
                                            <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-4">
                                                {question.createdByPhotoURL ? (
                                                    <img src={question.createdByPhotoURL} alt={question.createdByDisplayName} className="w-4 h-4 rounded-full" />
                                                ) : (
                                                    <div className="w-4 h-4 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-[10px] text-slate-500">
                                                        <User className="w-2.5 h-2.5" />
                                                    </div>
                                                )}
                                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight truncate max-w-[80px]">
                                                    {question.createdByDisplayName || "Anônimo"}
                                                </span>
                                            </div>

                                            {/* Comments Button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveQuestionIdForComments(question.id);
                                                }}
                                                className="flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-800 pl-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 hover:text-violet-500 dark:hover:text-violet-400 uppercase tracking-tight transition-colors group/comments"
                                            >
                                                <MessageSquare className="w-3 h-3 group-hover/comments:scale-110 transition-transform" />
                                                Comentários
                                            </button>

                                        </div>
                                    </div>

                                    {question.graphicUrl && (
                                        <div className="w-24 h-24 sm:w-32 sm:h-32 shrink-0 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 shadow-sm group-hover:border-violet-300 transition-colors">
                                            <img src={question.graphicUrl} className="w-full h-full object-cover" alt="Questão" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Infinite Scroll Sentinel */}
                        <div ref={observerTarget} className="h-10 w-full flex items-center justify-center">
                            {visibleCount < questions.length && (
                                <div className="flex items-center gap-2 text-slate-400 animate-pulse font-bold text-xs uppercase tracking-widest">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Carregando mais...
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>

            {/* Comments Modal */}
            {activeQuestionIdForComments && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
                    onClick={() => setActiveQuestionIdForComments(null)}
                >
                    <div
                        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg h-[600px] max-h-[90vh] overflow-hidden relative animate-in zoom-in-95 duration-200 ring-1 ring-white/10"
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setActiveQuestionIdForComments(null)}
                            className="absolute right-4 top-4 p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 z-10 bg-white/5 data-[hover]:bg-white/10 rounded-full transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <div className="h-full pt-2">
                            <CommentsSection questionId={activeQuestionIdForComments} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
