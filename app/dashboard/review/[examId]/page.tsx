"use client";

import { useAuth } from "../../../../context/AuthContext";
import { useEffect, useState, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { db, storage } from "../../../../lib/firebase";
import { doc, getDoc, updateDoc, runTransaction, increment, collection, setDoc, Timestamp, arrayUnion, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { Loader2, Save, ArrowLeft, AlertTriangle, FileText, Image as ImageIcon, Upload, CheckCircle, XCircle, Trash2, ExternalLink, Plus, Book, Zap, ChevronDown, Search, Menu, X, Home, Eye, EyeOff, Check } from "lucide-react";
import { FormattedText } from "../../../components/FormattedText";
import { useAlert } from "../../../context/AlertContext";
import clsx from "clsx";

interface PageProps {
    params: Promise<{ examId: string }>;
}

interface AnswerKeyResult {
    matched: number;
    updated: number;
    total: number;
    errors: string[];
}

const BRAZILIAN_STATES = [
    { value: "AC", label: "Acre (AC)" },
    { value: "AL", label: "Alagoas (AL)" },
    { value: "AP", label: "Amapá (AP)" },
    { value: "AM", label: "Amazonas (AM)" },
    { value: "BA", label: "Bahia (BA)" },
    { value: "CE", label: "Ceará (CE)" },
    { value: "DF", label: "Distrito Federal (DF)" },
    { value: "ES", label: "Espírito Santo (ES)" },
    { value: "GO", label: "Goiás (GO)" },
    { value: "MA", label: "Maranhão (MA)" },
    { value: "MT", label: "Mato Grosso (MT)" },
    { value: "MS", label: "Mato Grosso do Sul (MS)" },
    { value: "MG", label: "Minas Gerais (MG)" },
    { value: "PA", label: "Pará (PA)" },
    { value: "PB", label: "Paraíba (PB)" },
    { value: "PR", label: "Paraná (PR)" },
    { value: "PE", label: "Pernambuco (PE)" },
    { value: "PI", label: "Piauí (PI)" },
    { value: "RJ", label: "Rio de Janeiro (RJ)" },
    { value: "RN", label: "Rio Grande do Norte (RN)" },
    { value: "RS", label: "Rio Grande do Sul (RS)" },
    { value: "RO", label: "Rondônia (RO)" },
    { value: "RR", label: "Roraima (RR)" },
    { value: "SC", label: "Santa Catarina (SC)" },
    { value: "SP", label: "São Paulo (SP)" },
    { value: "SE", label: "Sergipe (SE)" },
    { value: "TO", label: "Tocantins (TO)" }
];

const NIVEL_OPTIONS = [
    { value: "Fundamental", label: "Fundamental" },
    { value: "Médio", label: "Médio" },
    { value: "Técnico", label: "Técnico" },
    { value: "Superior", label: "Superior" }
];

const TIPO_OPTIONS = [
    { value: "multipla_escolha", label: "Múltipla Escolha" },
    { value: "certo_errado", label: "Certo ou Errado" }
];

const INITIAL_BANCAS = [
    { value: "CEBRASPE", label: "Cebraspe (Cespe)" },
    { value: "FGV", label: "FGV" },
    { value: "FCC", label: "FCC" },
    { value: "VUNESP", label: "Vunesp" },
    { value: "CESGRANRIO", label: "Cesgranrio" },
    { value: "INSTITUTO_AOCP", label: "Instituto AOCP" },
    { value: "AOCP", label: "AOCP" },
    { value: "IBFC", label: "IBFC" },
    { value: "IDIB", label: "IDIB" },
    { value: "CONSULPLAN", label: "Consulplan" },
    { value: "INSTITUTO_CONSULPLAN", label: "Instituto Consulplan" },
    { value: "QUADRIX", label: "Quadrix" },
    { value: "FUNDATEC", label: "Fundatec" },
    { value: "IBAM", label: "IBAM" },
    { value: "FUNCAB", label: "Funcab" },
    { value: "FUMARC", label: "Fumarc" },
    { value: "CETRO", label: "Cetro" },
    { value: "IADES", label: "IADES" },
    { value: "COPESE", label: "Copese" },
    { value: "NUCEPE", label: "Nucepe" },
    { value: "COMVEST", label: "Comvest" },
    { value: "FEPESE", label: "Fepese" },
    { value: "UECE", label: "UECE" },
    { value: "FUVEST", label: "Fuvest" },
    { value: "UNIFIL", label: "UniFil" },
    { value: "GUALIMP", label: "Gualimp" },
    { value: "AMEOSC", label: "Ameosc" },
    { value: "OBJETIVA", label: "Objetiva Concursos" },
    { value: "FAU", label: "FAU" },
    { value: "MS_CONCURSOS", label: "MS Concursos" },
    { value: "INSTITUTO_MAIS", label: "Instituto Mais" },
    { value: "FUNRIO", label: "Funrio" },
    { value: "COSEAC", label: "Coseac" },
    { value: "COPERVE", label: "Coperve" },
    { value: "CELETRO", label: "Celetro" },
    { value: "LEGALLE", label: "Legalle" },
    { value: "FUNDACAO_LA_SALLE", label: "Fundação La Salle" },
    { value: "ADM_TEC", label: "ADM&TEC" },
    { value: "AVANCA_SP", label: "Avança SP" },
    { value: "IGEDUC", label: "IGEDUC" },
    { value: "SELECON", label: "Selecon" },
    { value: "IDECA", label: "Ideca" },
    { value: "CPCON", label: "CPCON" },
    { value: "IBGP", label: "IBGP" },
    { value: "FUNDEP", label: "FUNDEP" },
    { value: "FADESP", label: "Fadesp" },
    { value: "FCM", label: "FCM" },
    { value: "FAFIPA", label: "Fafipa" },
    { value: "FAUEL", label: "Fauel" },
    { value: "UNIOESTE", label: "Unioeste" },
    { value: "COTUCA", label: "Cotuca" },
    { value: "COVEST", label: "Covest" },
    { value: "UFMT", label: "UFMT" },
    { value: "UFPR", label: "UFPR" },
    { value: "UFRJ", label: "UFRJ" },
    { value: "UFG", label: "UFG" },
    { value: "UFRGS", label: "UFRGS" },
    { value: "UFSC", label: "UFSC" },
    { value: "UFAM", label: "UFAM" },
    { value: "UEPA", label: "UEPA" },
    { value: "UEPB", label: "UEPB" },
    { value: "UEPG", label: "UEPG" },
    { value: "UEMA", label: "UEMA" },
    { value: "UDESC", label: "UDESC" },
    { value: "UNITINS", label: "Unitins" },
    { value: "UNICAMP", label: "Unicamp" },
    { value: "UNESP", label: "Unesp" },
    { value: "UNIFESP", label: "Unifesp" },
    { value: "UNIMONTES", label: "Unimontes" },
    { value: "UNIR", label: "UNIR" },
    { value: "IFSC", label: "IFSC" },
    { value: "IFRS", label: "IFRS" },
    { value: "IFRJ", label: "IFRJ" },
    { value: "IFPE", label: "IFPE" },
    { value: "IFPB", label: "IFPB" },
    { value: "IFPA", label: "IFPA" },
    { value: "IFMT", label: "IFMT" },
    { value: "IFMS", label: "IFMS" },
    { value: "IFMG", label: "IFMG" },
    { value: "IFMA", label: "IFMA" },
    { value: "IFGO", label: "IFGO" },
    { value: "IFES", label: "IFES" },
    { value: "IFCE", label: "IFCE" },
    { value: "IFBA", label: "IFBA" },
    { value: "IFAM", label: "IFAM" },
    { value: "IFAL", label: "IFAL" },
    { value: "IFAC", label: "IFAC" },
    { value: "IFTO", label: "IFTO" },
    { value: "IFSE", label: "IFSE" },
    { value: "IFRN", label: "IFRN" },
    { value: "IFRO", label: "IFRO" },
    { value: "IFPR", label: "IFPR" },
    { value: "IFPI", label: "IFPI" },
    { value: "IFAP", label: "IFAP" },
    { value: "IFRR", label: "IFRR" },
    { value: "COLEGIO_PEDRO_II", label: "Colégio Pedro II" },
    { value: "MPE_GO", label: "MPE-GO" },
    { value: "MPE_RS", label: "MPE-RS" },
    { value: "MPE_SC", label: "MPE-SC" },
    { value: "MPE_SP", label: "MPE-SP" },
    { value: "MPE_PR", label: "MPE-PR" },
    { value: "MPE_MG", label: "MPE-MG" },
    { value: "MPE_RJ", label: "MPE-RJ" },
    { value: "MPE_BA", label: "MPE-BA" },
    { value: "MPE_PE", label: "MPE-PE" },
    { value: "MPE_CE", label: "MPE-CE" },
    { value: "MPE_PA", label: "MPE-PA" },
    { value: "TJ_SP", label: "TJ-SP" },
    { value: "TJ_RJ", label: "TJ-RJ" },
    { value: "TJ_MG", label: "TJ-MG" },
    { value: "TJ_RS", label: "TJ-RS" },
    { value: "TJ_PR", label: "TJ-PR" },
    { value: "TJ_SC", label: "TJ-SC" },
    { value: "TJ_GO", label: "TJ-GO" },
    { value: "TJ_BA", label: "TJ-BA" },
    { value: "TJ_PE", label: "TJ-PE" },
    { value: "TJ_CE", label: "TJ-CE" },
    { value: "TJ_PA", label: "TJ-PA" },
    { value: "TJ_MA", label: "TJ-MA" },
    { value: "TJ_ES", label: "TJ-ES" },
    { value: "TJ_DF", label: "TJ-DF" },
    { value: "TRF_1", label: "TRF-1" },
    { value: "TRF_2", label: "TRF-2" },
    { value: "TRF_3", label: "TRF-3" },
    { value: "TRF_4", label: "TRF-4" },
    { value: "TRF_5", label: "TRF-5" },
    { value: "TRT_1", label: "TRT-1 (RJ)" },
    { value: "TRT_2", label: "TRT-2 (SP Capital)" },
    { value: "TRT_3", label: "TRT-3 (MG)" },
    { value: "TRT_4", label: "TRT-4 (RS)" },
    { value: "TRT_5", label: "TRT-5 (BA)" },
    { value: "TRT_6", label: "TRT-6 (PE)" },
    { value: "TRT_7", label: "TRT-7 (CE)" },
    { value: "TRT_8", label: "TRT-8 (PA/AP)" },
    { value: "TRT_9", label: "TRT-9 (PR)" },
    { value: "TRT_10", label: "TRT-10 (DF/TO)" },
    { value: "TRT_11", label: "TRT-11 (AM/RR)" },
    { value: "TRT_12", label: "TRT-12 (SC)" },
    { value: "TRT_13", label: "TRT-13 (PB)" },
    { value: "TRT_14", label: "TRT-14 (RO/AC)" },
    { value: "TRT_15", label: "TRT-15 (SP Campinas)" },
    { value: "TRT_16", label: "TRT-16 (MA)" },
    { value: "TRT_17", label: "TRT-17 (ES)" },
    { value: "TRT_18", label: "TRT-18 (GO)" },
    { value: "TRT_19", label: "TRT-19 (AL)" },
    { value: "TRT_20", label: "TRT-20 (SE)" },
    { value: "TRT_21", label: "TRT-21 (RN)" },
    { value: "TRT_22", label: "TRT-22 (PI)" },
    { value: "TRT_23", label: "TRT-23 (MT)" },
    { value: "TRT_24", label: "TRT-24 (MS)" },
    { value: "TRE_SP", label: "TRE-SP" },
    { value: "TRE_RJ", label: "TRE-RJ" },
    { value: "TRE_MG", label: "TRE-MG" },
    { value: "TRE_RS", label: "TRE-RS" },
    { value: "TRE_PR", label: "TRE-PR" },
    { value: "TRE_SC", label: "TRE-SC" },
    { value: "TRE_GO", label: "TRE-GO" },
    { value: "TRE_BA", label: "TRE-BA" },
    { value: "TRE_PE", label: "TRE-PE" },
    { value: "TRE_CE", label: "TRE-CE" },
    { value: "TRE_PA", label: "TRE-PA" },
    { value: "TRE_MA", label: "TRE-MA" },
].sort((a, b) => a.label.localeCompare(b.label));

const INITIAL_CARGOS = [
    { value: "AGENTE ADMINISTRATIVO", label: "Agente Administrativo" },
    { value: "AGENTE DE POLICIA", label: "Agente de Polícia" },
    { value: "ANALISTA", label: "Analista" },
    { value: "ANALISTA JUDICIARIO", label: "Analista Judiciário" },
    { value: "ASSISTENTE", label: "Assistente" },
    { value: "ASSISTENTE SOCIAL", label: "Assistente Social" },
    { value: "AUDITOR", label: "Auditor" },
    { value: "AUDITOR FISCAL", label: "Auditor Fiscal" },
    { value: "AUXILIAR", label: "Auxiliar" },
    { value: "BIBLIOTECARIO", label: "Bibliotecário" },
    { value: "BIOLOGO", label: "Biólogo" },
    { value: "BOMBEIRO", label: "Bombeiro" },
    { value: "CONTADOR", label: "Contador" },
    { value: "DEFENSOR PUBLICO", label: "Defensor Público" },
    { value: "DELEGADO", label: "Delegado" },
    { value: "DENTISTA", label: "Dentista" },
    { value: "DESEMBARGADOR", label: "Desembargador" },
    { value: "ECONOMISTA", label: "Economista" },
    { value: "ENFERMEIRO", label: "Enfermeiro" },
    { value: "ENGENHEIRO", label: "Engenheiro" },
    { value: "ESCREVENTE", label: "Escrevente" },
    { value: "ESCRIVAO", label: "Escrivão" },
    { value: "ESPECIALISTA", label: "Especialista" },
    { value: "FARMACEUTICO", label: "Farmacêutico" },
    { value: "FISCAL", label: "Fiscal" },
    { value: "FISIOTERAPEUTA", label: "Fisioterapeuta" },
    { value: "GUARDA MUNICIPAL", label: "Guarda Municipal" },
    { value: "INSPETOR", label: "Inspetor" },
    { value: "JUIZ", label: "Juiz" },
    { value: "MEDICO", label: "Médico" },
    { value: "MOTORISTA", label: "Motorista" },
    { value: "NUTRICIONISTA", label: "Nutricionista" },
    { value: "OFICIAL", label: "Oficial" },
    { value: "OFICIAL DE JUSTICA", label: "Oficial de Justiça" },
    { value: "ODONTOLOGO", label: "Odontólogo" },
    { value: "PERITO", label: "Perito" },
    { value: "POLICIAL", label: "Policial" },
    { value: "PROCURADOR", label: "Procurador" },
    { value: "PROFESSOR", label: "Professor" },
    { value: "PSICOLOGO", label: "Psicólogo" },
    { value: "SOLDADO", label: "Soldado" },
    { value: "TECNICO", label: "Técnico" },
    { value: "TECNICO ADMINISTRATIVO", label: "Técnico Administrativo" },
    { value: "TECNICO JUDICIARIO", label: "Técnico Judiciário" },
    { value: "TECNICO DE ENFERMAGEM", label: "Técnico de Enfermagem" },
    { value: "VETERINARIO", label: "Veterinário" },
].sort((a, b) => a.label.localeCompare(b.label));

const ANO_OPTIONS = Array.from({ length: new Date().getFullYear() - 2014 }, (_, i) => {
    const year = (2015 + i).toString();
    return { value: year, label: year };
}).reverse();

const SearchableSelect = ({ value, onChange, options, placeholder, className, showSearch = true, disabled = false, allowCustom = false }: {
    value: string;
    onChange: (val: string) => void;
    options: { value: string, label: string }[];
    placeholder: string;
    className?: string;
    showSearch?: boolean;
    disabled?: boolean;
    allowCustom?: boolean;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(search.toLowerCase()) ||
        opt.value.toLowerCase().includes(search.toLowerCase())
    );

    // FIX: Show value if not found in options (fallback to allow custom values display)
    const selectedLabel = options.find(opt => opt.value === value)?.label || value || placeholder;

    return (
        <div className={clsx("relative", className)} ref={wrapperRef}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => {
                    setIsOpen(!isOpen);
                    setSearch("");
                }}
                className={clsx(
                    "w-full bg-slate-50 dark:bg-slate-800/50 border-none rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 outline-none flex items-center justify-between group h-[30px] transition-opacity",
                    disabled && "opacity-50 cursor-not-allowed"
                )}
            >
                <span className={clsx("truncate pr-2", !value ? "text-slate-400" : "")}>{selectedLabel}</span>
                {!disabled && <ChevronDown className={clsx("w-3 h-3 shrink-0 transition-transform text-slate-400 group-hover:text-violet-500", isOpen && "rotate-180")} />}
            </button>

            {isOpen && (
                <div className="absolute z-[60] mt-1 w-full min-w-[200px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                    {showSearch && (options.length > 5 || allowCustom) && (
                        <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                                <input
                                    autoFocus
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Procurar..."
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg pl-8 pr-3 py-2 text-xs font-medium focus:ring-0 outline-none"
                                />
                            </div>
                        </div>
                    )}
                    <div className="max-h-60 overflow-y-auto scrollbar-hide py-1">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                        onChange(opt.value);
                                        setIsOpen(false);
                                    }}
                                    className={clsx(
                                        "w-full px-4 py-2 text-left text-xs transition-colors hover:bg-violet-50 dark:hover:bg-violet-900/10",
                                        value === opt.value ? "text-violet-600 dark:text-violet-400 font-bold bg-violet-50/50 dark:bg-violet-900/5" : "text-slate-600 dark:text-slate-300 font-medium"
                                    )}
                                >
                                    {opt.label}
                                </button>
                            ))
                        ) : (
                            <div className="px-4 py-3 text-[10px] text-slate-400 font-bold uppercase text-center">Nenhum resultado encontrado</div>
                        )}

                        {allowCustom && search && !filteredOptions.some(o => o.label.toLowerCase() === search.toLowerCase()) && (
                            <button
                                type="button"
                                onClick={() => {
                                    onChange(search);
                                    setIsOpen(false);
                                }}
                                className="w-full px-4 py-2 text-left text-xs font-bold text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-colors border-t border-slate-100 dark:border-slate-800"
                            >
                                + Usar "{search}"
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default function ReviewPage({ params }: PageProps) {
    const { examId } = use(params);
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { showAlert } = useAlert();
    const [exam, setExam] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [citiesCache, setCitiesCache] = useState<Record<string, { value: string, label: string }[]>>({});
    const [loadingCities, setLoadingCities] = useState<Record<string, boolean>>({});

    // Subjects Management
    const [subjects, setSubjects] = useState<string[]>([]);
    const [newSubject, setNewSubject] = useState("");
    const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
    const [subjectModalValue, setSubjectModalValue] = useState("");
    const [subjectModalTargetIdx, setSubjectModalTargetIdx] = useState<number | null>(null);

    // Graphic Upload State
    const [uploadingGraphicFor, setUploadingGraphicFor] = useState<number | null>(null);
    const [loadingImageFor, setLoadingImageFor] = useState<number | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const graphicInputRef = useRef<HTMLInputElement>(null);

    const fetchCities = async (stateCode: string) => {
        if (!stateCode || citiesCache[stateCode]) return;

        setLoadingCities(prev => ({ ...prev, [stateCode]: true }));
        try {
            const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${stateCode}/municipios`);

            if (!response.ok) {
                console.warn(`IBGE API returned ${response.status} for ${stateCode}. Skipping city fetch.`);
                return;
            }

            const data = await response.json();

            if (!Array.isArray(data)) {
                console.warn("IBGE returned non-array data:", data);
                return;
            }

            const sortedCities = data
                .map((city: any) => ({ value: city.nome, label: city.nome }))
                .sort((a: any, b: any) => a.label.localeCompare(b.label));

            setCitiesCache(prev => ({ ...prev, [stateCode]: sortedCities }));
        } catch (error) {
            // Silently handle network errors to avoid crashing the UI
            console.warn("Network error while fetching cities from IBGE:", error);
        } finally {
            setLoadingCities(prev => ({ ...prev, [stateCode]: false }));
        }
    };

    // Answer Key Upload State
    const [parsingAnswerKey, setParsingAnswerKey] = useState(false);
    const [answerKeyResult, setAnswerKeyResult] = useState<AnswerKeyResult | null>(null);
    const answerKeyInputRef = useRef<HTMLInputElement>(null);

    const [bancasOptions, setBancasOptions] = useState<{ value: string, label: string }[]>(INITIAL_BANCAS);
    const [cargosOptions, setCargosOptions] = useState<{ value: string, label: string }[]>(INITIAL_CARGOS);

    // Sync Bancas with Firestore
    useEffect(() => {
        const bancasRef = doc(db, "settings", "bancas");

        const unsubscribe = onSnapshot(bancasRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                if (data.list && Array.isArray(data.list)) {
                    // Sort alphabetically
                    const sorted = [...data.list].sort((a, b) => a.label.localeCompare(b.label));
                    setBancasOptions(sorted);
                }
            } else {
                // Determine if we should seed (only one client should do this ideally, but setDoc with merge is safe enough or just set)
                // To avoid race conditions in a real app we might want a script, but here "first come first serve" self-healing is fine.
                setDoc(bancasRef, { list: INITIAL_BANCAS })
                    .catch(err => console.error("Error seeding bancas:", err));
            }
        });

        return () => unsubscribe();
    }, []);

    // Sync Cargos with Firestore
    useEffect(() => {
        const cargosRef = doc(db, "settings", "cargos");

        const unsubscribe = onSnapshot(cargosRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                if (data.list && Array.isArray(data.list)) {
                    const sorted = [...data.list].sort((a, b) => a.label.localeCompare(b.label));
                    setCargosOptions(sorted);
                }
            } else {
                setDoc(cargosRef, { list: INITIAL_CARGOS })
                    .catch(err => console.error("Error seeding cargos:", err));
            }
        });

        return () => unsubscribe();
    }, []);

    // --- Answer Key Parsers ---
    const parseAnswerKeyTXT = (content: string): Record<number, string> => {
        const result: Record<number, string> = {};
        const patterns = [
            /(\d+)\s*[-.:)=]\s*([A-Ea-e])/g,
            /[Qq](\d+)\s*[-.:)=]?\s*([A-Ea-e])/g,
            /(\d+)\s+([A-Ea-e])(?:\s|$)/g,
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const questionNum = parseInt(match[1], 10);
                const answer = match[2].toLowerCase();
                if (!result[questionNum]) result[questionNum] = answer;
            }
        }
        return result;
    };

    const parseAnswerKeyCSV = (content: string): Record<number, string> => {
        const result: Record<number, string> = {};
        const lines = content.split(/\r?\n/).filter(line => line.trim());
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (i === 0 && /quest[aã]o|numero|question|number/i.test(line)) continue;
            const parts = line.split(/[,;\t]/).map(p => p.trim());
            if (parts.length >= 2) {
                const num = parseInt(parts[0], 10);
                const answer = parts[1].match(/[A-Ea-e]/i)?.[0]?.toLowerCase();
                if (!isNaN(num) && answer) result[num] = answer;
            }
        }
        return result;
    };

    const handleAnswerKeyUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !exam) return;
        setParsingAnswerKey(true);
        setAnswerKeyResult(null);
        try {
            const content = await file.text();
            let parsed = file.name.endsWith('.csv') ? parseAnswerKeyCSV(content) : parseAnswerKeyTXT(content);
            const questions = [...exam.extractedData.questions];
            let matched = 0;
            let updated = 0;
            const errors: string[] = [];
            Object.entries(parsed).forEach(([numStr, answer]) => {
                const idx = parseInt(numStr, 10) - 1;
                if (idx >= 0 && idx < questions.length) {
                    matched++;
                    if (questions[idx].correctAnswer?.toLowerCase() !== answer) {
                        questions[idx] = { ...questions[idx], correctAnswer: answer };
                        updated++;
                    }
                } else {
                    errors.push(`Questão ${numStr} não encontrada`);
                }
            });
            const result = { matched, updated, total: Object.keys(parsed).length, errors };
            setExam({
                ...exam,
                extractedData: {
                    ...exam.extractedData,
                    questions,
                    answerKeyResult: result
                }
            });
            setAnswerKeyResult(result);
        } catch (err: any) {
            const result = { matched: 0, updated: 0, total: 0, errors: [`Erro: ${err.message}`] };
            setAnswerKeyResult(result);
        } finally {
            setParsingAnswerKey(false);
            if (answerKeyInputRef.current) answerKeyInputRef.current.value = '';
        }
    };

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/");
        } else if (user && examId) {
            fetchExam(examId);
        }
    }, [user, authLoading, examId, router]);

    // Initialize subjects from exam data
    useEffect(() => {
        if (exam?.extractedData?.questions) {
            const initialSubjects = new Set<string>();
            if (exam.extractedData.course) initialSubjects.add(exam.extractedData.course);
            exam.extractedData.questions.forEach((q: any) => {
                if (q.disciplina) initialSubjects.add(q.disciplina);
            });
            setSubjects(Array.from(initialSubjects));
        }
    }, [exam]);

    // Prevent accidental navigation
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [hasUnsavedChanges]);

    const handleBack = () => {
        if (hasUnsavedChanges) {
            showAlert(
                "Você tem alterações não salvas. Deseja realmente sair sem salvar?",
                "warning",
                undefined,
                () => router.push("/dashboard")
            );
        } else {
            router.push("/dashboard");
        }
    };

    const addSubject = () => {
        if (newSubject.trim() && !subjects.includes(newSubject.trim())) {
            const updatedSubjects = [...subjects, newSubject.trim()];
            setSubjects(updatedSubjects);
            setNewSubject("");
            setHasUnsavedChanges(true);
        }
    };

    const confirmAddSubjectModal = () => {
        if (!subjectModalValue.trim()) return;

        const newSub = subjectModalValue.trim();
        let updatedSubjects = [...subjects];
        if (!updatedSubjects.includes(newSub)) {
            updatedSubjects = [...updatedSubjects, newSub];
            setSubjects(updatedSubjects);
        }

        if (subjectModalTargetIdx !== null) {
            updateQuestion(subjectModalTargetIdx, 'disciplina', newSub);
        }

        setSubjectModalValue("");
        setIsSubjectModalOpen(false);
        setSubjectModalTargetIdx(null);
        setHasUnsavedChanges(true);
    };

    const removeSubject = (subjectName: string) => {
        showAlert(
            `Deseja remover a disciplina "${subjectName}"? Ela será desvinculada de todas as questões desta prova.`,
            "warning",
            "Remover Disciplina",
            () => {
                // 1. Update questions
                const newQuestions = exam.extractedData.questions.map((q: any) => {
                    if (q.disciplina === subjectName) {
                        return { ...q, disciplina: "" };
                    }
                    return q;
                });

                // 2. Clear course if it's the same
                let newCourse = exam.extractedData.course;
                if (newCourse === subjectName) {
                    newCourse = "";
                }

                // 3. Update local subjects list
                setSubjects(subjects.filter(s => s !== subjectName));

                // 4. Update the main exam state
                setExam({
                    ...exam,
                    extractedData: {
                        ...exam.extractedData,
                        questions: newQuestions,
                        course: newCourse
                    }
                });

                setHasUnsavedChanges(true);
                showAlert(`Disciplina "${subjectName}" removida.`, "success");
            }
        );
    };


    const detectNivel = (text: string) => {
        const lower = text.toLowerCase();
        if (lower.includes("superior") || lower.includes("graduado") || lower.includes("analista") || lower.includes("especialista") || lower.includes("ensino superior")) return "Superior";
        if (lower.includes("técnico") || lower.includes("tecnico")) return "Técnico";
        if (lower.includes("médio") || lower.includes("medio") || lower.includes("ensino médio")) return "Médio";
        if (lower.includes("fundamental") || lower.includes("alfabetizado") || lower.includes("ensino fundamental")) return "Fundamental";
        return "";
    };

    const detectAno = (text: string) => {
        const match = text.match(/\b(201[5-9]|202[0-9])\b/);
        return match ? match[0] : "";
    };

    const detectEstado = (text: string) => {
        const lower = text.toLowerCase();
        for (const state of BRAZILIAN_STATES) {
            // Check for UF (e.g., "(SP)", " SP ", "-SP", "Estado: SP")
            const ufRegex = new RegExp(`(?:^|[\\s\\(\\-]) ${state.value} (?:$|[\\s\\)\\-])`.replace(/ /g, ""), "i");
            // Check for full name
            const name = state.label.split(" (")[0].toLowerCase();

            if (lower.includes(name) || ufRegex.test(text)) {
                return state.value;
            }
        }
        return "";
    };

    const detectDisciplina = (text: string) => {
        const lower = text.toLowerCase();
        if (lower.includes("português") || lower.includes("gramática") || lower.includes("interpretação de texto")) return "Língua Portuguesa";
        if (lower.includes("matemática") || lower.includes("cálculo") || lower.includes("aritmética")) return "Matemática";
        if (lower.includes("raciocínio lógico") || lower.includes("lógica")) return "Raciocínio Lógico-Matemático";
        if (lower.includes("informática") || lower.includes("computador") || lower.includes("internet") || lower.includes("software")) return "Informática";
        if (lower.includes("constitucional") || lower.includes("constituição")) return "Direito Constitucional";
        if (lower.includes("administrativo") || lower.includes("administração pública")) return "Direito Administrativo";
        if (lower.includes("penal") && !lower.includes("processual")) return "Direito Penal";
        if (lower.includes("processual penal")) return "Direito Processual Penal";
        if (lower.includes("civil") && !lower.includes("processual")) return "Direito Civil";
        if (lower.includes("processual civil")) return "Direito Processual Civil";
        if (lower.includes("ética")) return "Ética no Serviço Público";
        if (lower.includes("atualidades")) return "Atualidades";
        if (lower.includes("geografia")) return "Geografia";
        if (lower.includes("história")) return "História";
        if (lower.includes("inglês") || lower.includes("english")) return "Língua Inglesa";
        return "";
    };

    const detectBanca = (text: string, bancasList: { value: string, label: string }[]) => {
        const upper = text.toUpperCase();

        // Helper for similarity
        const levenshtein = (a: string, b: string): number => {
            const matrix: number[][] = [];
            for (let i = 0; i <= b.length; i++) matrix[i] = [i];
            for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
            for (let i = 1; i <= b.length; i++) {
                for (let j = 1; j <= a.length; j++) {
                    if (b.charAt(i - 1) === a.charAt(j - 1)) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    } else {
                        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
                    }
                }
            }
            return matrix[b.length][a.length];
        };

        const similarity = (a: string, b: string): number => {
            const longer = a.length > b.length ? a : b;
            const shorter = a.length > b.length ? b : a;
            if (longer.length === 0) return 1.0;
            return (longer.length - levenshtein(longer, shorter)) / longer.length;
        };

        // Check each banca in the list
        for (const banca of bancasList) {
            const bancaUpper = banca.value.toUpperCase();
            // Direct inclusion check
            if (upper.includes(bancaUpper) || bancaUpper.includes(upper.trim())) {
                return banca.value;
            }
            // Fuzzy match with 80% threshold for detection
            const sim = similarity(upper, bancaUpper);
            if (sim >= 0.8) {
                return banca.value;
            }
        }
        return "";
    };

    const detectCargo = (text: string, cargosList: { value: string, label: string }[]) => {
        const upper = text.toUpperCase();

        // Helper for similarity
        const levenshtein = (a: string, b: string): number => {
            const matrix: number[][] = [];
            for (let i = 0; i <= b.length; i++) matrix[i] = [i];
            for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
            for (let i = 1; i <= b.length; i++) {
                for (let j = 1; j <= a.length; j++) {
                    if (b.charAt(i - 1) === a.charAt(j - 1)) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    } else {
                        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
                    }
                }
            }
            return matrix[b.length][a.length];
        };

        const similarity = (a: string, b: string): number => {
            const longer = a.length > b.length ? a : b;
            const shorter = a.length > b.length ? b : a;
            if (longer.length === 0) return 1.0;
            return (longer.length - levenshtein(longer, shorter)) / longer.length;
        };

        // Check each cargo in the list
        for (const cargo of cargosList) {
            const cargoUpper = cargo.value.toUpperCase();
            // Direct inclusion check
            if (upper.includes(cargoUpper) || cargoUpper.includes(upper.trim())) {
                return cargo.value;
            }
            // Fuzzy match with 80% threshold for detection
            const sim = similarity(upper, cargoUpper);
            if (sim >= 0.8) {
                return cargo.value;
            }
        }
        return "";
    };

    const fetchExam = async (id: string) => {
        try {
            const docRef = doc(db, "exams", id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const examData = { id: docSnap.id, ...docSnap.data() } as { id: string; userId: string;[key: string]: any };

                if (user && user.uid !== examData.userId) {
                    showAlert("Acesso Negado: Apenas o autor pode editar esta prova.", "error", "Acesso Proibido");
                    router.push("/dashboard");
                    return;
                }

                // Try to detect Nivel and Ano from metadata or text
                const detectedNivel = detectNivel(examData.fileName || "") ||
                    detectNivel(examData.extractedData.title || "") ||
                    detectNivel(examData.extractedData.course || "") ||
                    examData.extractedData.metadata?.nivel || "";

                const detectedAno = detectAno(examData.fileName || "") ||
                    detectAno(examData.extractedData.title || "") ||
                    examData.extractedData.metadata?.ano ||
                    new Date().getFullYear();

                const detectedEstado = detectEstado(examData.fileName || "") ||
                    detectEstado(examData.extractedData.title || "") ||
                    examData.extractedData.metadata?.estado || "";

                // Detect Banca and Cargo from exam title/filename
                const detectedBanca = detectBanca(examData.fileName || "", bancasOptions) ||
                    detectBanca(examData.extractedData.title || "", bancasOptions) ||
                    examData.extractedData.metadata?.banca || "";

                const detectedCargo = detectCargo(examData.fileName || "", cargosOptions) ||
                    detectCargo(examData.extractedData.title || "", cargosOptions) ||
                    examData.extractedData.metadata?.cargo || "";

                // Ensure all questions have basic metadata fields
                const questions = examData.extractedData.questions.map((q: any) => {
                    // Auto-detect question type based on number of options
                    let questionType = q.tipoQuestao || examData.extractedData.metadata?.tipoQuestao;

                    // If type is not set or is empty, apply smart detection
                    if (!questionType || questionType === "") {
                        // If question has exactly 2 options, it's True/False
                        if (q.options && q.options.length === 2) {
                            questionType = "certo_errado";
                        } else {
                            // Otherwise, default to Multiple Choice
                            questionType = "multipla_escolha";
                        }
                    }

                    return {
                        ...q,
                        concurso: (q.concurso || examData.extractedData.metadata?.concurso || "").substring(0, 30),
                        banca: q.banca || detectedBanca,
                        cargo: (q.cargo || detectedCargo).substring(0, 20),
                        nivel: q.nivel || detectedNivel,
                        ano: q.ano || detectedAno,
                        tipoQuestao: questionType,
                        disciplina: q.disciplina || detectDisciplina(q.text) || examData.extractedData.course || "",
                        estado: q.estado || detectedEstado,
                        municipio: q.municipio || examData.extractedData.metadata?.municipio || "",
                        confidence: q.confidence || 1.0
                    };
                });

                // Normalize support texts (ensure they use 'text' field)
                const supportTexts = (examData.extractedData.supportTexts || []).map((st: any) => ({
                    ...st,
                    text: st.text || st.content || ""
                }));

                // Pre-fill title and description if missing
                const metadata = examData.extractedData?.metadata || {};
                const concurso = (metadata.concurso || "").substring(0, 30);
                const banca = metadata.banca || "";
                const ano = metadata.ano || detectedAno;
                const course = examData.extractedData?.course || "";

                const generatedDesc = examData.extractedData?.description ||
                    [
                        concurso,
                        banca ? `(${banca})` : null,
                        course,
                        ano
                    ].filter(Boolean).join(" - ");

                const generatedTitle = examData.extractedData?.title ||
                    (concurso ? `${concurso} - ${course}`.substring(0, 50) : (examData.fileName || "").replace(/\.[^/.]+$/, "") || "Nova Prova");

                setExam({
                    ...examData,
                    extractedData: {
                        ...examData.extractedData,
                        title: generatedTitle,
                        description: generatedDesc,
                        questions,
                        supportTexts
                    }
                });

                if (examData.extractedData.answerKeyResult) {
                    setAnswerKeyResult(examData.extractedData.answerKeyResult);
                }

                // Initial cities fetch
                const distinctStates = Array.from(new Set(questions.map((q: any) => q.estado).filter(Boolean))) as string[];
                distinctStates.forEach(st => fetchCities(st));

            } else {
                showAlert("Prova não encontrada", "error", "Erro 404");
                router.push("/dashboard");
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async () => {
        if (!exam) return;

        const questions = [...exam.extractedData.questions];
        const hasKey = !!(exam.extractedData.answerKeyResult || answerKeyResult);

        console.log("=== ANSWER KEY DETECTION ===");
        console.log("Total Questions:", questions.length);
        console.log("Has AnswerKeyResult:", !!(exam.extractedData.answerKeyResult || answerKeyResult));
        console.log("Final hasKey:", hasKey);

        const processSave = async () => {
            setSaving(true);
            try {
                let hasUploads = false;

                for (let i = 0; i < questions.length; i++) {
                    const q = questions[i];
                    if (q.pendingFile) {
                        hasUploads = true;
                        try {
                            const storageRef = ref(storage, `exam-graphics/${exam.id}/${i}_${Date.now()}`);
                            await uploadBytes(storageRef, q.pendingFile);
                            const downloadURL = await getDownloadURL(storageRef);
                            questions[i] = { ...q, graphicUrl: downloadURL, hasGraphic: true };
                            delete questions[i].pendingFile;
                        } catch (uploadErr) {
                            throw new Error(`Falha ao enviar imagem da questão ${i + 1}`);
                        }
                    }
                }

                // Ensure every question has its ID persisted in the exam document
                for (let i = 0; i < questions.length; i++) {
                    questions[i] = { ...questions[i], id: `${exam.id}_q${i}` };
                }

                await runTransaction(db, async (transaction) => {
                    const examRef = doc(db, "exams", exam.id);
                    const userRef = user ? doc(db, "users", user.uid) : null;

                    // ALL READS FIRST
                    const examDoc = await transaction.get(examRef);
                    if (!examDoc.exists()) throw new Error("Prova não encontrada.");

                    let userDoc = null;
                    if (userRef) {
                        userDoc = await transaction.get(userRef);
                    }

                    const examDataDb = examDoc.data();
                    const alreadyAwarded = examDataDb.creditsAwarded || false;
                    const shouldAward = hasKey && !alreadyAwarded;

                    console.log("=== CREDITS AWARD LOGIC ===");
                    console.log("Already Awarded:", alreadyAwarded);
                    console.log("Should Award:", shouldAward);
                    console.log("User Doc Exists:", userDoc?.exists());
                    console.log("User UID:", user?.uid);

                    // ALL WRITES SECOND

                    // Update Main Exam
                    transaction.update(examRef, {
                        extractedData: { ...exam.extractedData, questions, answerKeyResult: answerKeyResult || exam.extractedData.answerKeyResult || null },
                        status: "ready",
                        creditsAwarded: alreadyAwarded || !!shouldAward
                    });

                    // Build Support Text Map
                    const questionSupportMap: Record<number, string> = {};
                    if (exam.extractedData.supportTexts) {
                        exam.extractedData.supportTexts.forEach((st: any) => {
                            const rangeStr = st.associatedQuestions || "";
                            const parts = rangeStr.split(/[,;]/);
                            parts.forEach((part: string) => {
                                const range = part.trim().split("-");
                                if (range.length === 2) {
                                    const start = parseInt(range[0]);
                                    const end = parseInt(range[1]);
                                    if (!isNaN(start) && !isNaN(end)) {
                                        for (let n = start; n <= end; n++) {
                                            questionSupportMap[n] = st.text || st.content || "";
                                        }
                                    }
                                } else if (range.length === 1) {
                                    const n = parseInt(range[0]);
                                    if (!isNaN(n)) {
                                        questionSupportMap[n] = st.text || st.content || "";
                                    }
                                }
                            });
                        });
                    }

                    // Update individual questions for Question Bank
                    for (let i = 0; i < questions.length; i++) {
                        const q = questions[i];
                        const questionRef = doc(db, "questions", `${exam.id}_q${i}`);

                        // Auto-detect question type on save as well
                        let questionType = q.tipoQuestao;
                        if (!questionType || questionType === "") {
                            // If question has exactly 2 options, it's True/False
                            if (q.options && q.options.length === 2) {
                                questionType = "certo_errado";
                            } else {
                                // Otherwise, default to Multiple Choice
                                questionType = "multipla_escolha";
                            }
                        }

                        transaction.set(questionRef, {
                            text: q.text,
                            options: q.options || [],
                            correctAnswer: q.correctAnswer || null,
                            graphicUrl: q.graphicUrl || null,
                            hasGraphic: q.hasGraphic || false,
                            supportText: questionSupportMap[i + 1] || null,
                            examId: exam.id,
                            examTitle: exam.extractedData.title || exam.fileName,
                            questionIndex: i,
                            concurso: q.concurso || "",
                            banca: q.banca || "",
                            cargo: q.cargo || "",
                            nivel: q.nivel || "",
                            disciplina: q.disciplina || "",
                            ano: Number(q.ano) || new Date().getFullYear(),
                            estado: q.estado || "",
                            municipio: q.municipio || "",
                            tipoQuestao: questionType,
                            createdAt: Timestamp.now(),
                            isVerified: !!hasKey,
                            createdBy: user!.uid,
                            createdByDisplayName: user!.displayName || "Anônimo",
                            createdByPhotoURL: user!.photoURL || null
                        });
                    }

                    // Cleanup extra questions if any were deleted
                    const oldCount = examDataDb.extractedData?.questions?.length || 0;
                    const newCount = questions.length;
                    if (oldCount > newCount) {
                        for (let i = newCount; i < oldCount; i++) {
                            const questionRef = doc(db, "questions", `${exam.id}_q${i}`);
                            transaction.delete(questionRef);
                        }
                    }

                    // Award Credits
                    if (shouldAward && userRef && userDoc?.exists()) {
                        console.log("✅ AWARDING 75 CREDITS TO USER:", user?.uid);
                        transaction.update(userRef, { credits: increment(75) });
                    } else if (shouldAward && (!userRef || !userDoc?.exists())) {
                        console.error("❌ CANNOT AWARD: User document does not exist");
                    } else if (!shouldAward && alreadyAwarded) {
                        console.log("ℹ️ CREDITS ALREADY AWARDED PREVIOUSLY");
                    } else {
                        console.log("ℹ️ NO AWARD: hasKey =", hasKey, "alreadyAwarded =", alreadyAwarded);
                    }
                });

                if (hasKey && !exam.creditsAwarded) {
                    showAlert("Prova salva com sucesso! Você recebeu +75 créditos! 🎉", "success");
                } else {
                    showAlert("Prova salva e Banco de Questões atualizado!", "success");
                }

                router.push(`/dashboard/solve/${exam.id}`);
                setHasUnsavedChanges(false);
            } catch (e: any) {
                console.error(e);
                showAlert("Falha ao salvar: " + e.message, "error");
            } finally {
                setSaving(false);
            }
        };

        // Warning if no answer key, wait for confirmation
        if (!hasKey) {
            showAlert(
                "Sua prova será salva, mas os 75 créditos de revisão só serão liberados quando você importar o gabarito oficial ou preencher pelo menos 40% das respostas corretas.",
                "warning",
                "Gabarito Pendente",
                processSave // Proceed only after OK
            );
        } else {
            processSave();
        }
    };

    const updateQuestion = (index: number, field: string, value: any) => {
        const newQuestions = [...exam.extractedData.questions];

        // Fields that should be synced across all questions automatically
        const syncFields = ['concurso', 'banca', 'cargo', 'nivel', 'ano', 'estado', 'municipio'];

        if (syncFields.includes(field)) {
            const finalValue = (field === 'concurso' || field === 'cargo') ? String(value).substring(0, 30) : value;
            // Update the field for ALL questions
            for (let i = 0; i < newQuestions.length; i++) {
                const oldState = newQuestions[i].estado;
                newQuestions[i] = { ...newQuestions[i], [field]: finalValue };
                // Reset city if state changes
                if (field === 'estado' && oldState !== finalValue) {
                    newQuestions[i].municipio = "";
                }
            }
            if (field === 'estado' && finalValue) {
                fetchCities(String(finalValue));
            }
        } else {
            // Standard individual update
            const oldState = newQuestions[index].estado;
            newQuestions[index] = { ...newQuestions[index], [field]: value };
            if (field === 'estado' && oldState !== value) {
                newQuestions[index].municipio = "";
                if (value) fetchCities(String(value));
            }
        }

        setExam({
            ...exam,
            extractedData: { ...exam.extractedData, questions: newQuestions }
        });
        setHasUnsavedChanges(true);
    };

    const updateSupportText = (index: number, field: string, value: any) => {
        if (!exam) return;
        const newSupportTexts = [...(exam.extractedData.supportTexts || [])];
        newSupportTexts[index] = { ...newSupportTexts[index], [field]: value };
        setExam({
            ...exam,
            extractedData: { ...exam.extractedData, supportTexts: newSupportTexts }
        });
        setHasUnsavedChanges(true);
    };

    const updateTitle = (value: string) => {
        if (!exam) return;
        setExam({
            ...exam,
            extractedData: { ...exam.extractedData, title: value }
        });
        setHasUnsavedChanges(true);
    };

    const updateDescription = (value: string) => {
        if (!exam) return;
        setExam({
            ...exam,
            extractedData: { ...exam.extractedData, description: value }
        });
        setHasUnsavedChanges(true);
    };

    const triggerGraphicUpload = (index: number) => {
        setUploadingGraphicFor(index);
        graphicInputRef.current?.click();
    };

    const handleGraphicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || uploadingGraphicFor === null || !exam) return;

        const idx = uploadingGraphicFor;
        setLoadingImageFor(idx);

        const reader = new FileReader();
        reader.onload = (event) => {
            const previewUrl = event.target?.result as string;

            const newQuestions = [...exam.extractedData.questions];
            newQuestions[idx] = {
                ...newQuestions[idx],
                graphicUrl: previewUrl,
                hasGraphic: true,
                pendingFile: file
            };

            setExam({
                ...exam,
                extractedData: { ...exam.extractedData, questions: newQuestions }
            });

            setLoadingImageFor(null);
            setUploadingGraphicFor(null);
            if (graphicInputRef.current) graphicInputRef.current.value = "";
            setHasUnsavedChanges(true);
        };
        reader.readAsDataURL(file);
    };

    const removeGraphic = (index: number) => {
        showAlert(
            "Tem certeza que deseja remover esta imagem da questão?",
            "warning",
            "Remover Imagem",
            () => {
                const newQuestions = [...exam.extractedData.questions];
                newQuestions[index] = {
                    ...newQuestions[index],
                    graphicUrl: null,
                    hasGraphic: false
                };
                delete newQuestions[index].pendingFile;

                setExam({
                    ...exam,
                    extractedData: {
                        ...exam.extractedData,
                        questions: newQuestions
                    }
                });

                setHasUnsavedChanges(true);
                showAlert("Imagem removida com sucesso.", "success");
            }
        );
    };

    const deleteQuestion = (index: number) => {
        showAlert(
            "Tem certeza que deseja deletar esta questão? Esta ação não pode ser desfeita após salvar.",
            "warning",
            "Deletar Questão",
            () => {
                const newQuestions = [...exam.extractedData.questions];
                newQuestions.splice(index, 1);
                setExam({
                    ...exam,
                    extractedData: { ...exam.extractedData, questions: newQuestions }
                });
                showAlert("Questão removida da lista.", "success");
            }
        );
    };

    if (authLoading || loading) return <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950"><Loader2 className="animate-spin text-violet-500 w-10 h-10" /></div>;
    if (!exam) return null;

    return (
        <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden transition-colors">
            {/* Header */}
            <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 md:px-6 z-[40] shrink-0">
                <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg lg:hidden text-slate-500"
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                    <button onClick={handleBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition text-slate-500">
                        <Home className="w-5 h-5" />
                    </button>
                    <div className="min-w-0">
                        <h1 className="font-bold text-slate-800 dark:text-white leading-none text-sm md:text-base truncate">Revisão de Prova</h1>
                        <p className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 mt-1 truncate max-w-[150px] md:max-w-[300px]">{exam.extractedData?.title || exam.fileName}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 md:gap-3">
                    <button
                        onClick={() => setShowPreview(!showPreview)}
                        className={clsx(
                            "flex items-center gap-2 px-3 py-2 md:py-2.5 rounded-xl text-xs md:font-bold transition shadow-lg active:scale-95",
                            showPreview
                                ? "bg-amber-100 text-amber-700 hover:bg-amber-200 shadow-amber-500/10"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 shadow-slate-500/10"
                        )}
                        title={showPreview ? "Desativar Visualização" : "Ativar Visualização"}
                    >
                        {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        <span className="hidden xs:inline">{showPreview ? "EDITAR TEXTO" : "VISUALIZAR"}</span>
                    </button>
                    <button
                        onClick={handleUpdate}
                        disabled={saving}
                        className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-3 md:px-5 py-2 md:py-2.5 rounded-xl text-xs md:font-bold transition disabled:opacity-50 shadow-lg shadow-violet-500/20 active:scale-95"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span className="hidden xs:inline">SALVAR E FINALIZAR</span>
                        <span className="xs:hidden">SALVAR</span>
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden relative">
                {/* Sidebar Backdrop (Mobile) */}
                {isSidebarOpen && (
                    <div
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[50] lg:hidden animate-in fade-in duration-300"
                        onClick={() => setIsSidebarOpen(false)}
                    />
                )}

                {/* Left Panel: Global Config (Responsive Sidebar) */}
                <aside className={clsx(
                    "fixed inset-y-0 left-0 w-[300px] md:w-[380px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-6 overflow-y-auto z-[60] lg:relative lg:translate-x-0 transition-transform duration-300 ease-in-out scrollbar-hide",
                    isSidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
                )}>
                    {/* Mobile Close Button */}
                    <button
                        onClick={() => setIsSidebarOpen(false)}
                        className="absolute top-4 right-4 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg lg:hidden text-slate-400"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    {/* Answer Key Upload */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-slate-800 dark:text-white">
                            <Upload className="w-5 h-5 text-violet-500" />
                            <h2 className="font-bold uppercase text-xs tracking-widest">Importar Gabarito</h2>
                        </div>
                        {(() => {
                            const hasKeyUI = !!(exam.extractedData.answerKeyResult || answerKeyResult);

                            if (!hasKeyUI && !parsingAnswerKey) {
                                return (
                                    <div className="flex items-center gap-2 p-2 px-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-xl text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-tighter animate-pulse">
                                        <AlertTriangle className="w-3 h-3" />
                                        Gabarito Pendente
                                    </div>
                                );
                            } else if (hasKeyUI && !parsingAnswerKey) {
                                return (
                                    <div className="flex items-center gap-2 p-2 px-3 bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 rounded-xl text-[10px] font-black text-green-600 dark:text-green-500 uppercase tracking-tighter">
                                        <Check className="w-3 h-3" />
                                        Gabarito Identificado
                                    </div>
                                );
                            }
                            return null;
                        })()}
                        <div
                            onClick={() => answerKeyInputRef.current?.click()}
                            className={clsx(
                                "group relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all",
                                !answerKeyResult ? "border-amber-200 bg-amber-50/30 dark:border-amber-900/40 hover:border-violet-500" : "border-slate-200 dark:border-slate-700 hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/10"
                            )}
                        >
                            <input
                                ref={answerKeyInputRef}
                                type="file"
                                accept=".txt,.csv"
                                onChange={handleAnswerKeyUpload}
                                className="hidden"
                            />
                            {parsingAnswerKey ? (
                                <Loader2 className="w-6 h-6 text-violet-500 mx-auto animate-spin" />
                            ) : (
                                <>
                                    <div className={clsx(
                                        "w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3 transition-transform group-hover:scale-110",
                                        !answerKeyResult ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-500" : "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
                                    )}>
                                        <Plus className="w-5 h-5" />
                                    </div>
                                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                        {answerKeyResult ? "Trocar Gabarito" : "Carregar Gabarito"}
                                    </p>
                                    <p className="text-[10px] text-slate-400 mt-1 uppercase font-black">Padrão: 1-A, 1:B, 1.C</p>
                                </>
                            )}
                        </div>

                        {answerKeyResult && (
                            <div className={clsx(
                                "p-3 rounded-xl border text-[11px] font-medium leading-relaxed",
                                answerKeyResult.updated > 0 ? "bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-900/10 dark:border-emerald-900/30 dark:text-emerald-400" : "bg-slate-50 border-slate-100 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400"
                            )}>
                                <div className="flex items-center gap-2 mb-1.5 font-bold uppercase tracking-tighter">
                                    {answerKeyResult.updated > 0 ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                                    {answerKeyResult.updated > 0 ? "Gabarito Aplicado!" : "Você enviou um gabarito de correção."}
                                </div>
                                <p>• Encontrado: {answerKeyResult.total}</p>
                                <p>• Vinculado: {answerKeyResult.matched}</p>
                                <p className="font-bold underline decoration-emerald-500/30">• Foi necessário correção: {answerKeyResult.updated}</p>
                                {answerKeyResult.errors.length > 0 && <p className="text-red-500 mt-1 font-bold">⚠ {answerKeyResult.errors[0]}</p>}
                            </div>
                        )}
                    </div>

                    {/* Subjects Manager */}
                    <div className="space-y-4 pt-8 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2 text-slate-800 dark:text-white">
                            <Book className="w-5 h-5 text-violet-500" />
                            <h2 className="font-bold uppercase text-xs tracking-widest">Disciplinas da Prova</h2>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newSubject}
                                onChange={(e) => setNewSubject(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addSubject()}
                                placeholder="Ex: Português..."
                                className="flex-1 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-violet-500/20 transition-all outline-none"
                            />
                            <button onClick={addSubject} className="p-2 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition">
                                <Plus className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {subjects.map((s, i) => (
                                <span key={i} className="px-3 py-1.5 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-lg text-xs font-bold border border-violet-100 dark:border-violet-900/30 flex items-center gap-2 group">
                                    {s}
                                    <button onClick={() => removeSubject(s)} className="hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <XCircle className="w-3.5 h-3.5" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="pt-8 border-t border-slate-100 dark:border-slate-800">
                        <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/50 rounded-2xl">
                            <h4 className="text-amber-800 dark:text-amber-400 font-bold text-xs flex items-center gap-2 mb-2">
                                <AlertTriangle className="w-4 h-4" />
                                AJUDA RÁPIDA
                            </h4>
                            <p className="text-[11px] text-amber-700 dark:text-amber-500 leading-relaxed font-medium">
                                Vincule cada questão a uma disciplina da lista ao lado. Os dados da prova (Banca, Cargo, Concurso, etc) são **sincronizados automaticamente** em todas as questões ao serem editados.
                            </p>
                        </div>
                    </div>
                </aside>

                {/* Main Editor */}
                <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 md:p-8 scrollbar-hide pb-32">
                    <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">
                        {/* Exam Header Info */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 md:p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400 px-1">Título da Prova</label>
                                <input
                                    type="text"
                                    value={exam.extractedData?.title || ""}
                                    onChange={(e) => updateTitle(e.target.value)}
                                    placeholder="Ex: PMMG - Soldado 2024"
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl md:rounded-2xl px-4 md:px-6 py-3 md:py-4 text-sm md:text-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500/20 transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Descrição / Observações</label>
                                <textarea
                                    value={exam.extractedData?.description || ""}
                                    onChange={(e) => updateDescription(e.target.value)}
                                    placeholder="Adicione detalhes sobre a prova, banca ou requisitos..."
                                    className="w-full min-h-[100px] bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl md:rounded-2xl px-4 md:px-6 py-3 md:py-4 text-xs md:text-sm font-medium text-slate-600 dark:text-slate-300 outline-none focus:ring-2 focus:ring-violet-500/20 transition-all resize-none"
                                />
                            </div>
                        </div>

                        {/* Support Texts Section */}
                        {exam.extractedData?.supportTexts && exam.extractedData.supportTexts.length > 0 && (
                            <div className="space-y-6 mb-12">
                                <div className="flex items-center gap-2 mb-4">
                                    <FileText className="w-5 h-5 text-violet-500" />
                                    <h2 className="font-black text-slate-800 dark:text-white uppercase tracking-wider text-sm">Textos de Apoio</h2>
                                </div>
                                {exam.extractedData.supportTexts.map((st: any, idx: number) => (
                                    <div key={idx} className="bg-amber-50/50 dark:bg-amber-900/5 border border-amber-100 dark:border-amber-900/20 rounded-3xl p-6 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase bg-amber-200 dark:bg-amber-900/40 text-amber-800 dark:text-amber-400 px-3 py-1 rounded-full">
                                                Texto de Apoio #{idx + 1}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <label className="text-[10px] font-black uppercase text-amber-600/60 dark:text-amber-500/40">Questões:</label>
                                                <input
                                                    type="text"
                                                    value={st.associatedQuestions || ""}
                                                    onChange={(e) => updateSupportText(idx, 'associatedQuestions', e.target.value)}
                                                    placeholder="ex: 1-5"
                                                    className="w-20 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/30 rounded-lg px-2 py-1 text-xs font-bold text-amber-900 dark:text-amber-200 outline-none focus:ring-2 focus:ring-amber-500/20"
                                                />
                                            </div>
                                        </div>
                                        {showPreview ? (
                                            <div className="w-full min-h-[100px] text-slate-700 dark:text-slate-300 text-sm leading-relaxed font-medium">
                                                <FormattedText text={st.text} />
                                            </div>
                                        ) : (
                                            <textarea
                                                value={st.text}
                                                onChange={(e) => updateSupportText(idx, 'text', e.target.value)}
                                                className="w-full min-h-[100px] bg-transparent border-none p-0 text-slate-700 dark:text-slate-300 text-sm leading-relaxed font-medium focus:ring-0 placeholder:text-slate-300 resize-y"
                                                placeholder="Conteúdo do texto de apoio..."
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center gap-2 mb-4">
                            <Book className="w-5 h-5 text-violet-500" />
                            <h2 className="font-black text-slate-800 dark:text-white uppercase tracking-wider text-sm">Questões Extraídas</h2>
                        </div>

                        {exam.extractedData?.questions?.map((q: any, idx: number) => (
                            <div key={idx} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-visible group hover:border-violet-300 dark:hover:border-violet-700 transition-all duration-300">
                                {/* Question Header */}
                                <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between rounded-t-3xl">
                                    <div className="flex items-center gap-3">
                                        <span className="w-8 h-8 flex items-center justify-center bg-violet-600 text-white rounded-xl text-xs font-black">
                                            Q{idx + 1}
                                        </span>
                                        <SearchableSelect
                                            value={q.disciplina || ""}
                                            onChange={(v) => {
                                                if (v === 'custom') {
                                                    setSubjectModalTargetIdx(idx);
                                                    setIsSubjectModalOpen(true);
                                                } else {
                                                    updateQuestion(idx, 'disciplina', v);
                                                }
                                            }}
                                            options={[
                                                ...subjects.map(s => ({ value: s, label: s })),
                                                { value: 'custom', label: '+ Adicionar Outra' }
                                            ]}
                                            placeholder="Selecione a Disciplina"
                                            className="w-[150px] sm:w-[250px]"
                                        />
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {q.graphicUrl && (
                                            <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                                                <img src={q.graphicUrl} className="w-full h-full object-cover" alt="Thumb" />
                                            </div>
                                        )}
                                        <button
                                            onClick={() => triggerGraphicUpload(idx)}
                                            disabled={loadingImageFor === idx}
                                            className={clsx(
                                                "p-2 rounded-lg transition",
                                                q.hasGraphic ? "text-violet-600 bg-violet-50" : "text-slate-400 hover:text-violet-500 hover:bg-violet-50"
                                            )}
                                        >
                                            {loadingImageFor === idx ? (
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                            ) : (
                                                <ImageIcon className="w-5 h-5" />
                                            )}
                                        </button>

                                        <button
                                            onClick={() => deleteQuestion(idx)}
                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition ml-1"
                                            title="Deletar Questão"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>

                                <div className="p-8 space-y-6">
                                    {/* Content Editor */}
                                    {showPreview ? (
                                        <div className="w-full min-h-[120px] text-slate-800 dark:text-slate-200 text-base leading-relaxed font-medium">
                                            <FormattedText text={q.text} />
                                        </div>
                                    ) : (
                                        <textarea
                                            value={q.text}
                                            onChange={(e) => updateQuestion(idx, 'text', e.target.value)}
                                            className="w-full min-h-[120px] bg-transparent border-none p-0 text-slate-800 dark:text-slate-200 text-base leading-relaxed font-medium focus:ring-0 placeholder:text-slate-300 resize-y"
                                            placeholder="Texto da questão..."
                                            onInput={(e) => {
                                                const target = e.target as HTMLTextAreaElement;
                                                target.style.height = 'auto';
                                                target.style.height = target.scrollHeight + 'px';
                                            }}
                                        />
                                    )}

                                    {/* Image Preview if exists */}
                                    {q.graphicUrl && (
                                        <div className="relative inline-block mt-2">
                                            <img src={q.graphicUrl} className="max-h-[300px] rounded-2xl border-4 border-slate-100 dark:border-slate-800 shadow-lg" alt="Preview" />
                                            <button onClick={() => removeGraphic(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white p-1.5 rounded-full shadow-lg hover:bg-red-600 transition">
                                                <XCircle className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}

                                    {/* Options Editor */}
                                    <div className="grid grid-cols-1 gap-3 pt-4 border-t border-slate-50 dark:border-slate-800/50">
                                        {q.options?.map((opt: string, optIdx: number) => {
                                            const letter = String.fromCharCode(97 + optIdx);
                                            const isCorrect = q.correctAnswer?.toLowerCase() === letter;
                                            return (
                                                <div key={optIdx} className={clsx(
                                                    "flex items-center gap-4 p-3 rounded-2xl border transition-all duration-300",
                                                    isCorrect ? "bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800" : "border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700"
                                                )}>
                                                    <button
                                                        onClick={() => updateQuestion(idx, 'correctAnswer', letter)}
                                                        className={clsx(
                                                            "w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black transition-all",
                                                            isCorrect ? "bg-green-500 text-white shadow-lg shadow-green-500/20 scale-110" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                                                        )}
                                                    >
                                                        {letter.toUpperCase()}
                                                    </button>
                                                    {showPreview ? (
                                                        <div className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300 min-h-[24px]">
                                                            <FormattedText text={opt} />
                                                        </div>
                                                    ) : (
                                                        <textarea
                                                            value={opt}
                                                            onChange={(e) => {
                                                                const o = [...q.options];
                                                                o[optIdx] = e.target.value;
                                                                updateQuestion(idx, 'options', o);
                                                            }}
                                                            rows={1}
                                                            className="flex-1 bg-transparent border-none text-sm font-medium text-slate-700 dark:text-slate-300 focus:ring-0 p-0 resize-y min-h-[24px]"
                                                            onInput={(e) => {
                                                                const target = e.target as HTMLTextAreaElement;
                                                                target.style.height = 'auto';
                                                                target.style.height = target.scrollHeight + 'px';
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Question Metadata Form */}
                                    <div className="pt-6 mt-6 border-t border-slate-50 dark:border-slate-800/50">
                                        {/* Responsive Grid for Question Metadata */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black uppercase tracking-tighter text-slate-400 px-1">Concurso / Órgão</label>
                                                <input
                                                    type="text"
                                                    value={q.concurso || ""}
                                                    maxLength={30}
                                                    onChange={(e) => updateQuestion(idx, 'concurso', e.target.value)}
                                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border-none rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-200 outline-none focus:ring-1 focus:ring-violet-500/30 transition-all"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black uppercase tracking-tighter text-slate-400 px-1">Banca Examinadora</label>
                                                <SearchableSelect
                                                    value={q.banca || ""}
                                                    onChange={(v) => {
                                                        // Enforce 20 character limit
                                                        const trimmedValue = v.slice(0, 20);
                                                        const upperValue = trimmedValue.toUpperCase();

                                                        // Helper function: Levenshtein distance for similarity
                                                        const levenshtein = (a: string, b: string): number => {
                                                            const matrix: number[][] = [];
                                                            for (let i = 0; i <= b.length; i++) {
                                                                matrix[i] = [i];
                                                            }
                                                            for (let j = 0; j <= a.length; j++) {
                                                                matrix[0][j] = j;
                                                            }
                                                            for (let i = 1; i <= b.length; i++) {
                                                                for (let j = 1; j <= a.length; j++) {
                                                                    if (b.charAt(i - 1) === a.charAt(j - 1)) {
                                                                        matrix[i][j] = matrix[i - 1][j - 1];
                                                                    } else {
                                                                        matrix[i][j] = Math.min(
                                                                            matrix[i - 1][j - 1] + 1,
                                                                            matrix[i][j - 1] + 1,
                                                                            matrix[i - 1][j] + 1
                                                                        );
                                                                    }
                                                                }
                                                            }
                                                            return matrix[b.length][a.length];
                                                        };

                                                        const similarity = (a: string, b: string): number => {
                                                            const longer = a.length > b.length ? a : b;
                                                            const shorter = a.length > b.length ? b : a;
                                                            if (longer.length === 0) return 1.0;
                                                            return (longer.length - levenshtein(longer, shorter)) / longer.length;
                                                        };

                                                        // Check for exact match or high similarity (70%+)
                                                        let finalValue = upperValue;
                                                        let foundSimilar = false;

                                                        for (const opt of bancasOptions) {
                                                            const optUpper = opt.value.toUpperCase();
                                                            if (optUpper === upperValue) {
                                                                // Exact match
                                                                finalValue = opt.value;
                                                                foundSimilar = true;
                                                                break;
                                                            }
                                                            const sim = similarity(upperValue, optUpper);
                                                            if (sim >= 0.7) {
                                                                // 70%+ similar - force use of existing
                                                                finalValue = opt.value;
                                                                foundSimilar = true;
                                                                break;
                                                            }
                                                        }

                                                        updateQuestion(idx, 'banca', finalValue);

                                                        // Only add to Firestore if it's truly new and valid
                                                        if (!foundSimilar && finalValue.trim().length > 2) {
                                                            const newValue = { value: finalValue, label: finalValue };
                                                            const bancasRef = doc(db, "settings", "bancas");
                                                            updateDoc(bancasRef, {
                                                                list: arrayUnion(newValue)
                                                            }).catch(console.error);
                                                        }
                                                    }}
                                                    options={bancasOptions}
                                                    placeholder="Selecione ou digite"
                                                    allowCustom={true}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black uppercase tracking-tighter text-slate-400 px-1">Cargo / Função</label>
                                                <SearchableSelect
                                                    value={q.cargo || ""}
                                                    onChange={(v) => {
                                                        // Enforce 20 character limit
                                                        const trimmedValue = v.slice(0, 20);
                                                        const upperValue = trimmedValue.toUpperCase();

                                                        // Helper function: Levenshtein distance for similarity
                                                        const levenshtein = (a: string, b: string): number => {
                                                            const matrix: number[][] = [];
                                                            for (let i = 0; i <= b.length; i++) {
                                                                matrix[i] = [i];
                                                            }
                                                            for (let j = 0; j <= a.length; j++) {
                                                                matrix[0][j] = j;
                                                            }
                                                            for (let i = 1; i <= b.length; i++) {
                                                                for (let j = 1; j <= a.length; j++) {
                                                                    if (b.charAt(i - 1) === a.charAt(j - 1)) {
                                                                        matrix[i][j] = matrix[i - 1][j - 1];
                                                                    } else {
                                                                        matrix[i][j] = Math.min(
                                                                            matrix[i - 1][j - 1] + 1,
                                                                            matrix[i][j - 1] + 1,
                                                                            matrix[i - 1][j] + 1
                                                                        );
                                                                    }
                                                                }
                                                            }
                                                            return matrix[b.length][a.length];
                                                        };

                                                        const similarity = (a: string, b: string): number => {
                                                            const longer = a.length > b.length ? a : b;
                                                            const shorter = a.length > b.length ? b : a;
                                                            if (longer.length === 0) return 1.0;
                                                            return (longer.length - levenshtein(longer, shorter)) / longer.length;
                                                        };

                                                        // Check for exact match or high similarity (70%+)
                                                        let finalValue = upperValue;
                                                        let foundSimilar = false;

                                                        for (const opt of cargosOptions) {
                                                            const optUpper = opt.value.toUpperCase();
                                                            if (optUpper === upperValue) {
                                                                // Exact match
                                                                finalValue = opt.value;
                                                                foundSimilar = true;
                                                                break;
                                                            }
                                                            const sim = similarity(upperValue, optUpper);
                                                            if (sim >= 0.7) {
                                                                // 70%+ similar - force use of existing
                                                                finalValue = opt.value;
                                                                foundSimilar = true;
                                                                break;
                                                            }
                                                        }

                                                        updateQuestion(idx, 'cargo', finalValue);

                                                        // Only add to Firestore if it's truly new and valid
                                                        if (!foundSimilar && finalValue.trim().length > 2) {
                                                            const newValue = { value: finalValue, label: finalValue };
                                                            const cargosRef = doc(db, "settings", "cargos");
                                                            updateDoc(cargosRef, {
                                                                list: arrayUnion(newValue)
                                                            }).catch(console.error);
                                                        }
                                                    }}
                                                    options={cargosOptions}
                                                    placeholder="Selecione ou digite"
                                                    allowCustom={true}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black uppercase tracking-tighter text-slate-400 px-1">Nível</label>
                                                <SearchableSelect
                                                    value={q.nivel || ""}
                                                    onChange={(v) => updateQuestion(idx, 'nivel', v)}
                                                    options={NIVEL_OPTIONS}
                                                    placeholder="Selecione"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black uppercase tracking-tighter text-slate-400 px-1">Ano</label>
                                                <SearchableSelect
                                                    value={q.ano?.toString() || ""}
                                                    onChange={(v) => updateQuestion(idx, 'ano', v)}
                                                    options={ANO_OPTIONS}
                                                    placeholder="Ano"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black uppercase tracking-tighter text-slate-400 px-1">Tipo da Questão</label>
                                                <SearchableSelect
                                                    value={q.tipoQuestao || ""}
                                                    onChange={(v) => updateQuestion(idx, 'tipoQuestao', v)}
                                                    options={TIPO_OPTIONS}
                                                    placeholder="Selecione"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black uppercase tracking-tighter text-slate-400 px-1">Estado (UF)</label>
                                                <SearchableSelect
                                                    value={q.estado || ""}
                                                    onChange={(v) => updateQuestion(idx, 'estado', v)}
                                                    options={BRAZILIAN_STATES}
                                                    placeholder="Selecione"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between px-1">
                                                    <label className="text-[10px] font-black uppercase tracking-tighter text-slate-400">Mun.(Opcional)</label>
                                                    <button
                                                        type="button"
                                                        title="Marcar como Não se aplica"
                                                        onClick={() => updateQuestion(idx, 'municipio', q.municipio === 'Não se aplica' ? '' : 'Não se aplica')}
                                                        className={clsx(
                                                            "transition-all duration-300 rounded-full p-0.5",
                                                            q.municipio === 'Não se aplica'
                                                                ? "bg-violet-500 text-white shadow-sm shadow-violet-200"
                                                                : "text-slate-300 hover:text-violet-500 hover:bg-violet-50"
                                                        )}
                                                    >
                                                        <XCircle className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                <SearchableSelect
                                                    value={q.municipio || ""}
                                                    onChange={(v) => updateQuestion(idx, 'municipio', v)}
                                                    options={q.estado ? (citiesCache[q.estado] || []) : []}
                                                    placeholder={!q.estado ? "Selecione o Estado primeiro" : (loadingCities[q.estado] ? "Carregando..." : "Selecione")}
                                                    disabled={!q.estado || loadingCities[q.estado] || q.municipio === 'Não se aplica'}
                                                    className={clsx(
                                                        "transition-all duration-500",
                                                        q.municipio === 'Não se aplica' && "opacity-40 grayscale-[0.5] blur-[0.3px]"
                                                    )}
                                                    showSearch={false}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </main>
            </div>

            {/* Hidden Input for Graphics */}
            <input type="file" ref={graphicInputRef} accept="image/*" className="hidden" onChange={handleGraphicUpload} />
            {/* Subject Addition Modal */}
            {isSubjectModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsSubjectModalOpen(false)} />
                    <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-8 shadow-2xl relative z-10 animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-violet-100 dark:bg-violet-900/30 rounded-2xl">
                                <Plus className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-800 dark:text-white leading-tight">Nova Disciplina</h3>
                                <p className="text-xs text-slate-500 font-medium">Adicione uma matéria personalizada para esta prova.</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Nome da Disciplina</label>
                                <input
                                    autoFocus
                                    type="text"
                                    value={subjectModalValue}
                                    onChange={(e) => setSubjectModalValue(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && confirmAddSubjectModal()}
                                    placeholder="Ex: Legislação Extravagante..."
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-violet-500 rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 dark:text-white outline-none transition-all"
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setIsSubjectModalOpen(false)}
                                    className="flex-1 px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={confirmAddSubjectModal}
                                    disabled={!subjectModalValue.trim()}
                                    className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-violet-600/20 active:scale-[0.98]"
                                >
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
