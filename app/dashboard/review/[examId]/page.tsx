"use client";

import { useAuth } from "../../../../context/AuthContext";
import { useEffect, useState, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { db, storage } from "../../../../lib/firebase";
import { doc, getDoc, updateDoc, runTransaction, increment, collection, setDoc, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { Loader2, Save, ArrowLeft, AlertTriangle, FileText, Image as ImageIcon, Upload, CheckCircle, XCircle, Trash2, ExternalLink, Plus, Book, Zap } from "lucide-react";
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

export default function ReviewPage({ params }: PageProps) {
    const { examId } = use(params);
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { showAlert } = useAlert();
    const [exam, setExam] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Subjects Management
    const [subjects, setSubjects] = useState<string[]>([]);
    const [newSubject, setNewSubject] = useState("");

    // Graphic Upload State
    const [uploadingGraphicFor, setUploadingGraphicFor] = useState<number | null>(null);
    const [loadingImageFor, setLoadingImageFor] = useState<number | null>(null);
    const graphicInputRef = useRef<HTMLInputElement>(null);

    // Answer Key Upload State
    const [parsingAnswerKey, setParsingAnswerKey] = useState(false);
    const [answerKeyResult, setAnswerKeyResult] = useState<AnswerKeyResult | null>(null);
    const answerKeyInputRef = useRef<HTMLInputElement>(null);

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

    const addSubject = () => {
        if (newSubject.trim() && !subjects.includes(newSubject.trim())) {
            setSubjects([...subjects, newSubject.trim()]);
            setNewSubject("");
        }
    };


    const detectNivel = (text: string) => {
        const lower = text.toLowerCase();
        if (lower.includes("superior") || lower.includes("graduado") || lower.includes("analista") || lower.includes("especialista") || lower.includes("ensino superior")) return "Superior";
        if (lower.includes("médio") || lower.includes("medio") || lower.includes("técnico") || lower.includes("tecnico") || lower.includes("ensino médio")) return "Médio";
        if (lower.includes("fundamental") || lower.includes("alfabetizado") || lower.includes("ensino fundamental")) return "Fundamental";
        return "";
    };

    const detectAno = (text: string) => {
        const match = text.match(/\b(201[5-9]|202[0-9])\b/);
        return match ? match[0] : "";
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

                // Ensure all questions have basic metadata fields
                const questions = examData.extractedData.questions.map((q: any) => ({
                    ...q,
                    concurso: (q.concurso || examData.extractedData.metadata?.concurso || "").substring(0, 30),
                    banca: q.banca || examData.extractedData.metadata?.banca || "",
                    cargo: (q.cargo || examData.extractedData.metadata?.cargo || "").substring(0, 30),
                    nivel: q.nivel || detectedNivel,
                    ano: q.ano || detectedAno,
                    tipoQuestao: q.tipoQuestao || examData.extractedData.metadata?.tipoQuestao || "multipla_escolha",
                    disciplina: q.disciplina || detectDisciplina(q.text) || examData.extractedData.course || "",
                    confidence: q.confidence || 1.0
                }));

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

        const hasKey = exam.extractedData.answerKeyResult || answerKeyResult;

        const processSave = async () => {
            setSaving(true);
            try {
                const questions = [...exam.extractedData.questions];
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
                            tipoQuestao: q.tipoQuestao || "multipla_escolha",
                            createdAt: Timestamp.now(),
                            createdBy: user!.uid
                        });
                    }

                    if (shouldAward && userRef && userDoc?.exists()) {
                        transaction.update(userRef, { credits: increment(75) });
                    }
                });

                showAlert("Prova salva e Banco de Questões atualizado!", "success");
                router.push(`/dashboard/solve/${exam.id}`);
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
                "Sua prova será salva, mas os 75 créditos de revisão só serão liberados quando você importar o gabarito oficial.",
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
        const syncFields = ['concurso', 'banca', 'cargo', 'nivel', 'ano'];

        if (syncFields.includes(field)) {
            const finalValue = (field === 'concurso' || field === 'cargo') ? String(value).substring(0, 30) : value;
            // Update the field for ALL questions
            for (let i = 0; i < newQuestions.length; i++) {
                newQuestions[i] = { ...newQuestions[i], [field]: finalValue };
            }
        } else {
            // Standard individual update
            newQuestions[index] = { ...newQuestions[index], [field]: value };
        }

        setExam({
            ...exam,
            extractedData: { ...exam.extractedData, questions: newQuestions }
        });
    };

    const updateSupportText = (index: number, field: string, value: any) => {
        const newSupportTexts = [...(exam.extractedData.supportTexts || [])];
        newSupportTexts[index] = { ...newSupportTexts[index], [field]: value };
        setExam({
            ...exam,
            extractedData: { ...exam.extractedData, supportTexts: newSupportTexts }
        });
    };

    const updateTitle = (value: string) => {
        setExam({
            ...exam,
            extractedData: { ...exam.extractedData, title: value }
        });
    };

    const updateDescription = (value: string) => {
        setExam({
            ...exam,
            extractedData: { ...exam.extractedData, description: value }
        });
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

                showAlert("Imagem removida com sucesso.", "success");
            }
        );
    };

    if (authLoading || loading) return <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950"><Loader2 className="animate-spin text-violet-500 w-10 h-10" /></div>;
    if (!exam) return null;

    return (
        <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden transition-colors">
            {/* Header */}
            <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 z-20 shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.back()} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition text-slate-500">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="font-bold text-slate-800 dark:text-white leading-none">Revisão de Prova</h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate max-w-[300px]">{exam.extractedData?.title || exam.fileName}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleUpdate}
                        disabled={saving}
                        className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl font-bold transition disabled:opacity-50 shadow-lg shadow-violet-500/20 active:scale-95"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        SALVAR E FINALIZAR
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Left Panel: Global Config */}
                <aside className="w-[380px] border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 overflow-y-auto space-y-8 scrollbar-hide">
                    {/* Answer Key Upload */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-slate-800 dark:text-white">
                            <Upload className="w-5 h-5 text-violet-500" />
                            <h2 className="font-bold uppercase text-xs tracking-widest">Importar Gabarito</h2>
                        </div>
                        {!answerKeyResult && !parsingAnswerKey && (
                            <div className="flex items-center gap-2 p-2 px-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-xl text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-tighter animate-pulse">
                                <AlertTriangle className="w-3 h-3" />
                                Gabarito Pendente
                            </div>
                        )}
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
                                    {answerKeyResult.updated > 0 ? "Gabarito Aplicado!" : "Escaneamento Concluído"}
                                </div>
                                <p>• Encontrado: {answerKeyResult.total}</p>
                                <p>• Vinculado: {answerKeyResult.matched}</p>
                                <p className="font-bold underline decoration-emerald-500/30">• Necessário Correção: {answerKeyResult.updated}</p>
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
                                    <button onClick={() => setSubjects(subjects.filter(sub => sub !== s))} className="hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
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
                <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-8 scrollbar-hide pb-32">
                    <div className="max-w-4xl mx-auto space-y-8">
                        {/* Exam Header Info */}
                        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400 px-1">Título da Prova</label>
                                <input
                                    type="text"
                                    value={exam.extractedData?.title || ""}
                                    onChange={(e) => updateTitle(e.target.value)}
                                    placeholder="Ex: PMMG - Soldado 2024"
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border-none rounded-2xl px-6 py-4 text-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500/20 transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Descrição / Observações</label>
                                <textarea
                                    value={exam.extractedData?.description || ""}
                                    onChange={(e) => updateDescription(e.target.value)}
                                    placeholder="Adicione detalhes sobre a prova, banca ou requisitos..."
                                    className="w-full min-h-[100px] bg-slate-50 dark:bg-slate-800/50 border-none rounded-2xl px-6 py-4 text-sm font-medium text-slate-600 dark:text-slate-300 outline-none focus:ring-2 focus:ring-violet-500/20 transition-all resize-none"
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
                                        <textarea
                                            value={st.text}
                                            onChange={(e) => updateSupportText(idx, 'text', e.target.value)}
                                            className="w-full min-h-[100px] bg-transparent border-none p-0 text-slate-700 dark:text-slate-300 text-sm leading-relaxed font-medium focus:ring-0 placeholder:text-slate-300 resize-y"
                                            placeholder="Conteúdo do texto de apoio..."
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center gap-2 mb-4">
                            <Book className="w-5 h-5 text-violet-500" />
                            <h2 className="font-black text-slate-800 dark:text-white uppercase tracking-wider text-sm">Questões Extraídas</h2>
                        </div>

                        {exam.extractedData?.questions?.map((q: any, idx: number) => (
                            <div key={idx} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden group hover:border-violet-300 dark:hover:border-violet-700 transition-all duration-300">
                                {/* Question Header */}
                                <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="w-8 h-8 flex items-center justify-center bg-violet-600 text-white rounded-xl text-xs font-black">
                                            Q{idx + 1}
                                        </span>
                                        <select
                                            value={q.disciplina || ""}
                                            onChange={(e) => updateQuestion(idx, 'disciplina', e.target.value)}
                                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 focus:ring-2 focus:ring-violet-500/20 outline-none w-[250px]"
                                        >
                                            <option value="">Selecione a Disciplina</option>
                                            {subjects.map((s, i) => (
                                                <option key={i} value={s} title={s}>
                                                    {s.length > 30 ? s.substring(0, 30) + '...' : s}
                                                </option>
                                            ))}
                                            <option value="custom">+ Adicionar Outra</option>
                                        </select>
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
                                    </div>
                                </div>

                                <div className="p-8 space-y-6">
                                    {/* Content Editor */}
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
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Question Metadata Form */}
                                    <div className="pt-6 mt-6 border-t border-slate-50 dark:border-slate-800/50 grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black uppercase tracking-tighter text-slate-400 px-1">Concurso</label>
                                            <input
                                                value={q.concurso || ""}
                                                onChange={(e) => updateQuestion(idx, 'concurso', e.target.value)}
                                                maxLength={30}
                                                className="w-full bg-slate-50 dark:bg-slate-800/50 border-none rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 outline-none"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black uppercase tracking-tighter text-slate-400 px-1">Banca</label>
                                            <input
                                                value={q.banca || ""}
                                                onChange={(e) => updateQuestion(idx, 'banca', e.target.value)}
                                                className="w-full bg-slate-50 dark:bg-slate-800/50 border-none rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 outline-none"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black uppercase tracking-tighter text-slate-400 px-1">Cargo</label>
                                            <input
                                                value={q.cargo || ""}
                                                onChange={(e) => updateQuestion(idx, 'cargo', e.target.value)}
                                                maxLength={30}
                                                className="w-full bg-slate-50 dark:bg-slate-800/50 border-none rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 outline-none"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black uppercase tracking-tighter text-slate-400 px-1">Nível</label>
                                            <select
                                                value={q.nivel || ""}
                                                onChange={(e) => updateQuestion(idx, 'nivel', e.target.value)}
                                                className="w-full bg-slate-50 dark:bg-slate-800/50 border-none rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 outline-none"
                                            >
                                                <option value="">Selecione</option>
                                                <option value="Fundamental">Fundamental</option>
                                                <option value="Médio">Médio</option>
                                                <option value="Superior">Superior</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black uppercase tracking-tighter text-slate-400 px-1">Ano</label>
                                            <select
                                                value={q.ano || ""}
                                                onChange={(e) => updateQuestion(idx, 'ano', e.target.value)}
                                                className="w-full bg-slate-50 dark:bg-slate-800/50 border-none rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 outline-none"
                                            >
                                                <option value="">Selecione</option>
                                                {Array.from({ length: new Date().getFullYear() - 2014 }, (_, i) => 2015 + i).reverse().map(year => (
                                                    <option key={year} value={year}>{year}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black uppercase tracking-tighter text-slate-400 px-1">Tipo</label>
                                            <select
                                                value={q.tipoQuestao || ""}
                                                onChange={(e) => updateQuestion(idx, 'tipoQuestao', e.target.value)}
                                                className="w-full bg-slate-50 dark:bg-slate-800/50 border-none rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 outline-none"
                                            >
                                                <option value="multipla_escolha">Múltipla Escolha</option>
                                                <option value="certo_errado">Certo ou Errado</option>
                                            </select>
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
        </div>
    );
}
