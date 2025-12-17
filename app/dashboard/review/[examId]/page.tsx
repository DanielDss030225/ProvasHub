"use client";

import { useAuth } from "../../../../context/AuthContext";
import { useEffect, useState, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { db, storage } from "../../../../lib/firebase";
import { doc, getDoc, updateDoc, runTransaction, increment } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { Loader2, Save, ArrowLeft, AlertTriangle, FileText, Image as ImageIcon, Upload, CheckCircle, XCircle, Trash2, ExternalLink } from "lucide-react";
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

    // Graphic Upload State
    const [uploadingGraphicFor, setUploadingGraphicFor] = useState<number | null>(null);
    const [loadingImageFor, setLoadingImageFor] = useState<number | null>(null);
    const graphicInputRef = useRef<HTMLInputElement>(null);

    // Answer Key Upload State
    const [parsingAnswerKey, setParsingAnswerKey] = useState(false);
    const [answerKeyResult, setAnswerKeyResult] = useState<AnswerKeyResult | null>(null);
    const answerKeyInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/");
        } else if (user && examId) {
            fetchExam(examId);
        }
    }, [user, authLoading, examId, router]);

    // --- Answer Key Parsers ---
    const parseAnswerKeyTXT = (content: string): Record<number, string> => {
        const result: Record<number, string> = {};
        // Patterns: 1-A, 1.A, 1:A, 1) A, 1 A, Q1=A, etc.
        const patterns = [
            /(\d+)\s*[-.:)=]\s*([A-Ea-e])/g,  // 1-A, 1.A, 1:A, 1)A, 1=A
            /[Qq](\d+)\s*[-.:)=]?\s*([A-Ea-e])/g,  // Q1=A, Q1-A
            /(\d+)\s+([A-Ea-e])(?:\s|$)/g,  // 1 A (space separated)
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const questionNum = parseInt(match[1], 10);
                const answer = match[2].toLowerCase();
                if (!result[questionNum]) {
                    result[questionNum] = answer;
                }
            }
        }
        return result;
    };

    const parseAnswerKeyCSV = (content: string): Record<number, string> => {
        const result: Record<number, string> = {};
        const lines = content.split(/\r?\n/).filter(line => line.trim());

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Skip header row if it contains text like "questão", "numero", etc.
            if (i === 0 && /quest[aã]o|numero|question|number/i.test(line)) continue;

            // Split by comma, semicolon, or tab
            const parts = line.split(/[,;\t]/).map(p => p.trim());
            if (parts.length >= 2) {
                const num = parseInt(parts[0], 10);
                const answer = parts[1].match(/[A-Ea-e]/i)?.[0]?.toLowerCase();
                if (!isNaN(num) && answer) {
                    result[num] = answer;
                }
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
            let parsed: Record<number, string> = {};

            if (file.name.endsWith('.csv')) {
                parsed = parseAnswerKeyCSV(content);
            } else {
                parsed = parseAnswerKeyTXT(content);
            }

            // Apply to questions
            const questions = [...exam.extractedData.questions];
            let matched = 0;
            let updated = 0;
            const errors: string[] = [];

            Object.entries(parsed).forEach(([numStr, answer]) => {
                const idx = parseInt(numStr, 10) - 1; // Convert to 0-indexed
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

            setExam({
                ...exam,
                extractedData: { ...exam.extractedData, questions }
            });

            setAnswerKeyResult({
                matched,
                updated,
                total: Object.keys(parsed).length,
                errors
            });

        } catch (err: any) {
            setAnswerKeyResult({
                matched: 0,
                updated: 0,
                total: 0,
                errors: [`Erro ao processar arquivo: ${err.message}`]
            });
        } finally {
            setParsingAnswerKey(false);
            if (answerKeyInputRef.current) {
                answerKeyInputRef.current.value = '';
            }
        }
    };

    const fetchExam = async (id: string) => {
        try {
            const docRef = doc(db, "exams", id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const examData = { id: docSnap.id, ...docSnap.data() } as { id: string; userId: string;[key: string]: any };

                // Security Check: Only owner can review
                if (user && user.uid !== examData.userId) {
                    showAlert("Acesso Negado: Apenas o autor pode editar esta prova.", "error", "Acesso Proibido");
                    router.push("/dashboard");
                    return;
                }

                setExam(examData);
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
        setSaving(true);
        try {
            // 1. Upload pending images first
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

                        // Update question with real URL and remove pending file
                        questions[i] = {
                            ...q,
                            graphicUrl: downloadURL,
                            hasGraphic: true
                        };
                        delete questions[i].pendingFile;
                    } catch (uploadErr) {
                        console.error(`Failed to upload image for question ${i + 1}`, uploadErr);
                        throw new Error(`Falha ao enviar imagem da questão ${i + 1}`);
                    }
                }
            }

            if (hasUploads) {
                setExam((prev: any) => ({
                    ...prev,
                    extractedData: { ...prev.extractedData, questions }
                }));
            }

            // 2. Save metadata to Firestore (Transaction)
            const isFirstPublish = await runTransaction(db, async (transaction) => {
                const examRef = doc(db, "exams", exam.id);
                const examDoc = await transaction.get(examRef);

                if (!examDoc.exists()) {
                    throw new Error("Prova não encontrada.");
                }

                // Only reward credits if status is changing from 'review_required' to 'ready'
                // verifying first time publication
                const currentStatus = examDoc.data().status;
                const isFirst = currentStatus === 'review_required';

                // PREPARE READS (Must be done before any writes)
                let userRef;
                let userDoc;

                if (isFirst && user) {
                    userRef = doc(db, "users", user.uid);
                    userDoc = await transaction.get(userRef);
                }

                // EXECUTE WRITES
                // Update Exam (Use the potentially updated 'questions' array with new URLs)
                transaction.update(examRef, {
                    extractedData: { ...exam.extractedData, questions },
                    status: "ready"
                });

                if (isFirst && user && userRef && userDoc) {
                    if (!userDoc.exists()) {
                        // Initialize user with credits if missing (Recover account state)
                        transaction.set(userRef, {
                            email: user.email,
                            displayName: user.displayName,
                            photoURL: user.photoURL,
                            credits: 175, // 100 initial + 75 reward
                            createdAt: new Date(),
                            lastLogin: new Date()
                        });
                    } else {
                        transaction.update(userRef, {
                            credits: increment(75)
                        });
                    }
                }

                return isFirst;
            });

            if (isFirstPublish) {
                showAlert("Prova salva e publicada com sucesso! (+75 créditos)", "success", "Sucesso");
            } else {
                showAlert("Alterações salvas com sucesso!", "success", "Sucesso");
            }

            // Redirect to Resolution Mode immediately
            router.push(`/dashboard/solve/${exam.id}`);
        } catch (e: any) {
            console.error(e);
            showAlert("Falha ao salvar a prova. " + e.message, "error", "Erro ao Salvar");
        } finally {
            setSaving(false);
        }
    };

    const updateSupportText = (index: number, content: string) => {
        const newSupportTexts = [...exam.extractedData.supportTexts];
        newSupportTexts[index] = { ...newSupportTexts[index], content };
        setExam({
            ...exam,
            extractedData: { ...exam.extractedData, supportTexts: newSupportTexts }
        });
    };

    const updateQuestion = (index: number, field: string, value: any) => {
        const newQuestions = [...exam.extractedData.questions];
        newQuestions[index] = { ...newQuestions[index], [field]: value };
        setExam({
            ...exam,
            extractedData: { ...exam.extractedData, questions: newQuestions }
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

        try {
            // Read file locally for preview
            const reader = new FileReader();
            reader.onload = (event) => {
                const previewUrl = event.target?.result as string;

                const newQuestions = [...exam.extractedData.questions];
                newQuestions[idx] = {
                    ...newQuestions[idx],
                    graphicUrl: previewUrl, // Local preview
                    hasGraphic: true,
                    pendingFile: file // Store for later upload
                };

                setExam({
                    ...exam,
                    extractedData: { ...exam.extractedData, questions: newQuestions }
                });

                setLoadingImageFor(null);
                setUploadingGraphicFor(null);
            };
            reader.readAsDataURL(file);

        } catch (error: any) {
            console.error("Error preparing graphic:", error);
            showAlert("Erro ao preparar imagem: " + error.message, "error", "Erro");
            setLoadingImageFor(null);
            setUploadingGraphicFor(null);
        } finally {
            if (graphicInputRef.current) graphicInputRef.current.value = '';
        }
    };

    const removeGraphic = async (index: number) => {
        if (!exam) return;
        const q = exam.extractedData.questions[index];
        if (!q.graphicUrl) return;

        if (!confirm("Deseja realmente remover esta imagem?")) return;

        try {
            // Just remove from local state
            const newQuestions = [...exam.extractedData.questions];

            // If it was a pending file, we just drop it. 
            // If it was a remote file, we mark it as removed (graphicUrl = null).
            // We do NOT delete from storage here to keep "undo" potential until save (though our logic commits deletions on save by overwriting extractedData).

            newQuestions[index] = {
                ...newQuestions[index],
                graphicUrl: null,
                hasGraphic: false
            };
            delete newQuestions[index].pendingFile;

            setExam({
                ...exam,
                extractedData: { ...exam.extractedData, questions: newQuestions }
            });

        } catch (e) {
            console.error(e);
        }
    };

    if (authLoading || loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-violet-500" /></div>;
    if (!exam) return null;

    return (
        <div className="h-screen flex flex-col bg-white dark:bg-slate-900 overflow-hidden transition-colors duration-300">
            {/* Header */}
            <div className="h-16 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 bg-white dark:bg-slate-900 z-10 transition-colors">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.back()} className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="font-semibold text-lg text-slate-800 dark:text-white">Revisão: {exam.fileName}</h1>
                    <span className="bg-violet-100 text-violet-700 text-xs px-2 py-0.5 rounded-full font-medium">
                        {exam.status === 'review_required' ? 'Modo Revisão' : 'Modo Visualização'}
                    </span>
                </div>
                <button
                    onClick={handleUpdate}
                    disabled={saving}
                    className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 transition disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar e Finalizar
                </button>
            </div>

            {/* Split View */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Panel: Answer Key Upload */}
                <div className="w-1/2 bg-slate-800 dark:bg-slate-950 p-8 flex flex-col items-center justify-center border-r border-slate-700">
                    <div className="w-full max-w-md space-y-6">
                        {/* Header */}
                        <div className="text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-violet-500/20 mb-4">
                                <Upload className="w-8 h-8 text-violet-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Importar Gabarito</h3>
                            <p className="text-sm text-slate-400">
                                Envie um arquivo com o gabarito oficial para corrigir automaticamente as respostas.
                            </p>
                        </div>

                        {/* Upload Area */}
                        <div
                            onClick={() => answerKeyInputRef.current?.click()}
                            className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-violet-500 hover:bg-slate-700/50 transition"
                        >
                            <input
                                ref={answerKeyInputRef}
                                type="file"
                                accept=".txt,.csv"
                                onChange={handleAnswerKeyUpload}
                                className="hidden"
                            />
                            {parsingAnswerKey ? (
                                <Loader2 className="w-8 h-8 text-violet-400 mx-auto animate-spin" />
                            ) : (
                                <>
                                    <Upload className="w-8 h-8 text-slate-500 mx-auto mb-3" />
                                    <p className="text-slate-300 font-medium">Clique para enviar</p>
                                    <p className="text-xs text-slate-500 mt-1">Formatos: .txt, .csv</p>
                                </>
                            )}
                        </div>

                        {/* Supported formats */}
                        <div className="text-center">
                            <p className="text-xs text-slate-500">Padrões aceitos:</p>
                            <p className="text-xs text-slate-400 font-mono mt-1">1-A, 1.A, 1:A, Q1=A</p>
                        </div>

                        {/* Results */}
                        {answerKeyResult && (
                            <div className={clsx(
                                "p-4 rounded-lg text-sm",
                                answerKeyResult.errors.length > 0 && answerKeyResult.matched === 0
                                    ? "bg-red-500/20 border border-red-500/30"
                                    : "bg-violet-500/20 border border-violet-500/30"
                            )}>
                                <div className="flex items-center gap-2 mb-2 font-semibold">
                                    {answerKeyResult.updated > 0 ? (
                                        <CheckCircle className="w-4 h-4 text-violet-400" />
                                    ) : (
                                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                                    )}
                                    <span className={answerKeyResult.updated > 0 ? "text-violet-300" : "text-amber-300"}>
                                        {answerKeyResult.updated > 0
                                            ? `${answerKeyResult.updated} resposta(s) corrigida(s)!`
                                            : "Nenhuma alteração necessária"
                                        }
                                    </span>
                                </div>
                                <div className="text-xs text-slate-400 space-y-1">
                                    <p>• {answerKeyResult.total} resposta(s) encontrada(s)</p>
                                    <p>• {answerKeyResult.matched} correspondência(s)</p>
                                    {answerKeyResult.errors.length > 0 && (
                                        <div className="text-red-400 mt-2">
                                            {answerKeyResult.errors.slice(0, 3).map((err, i) => (
                                                <p key={i}>⚠ {err}</p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel: Editor */}
                <div className="w-1/2 bg-slate-50 dark:bg-slate-950 overflow-y-auto p-8 pb-32 transition-colors">
                    <div className="max-w-2xl mx-auto space-y-8">
                        {/* Hidden Graphic Input */}
                        <input
                            type="file"
                            ref={graphicInputRef}
                            accept="image/*"
                            className="hidden"
                            onChange={handleGraphicUpload}
                        />

                        {/* Support Texts */}
                        {exam.extractedData?.supportTexts && exam.extractedData.supportTexts.length > 0 && (
                            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800 shadow-sm space-y-4">
                                <h3 className="font-semibold text-blue-800 dark:text-blue-200 flex items-center gap-2">
                                    <FileText className="w-5 h-5" />
                                    Textos de Apoio
                                </h3>
                                <div className="space-y-4">
                                    {exam.extractedData.supportTexts.map((text: any, idx: number) => (
                                        <div key={idx} className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-blue-100 dark:border-blue-900 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="font-bold text-blue-600">{text.id}</span>
                                                <span className="text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded">Questões: {text.associatedQuestions}</span>
                                            </div>
                                            <textarea
                                                value={text.content}
                                                onChange={(e) => updateSupportText(idx, e.target.value)}
                                                className="w-full min-h-[100px] p-2 rounded border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800 text-slate-800 dark:text-slate-200 text-sm focus:border-blue-500 focus:ring-blue-500"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Exam Meta */}
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Título da Prova</label>
                                <input
                                    value={exam.extractedData?.title || ""}
                                    onChange={(e) => setExam({ ...exam, extractedData: { ...exam.extractedData, title: e.target.value } })}
                                    className="w-full text-xl font-bold text-slate-900 dark:text-white border-none p-0 focus:ring-0 placeholder:text-slate-300 dark:bg-transparent"
                                    placeholder="Digite o título..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Disciplina</label>
                                <input
                                    value={exam.extractedData?.course || ""}
                                    onChange={(e) => setExam({ ...exam, extractedData: { ...exam.extractedData, course: e.target.value } })}
                                    className="w-full text-base font-medium text-slate-700 dark:text-slate-300 border-none p-0 focus:ring-0 placeholder:text-slate-300 dark:bg-transparent"
                                    placeholder="Digite a disciplina..."
                                />
                            </div>
                        </div>

                        {/* Questions */}
                        <div className="space-y-6">
                            {exam.extractedData?.questions?.map((q: any, idx: number) => (
                                <div key={idx} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition group hover:border-violet-300 dark:hover:border-violet-700">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold px-2 py-1 rounded">Q{idx + 1}</span>
                                            <div className="flex items-center gap-2">
                                                {q.hasGraphic && (
                                                    <span className="bg-purple-100 text-purple-700 text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1">
                                                        <ImageIcon className="w-3 h-3" />
                                                        Contém Imagem
                                                    </span>
                                                )}

                                                {!q.graphicUrl && (
                                                    <button
                                                        onClick={() => triggerGraphicUpload(idx)}
                                                        className="text-slate-500 hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-400 transition flex items-center gap-1.5 text-xs font-medium"
                                                        title="Adicionar Gráfico/Imagem"
                                                    >
                                                        <ImageIcon className="w-4 h-4" />
                                                        <span>Adicione Gráfico</span>
                                                    </button>
                                                )}

                                                {loadingImageFor === idx && (
                                                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs px-2 py-1 rounded-full">
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                        <span>Carregando...</span>
                                                    </div>
                                                )}

                                                {q.graphicUrl && !loadingImageFor && (
                                                    <div className="flex items-center gap-1 group/img-actions">
                                                        <div className="relative group/preview cursor-pointer">
                                                            <a href={q.graphicUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 bg-violet-50 text-violet-600 px-2 py-1 rounded-full text-xs font-medium hover:bg-violet-100">
                                                                <ImageIcon className="w-3 h-3" />
                                                                Ver Imagem
                                                            </a>
                                                            <div className="absolute bottom-full left-0 mb-2 hidden group-hover/preview:block z-20">
                                                                <img src={q.graphicUrl} alt="Preview" className="max-w-[200px] max-h-[150px] rounded-lg border border-slate-200 shadow-xl bg-white" />
                                                            </div>
                                                        </div>

                                                        <button
                                                            onClick={() => triggerGraphicUpload(idx)}
                                                            className="p-1 text-slate-400 hover:text-orange-500"
                                                            title="Trocar imagem"
                                                        >
                                                            <Upload className="w-3 h-3" />
                                                        </button>
                                                        <button
                                                            onClick={() => removeGraphic(idx)}
                                                            className="p-1 text-slate-400 hover:text-red-500"
                                                            title="Remover imagem"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {q.confidence < 0.8 && (
                                            <div className="flex items-center gap-1 text-amber-500 text-xs font-medium bg-amber-50 px-2 py-1 rounded-full">
                                                <AlertTriangle className="w-3 h-3" />
                                                Baixa Confiança ({(q.confidence * 100).toFixed(0)}%)
                                            </div>
                                        )}
                                    </div>

                                    <textarea
                                        value={q.text}
                                        onChange={(e) => updateQuestion(idx, 'text', e.target.value)}
                                        className="w-full min-h-[100px] p-2 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm focus:border-violet-500 focus:ring-violet-500"
                                    />

                                    {/* Inline Image Preview */}
                                    {q.graphicUrl && (
                                        <div className="mt-2 mb-4">
                                            <div className="relative inline-block group">
                                                <img
                                                    src={q.graphicUrl}
                                                    alt="Questão visual"
                                                    className="max-h-[200px] rounded-lg border border-slate-200 dark:border-slate-700 hover:opacity-90 transition cursor-zoom-in"
                                                    onClick={() => window.open(q.graphicUrl, '_blank')}
                                                />
                                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                                    <button onClick={() => triggerGraphicUpload(idx)} className="p-1.5 bg-white/90 rounded-full shadow-sm hover:text-orange-600 transition" title="Trocar"><Upload className="w-4 h-4" /></button>
                                                    <button onClick={() => removeGraphic(idx)} className="p-1.5 bg-white/90 rounded-full shadow-sm hover:text-red-600 transition" title="Remover"><Trash2 className="w-4 h-4" /></button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="mt-4 space-y-2 pl-4 border-l-2 border-slate-100 dark:border-slate-800">
                                        {q.options?.map((opt: string, optIdx: number) => {
                                            const optionLetter = String.fromCharCode(97 + optIdx); // 'a', 'b', etc.
                                            const isCorrect = q.correctAnswer?.toLowerCase() === optionLetter;

                                            return (
                                                <div key={optIdx} className={clsx(
                                                    "flex items-center gap-3 p-2 rounded-lg transition",
                                                    isCorrect ? "bg-green-50 dark:bg-green-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                                                )}>
                                                    <div
                                                        onClick={() => updateQuestion(idx, 'correctAnswer', optionLetter)}
                                                        className={clsx(
                                                            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border cursor-pointer transition shrink-0",
                                                            isCorrect
                                                                ? "bg-green-500 border-green-500 text-white shadow-sm ring-2 ring-green-200 ring-offset-1 dark:ring-offset-slate-900"
                                                                : "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400 hover:border-slate-400 dark:hover:border-slate-500"
                                                        )}>
                                                        {String.fromCharCode(65 + optIdx)}
                                                    </div>
                                                    <input
                                                        value={opt}
                                                        onChange={(e) => {
                                                            const newOptions = [...q.options];
                                                            newOptions[optIdx] = e.target.value;
                                                            updateQuestion(idx, 'options', newOptions);
                                                        }}
                                                        className="flex-1 bg-transparent border-none text-sm text-slate-600 dark:text-slate-300 focus:ring-0 p-0"
                                                    />
                                                    {isCorrect && <span className="text-xs font-bold text-green-600">Correta</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
