"use client";

import { useAuth } from "../../../context/AuthContext";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../lib/firebase";
import { collection, query, getDocs, orderBy, limit } from "firebase/firestore";
import { Loader2, Filter, Search, BookOpen, ChevronDown, X, Play, ArrowLeft } from "lucide-react";
import { FormattedText } from "../../components/FormattedText";
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
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

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

    // Auth redirect
    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/");
        }
    }, [user, authLoading, router]);

    const fetchAllDynamicOptions = useCallback(async () => {
        try {
            // Fetch a larger sample to get representative filter options
            const q = query(collection(db, "questions"), limit(500));
            const snapshot = await getDocs(q);

            const concursos = new Set<string>();
            const bancas = new Set<string>();
            const cargos = new Set<string>();
            const niveis = new Set<string>();
            const disciplinas = new Set<string>();
            const anos = new Set<string>();
            const estados = new Set<string>();
            const municipios = new Set<string>();

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.concurso) concursos.add(data.concurso);
                if (data.banca) bancas.add(data.banca);
                if (data.cargo) cargos.add(data.cargo);
                if (data.nivel) niveis.add(data.nivel);
                if (data.disciplina) disciplinas.add(data.disciplina);
                if (data.ano) anos.add(String(data.ano));
                if (data.estado) estados.add(data.estado);
                if (data.municipio) municipios.add(data.municipio);
            });

            // Helper to title case and unify options
            const unifyOptions = (set: Set<string>) => {
                const map = new Map<string, string>();
                Array.from(set).forEach(val => {
                    const norm = normalizeText(val);
                    if (!map.has(norm)) {
                        map.set(norm, val); // Keep first occurrence as display label
                    }
                });
                return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
            };

            setDynamicOptions(prev => ({
                ...prev,
                concursos: unifyOptions(concursos),
                bancas: unifyOptions(bancas),
                cargos: unifyOptions(cargos),
                niveis: Array.from(niveis).sort(), // Levels are usually short and standardized
                disciplinas: unifyOptions(disciplinas),
                anos: Array.from(anos).sort((a, b) => Number(b) - Number(a)),
                estados: unifyOptions(estados),
                municipios: unifyOptions(municipios),
            }));
        } catch (e) {
            console.error("Error fetching dynamic options:", e);
        }
    }, []);

    // Fetch dynamic options from DB on load
    useEffect(() => {
        if (!user) return;
        fetchAllDynamicOptions();
    }, [user, fetchAllDynamicOptions]);

    const fetchAndFilterQuestions = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        try {
            // We fetch a larger batch and filter on the client for "contains" flexibility
            let q = query(collection(db, "questions"), orderBy("createdAt", "desc"), limit(1000));
            const snapshot = await getDocs(q);
            let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuestionBankItem));

            // Cumulative Filtering Logic (Case/Accent Insensitive)
            if (filters.concurso) {
                const normFilter = normalizeText(filters.concurso);
                results = results.filter(q =>
                    normalizeText(q.concurso || "").includes(normFilter)
                );
            }
            if (filters.banca) {
                const normFilter = normalizeText(filters.banca);
                results = results.filter(q =>
                    normalizeText(q.banca || "").includes(normFilter)
                );
            }
            if (filters.cargo) {
                const normFilter = normalizeText(filters.cargo);
                results = results.filter(q =>
                    normalizeText(q.cargo || "").includes(normFilter)
                );
            }
            if (filters.nivel) {
                const normFilter = normalizeText(filters.nivel);
                results = results.filter(q =>
                    normalizeText(q.nivel || "").includes(normFilter)
                );
            }
            if (filters.disciplina) {
                const normFilter = normalizeText(filters.disciplina);
                results = results.filter(q =>
                    normalizeText(q.disciplina || "").includes(normFilter)
                );
            }
            if (filters.ano) {
                results = results.filter(q => String(q.ano) === filters.ano);
            }
            if (filters.estado) {
                const normFilter = normalizeText(filters.estado);
                results = results.filter(q =>
                    normalizeText(q.estado || "").includes(normFilter)
                );
            }
            if (filters.municipio) {
                const normFilter = normalizeText(filters.municipio);
                results = results.filter(q =>
                    normalizeText(q.municipio || "").includes(normFilter)
                );
            }
            if (filters.tipoQuestao) {
                results = results.filter(q => q.tipoQuestao === filters.tipoQuestao);
            }

            // Global Text Search (Case/Accent Insensitive Tokens)
            if (searchQuery.trim()) {
                const tokens = normalizeText(searchQuery).split(/\s+/).filter(Boolean);

                results = results.filter(q => {
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

            setQuestions(results);
        } catch (e) {
            console.error("Error fetching questions:", e);
        } finally {
            setLoading(false);
        }
    }, [user, filters, searchQuery]);

    // Fetch and filter questions when filters or search change
    useEffect(() => {
        fetchAndFilterQuestions();
        setVisibleCount(20);
    }, [fetchAndFilterQuestions]);

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

    const startSolving = () => {
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
    };

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
    }) => (
        <div className="flex flex-col gap-1.5 min-w-[180px]">
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
                                <span className="uppercase tracking-wide">RESOLVER</span>
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
                                        Questão {idx + 1}
                                    </span>
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
        </div>
    );
}
