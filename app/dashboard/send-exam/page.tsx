"use client";

import { useAuth } from "../../../context/AuthContext";
import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth, db, storage } from "../../../lib/firebase";
import { collection, doc, runTransaction, Timestamp, increment, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { processExamAction } from "../../actions/exam";
import { Upload, ChevronLeft, AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import { useAlert } from "../../context/AlertContext";
import clsx from "clsx";

function SendExamContent() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { showAlert } = useAlert();

    const [uploading, setUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<string>("");
    const [progress, setProgress] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    const [activityLog, setActivityLog] = useState<string[]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Get fulfillment request ID from URL
    const fulfillmentRequestId = searchParams.get('requestId');
    const [requestDetails, setRequestDetails] = useState<any>(null);

    useEffect(() => {
        if (!loading && !user) {
            router.push("/");
        }
    }, [user, loading, router]);

    // Fetch request details if fulfilling
    useEffect(() => {
        const fetchRequest = async () => {
            if (fulfillmentRequestId && user) {
                try {
                    const docRef = doc(db, "exam_requests", fulfillmentRequestId);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        setRequestDetails(docSnap.data());
                    }
                } catch (e) {
                    console.error("Error fetching request", e);
                }
            }
        };
        fetchRequest();
    }, [fulfillmentRequestId, user]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (uploading && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [uploading, timeLeft]);

    // Update progress bar based on elapsed time (0:00 = 0%, 2:50 = 100%)
    useEffect(() => {
        let interval: NodeJS.Timeout;
        const totalTime = 170; // 2:50 in seconds

        if (uploading && progress < 90) {
            interval = setInterval(() => {
                setProgress((prev) => {
                    const elapsed = totalTime - timeLeft;
                    const calculatedProgress = (elapsed / totalTime) * 100;

                    // Cap at 90% until API returns
                    return Math.min(calculatedProgress, 90);
                });
            }, 1000); // Update every second
        }

        return () => clearInterval(interval);
    }, [uploading, timeLeft, progress]);

    useEffect(() => {
        if (activityLog.length > 0) {
            logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [activityLog]);

    const addLog = (message: string) => {
        setActivityLog(prev => [...prev, message]);
    };

    const [duplicateExam, setDuplicateExam] = useState<any>(null);

    const calculateSimilarity = (text1: string, text2: string) => {
        const tokenize = (text: string) => new Set(text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2));
        const set1 = tokenize(text1);
        const set2 = tokenize(text2);

        let intersection = 0;
        set1.forEach(word => {
            if (set2.has(word)) intersection++;
        });

        const union = set1.size + set2.size - intersection;
        return union === 0 ? 0 : intersection / union;
    };

    const checkDuplicates = async (newExamData: any) => {
        // Fetch recent exams (limit 50 for performance)
        const examsRef = collection(db, "exams");
        // We can't query by content, so we fetch metadata/content of recent ones
        // Optimization: In real app, use vector DB. Here, fetch last 50.
        try {
            // Note: This matches the prototype nature. 
            // Ideally we'd valid the 'status' too, but let's check everything.
            // Using a simple getDocs without complex index for now if possible, or limit
            // If we have thousands, this is slow. 
            // For now, let's fetch a small batch.
            const querySnapshot = await import("firebase/firestore").then(mod => mod.getDocs(mod.query(examsRef, mod.limit(50))));

            const newExamText = newExamData.questions.map((q: any) => q.text).join(" ");

            for (const doc of querySnapshot.docs) {
                const existingData = doc.data();
                if (!existingData.extractedData?.questions) continue;

                const existingText = existingData.extractedData.questions.map((q: any) => q.text).join(" ");
                const similarity = calculateSimilarity(newExamText, existingText);

                if (similarity >= 0.7) {
                    return { id: doc.id, title: existingData.extractedData.title || "Prova Existente", similarity, userId: existingData.userId };
                }
            }
        } catch (e) {
            console.error("Duplicate check failed", e);
        }
        return null;
    };

    const saveExamToFirestore = async (examData: any, file: File) => {
        setUploadStatus("Salvando no banco de dados...");
        addLog("Salvando no banco de dados...");

        const examRef = doc(collection(db, "exams"));

        await runTransaction(db, async (transaction) => {
            transaction.set(examRef, {
                userId: user!.uid,
                userName: user!.displayName || "Usuário Anônimo",
                userPhoto: user!.photoURL || null,
                fileName: file.name,
                createdAt: Timestamp.now(),
                status: "review_required",
                extractedData: examData,
                fulfillmentRequestId: fulfillmentRequestId || null
            });

            if (fulfillmentRequestId) {
                const requestRef = doc(db, "exam_requests", fulfillmentRequestId);
                transaction.update(requestRef, {
                    status: "pending_approval",
                    fulfillerId: user!.uid,
                    fulfillerName: user!.displayName || "Usuário",
                    pendingExamId: examRef.id,
                    updatedAt: Timestamp.now()
                });

                const notificationRef = doc(collection(db, "notifications"));
                transaction.set(notificationRef, {
                    userId: requestDetails.requesterId,
                    type: "fulfillment_approval_needed",
                    title: "Pedido de Prova Atendido!",
                    message: `${user!.displayName || "Um usuário"} enviou uma prova para seu pedido: "${requestDetails.subject}". Analise para liberar os créditos.`,
                    data: {
                        requestId: fulfillmentRequestId,
                        examId: examRef.id,
                        fulfillerId: user!.uid,
                        fulfillerName: user!.displayName || "Usuário"
                    },
                    read: false,
                    createdAt: Timestamp.now()
                });
            }

            // Save individual questions to the 'questions' collection for the Question Bank
            const questions = examData.questions || [];
            const metadata = examData.metadata || {};

            // Build Support Text Map
            const questionSupportMap: Record<number, string> = {};
            if (examData.supportTexts) {
                examData.supportTexts.forEach((st: any) => {
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

            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                // Use deterministic ID to prevent duplicates on review/update
                const questionRef = doc(db, "questions", `${examRef.id}_q${i}`);

                // Detect question type based on options or metadata
                const tipoQuestao = metadata.tipoQuestao ||
                    (q.options?.length === 2 &&
                        q.options.some((opt: string) => /certo|errado/i.test(opt))
                        ? 'certo_errado'
                        : 'multipla_escolha');

                transaction.set(questionRef, {
                    // Question Data
                    text: q.text,
                    options: q.options || [],
                    correctAnswer: q.correctAnswer || null,
                    graphicUrl: q.graphicUrl || null,
                    hasGraphic: q.hasGraphic || false,
                    supportText: questionSupportMap[i + 1] || null,

                    // Source Exam Reference
                    examId: examRef.id,
                    examTitle: examData.title || file.name,
                    questionIndex: i,

                    // Metadata for filtering
                    concurso: metadata.concurso || "",
                    banca: metadata.banca || "",
                    cargo: metadata.cargo || "",
                    nivel: metadata.nivel || "",
                    disciplina: metadata.disciplina || examData.course || "",
                    areaDisciplina: metadata.areaDisciplina || "",
                    ano: metadata.ano || new Date().getFullYear(),
                    estado: metadata.estado || "",
                    municipio: metadata.municipio || "",
                    tipoQuestao: tipoQuestao,

                    // System metadata
                    createdAt: Timestamp.now(),
                    createdBy: user!.uid
                });
            }
        });

        addLog(`Salvo com sucesso! ${examData.questions?.length || 0} questões adicionadas ao banco.`);

        setProgress(100);
        setUploading(false);

        if (fulfillmentRequestId) {
            showAlert("Pedido atendido! Caso o outro usuário aceite sua prova você ganhará +100 créditos!", "success", "Parabéns");
        }

        router.push(`/dashboard/review/${examRef.id}`);
    };


    const [showPaymentInfo, setShowPaymentInfo] = useState<{ id: string, userId: string } | null>(null);
    const [processingPayment, setProcessingPayment] = useState(false);

    const handleViewExistingExam = async (targetExamId: string, authorId: string) => {
        if (user!.uid === authorId) {
            router.push(`/dashboard/solve/${targetExamId}`);
            return;
        }
        setShowPaymentInfo({ id: targetExamId, userId: authorId });
    };

    const confirmPaymentAndRedirect = async () => {
        if (!showPaymentInfo || !user) return;
        setProcessingPayment(true);

        try {
            const authorRef = doc(db, "users", showPaymentInfo.userId);
            const solverRef = doc(db, "users", user.uid);
            const examRef = doc(db, "exams", showPaymentInfo.id);

            await runTransaction(db, async (transaction) => {
                const solverDoc = await transaction.get(solverRef);
                const authorDoc = await transaction.get(authorRef);
                const currentCredits = solverDoc.exists() ? (solverDoc.data().credits || 0) : 0;

                if (currentCredits < 50) {
                    throw new Error("Créditos insuficientes para realizar a prova.");
                }

                if (solverDoc.exists()) {
                    transaction.update(solverRef, { credits: increment(-50) });
                }

                if (authorDoc.exists()) {
                    transaction.update(authorRef, { credits: increment(25) });
                }

                transaction.update(examRef, { resolutions: increment(1) });
            });

            router.push(`/dashboard/solve/${showPaymentInfo.id}`);

        } catch (error: any) {
            console.error("Payment failed", error);
            showAlert(error.message, "error", "Erro de Pagamento");
            setShowPaymentInfo(null);
        } finally {
            setProcessingPayment(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        setUploading(true);
        setActivityLog([]);
        setDuplicateExam(null); // Reset
        addLog("Iniciando processo...");

        const startTime = Date.now();
        setTimeLeft(170);
        setProgress(5);
        setUploadStatus("Lendo arquivo...");
        addLog(`Lendo arquivo: ${file.name}...`);

        try {
            const readFileAsBase64 = (file: File): Promise<string> => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const result = reader.result?.toString();
                        if (!result) return reject(new Error("Failed to read file"));
                        const base64 = result.split(',')[1];
                        resolve(base64);
                    };
                    reader.onerror = (error) => reject(error);
                    reader.readAsDataURL(file);
                });
            };

            // 1. Read file
            const base64String = await readFileAsBase64(file);
            addLog("Arquivo lido.");
            setProgress(10);

            // 2. Process Entire Exam
            setUploadStatus("Processando... (Isso pode demorar alguns minutos)");
            addLog("Reconhecendo prova com IA...");

            const examData = await processExamAction(base64String, file.type);

            setProgress(90);
            addLog(`Prova processada: ${examData.title}`);
            addLog(`Questões encontradas: ${examData.questions?.length || 0}`);

            // Validation: Reject if >40% questions are empty
            const questions = examData.questions || [];
            const totalQuestions = questions.length;
            const emptyQuestions = questions.filter((q: any) => !q.text || q.text.trim().length < 5).length;

            if (totalQuestions > 0 && (emptyQuestions / totalQuestions) > 0.4) {
                throw new Error(`Verifique se você está enviando o PDF correto da sua prova. O arquivo enviado parece incompleto ou ilegível (${emptyQuestions}/${totalQuestions} questões não identificadas).`);
            }

            // Duplicate Check
            addLog("Verificando duplicidade...");
            const duplicate = await checkDuplicates(examData);
            if (duplicate) {
                // We need the authorId to determine payment requirement
                // We didn't fetch authorId in checkDuplicates, let's fix that or fetch it now.
                // Optimally checkDuplicates should return authorId.
                // Let's assume checkDuplicates returns it or we fetch it.
                // Wait, the doc data has userId.
                setDuplicateExam({ ...duplicate, examData, file });
                setUploading(false);
                return;
            }

            await saveExamToFirestore(examData, file);

        } catch (error: any) {
            console.error("Upload failed:", error);
            showAlert(error.message, "error", "Falha na Validação");
            setUploadStatus("Erro: " + error.message);
            addLog("ERRO CRÍTICO: " + error.message);
            setUploading(false);
            setProgress(0);
        }
    };

    if (loading || !user) return null;

    return (
        <div className="h-screen bg-slate-50 dark:bg-slate-950 p-8 transition-colors duration-300 overflow-y-auto">
            {/* Header */}
            <div className="max-w-4xl mx-auto mb-8 flex items-center gap-4">
                <button
                    onClick={() => router.push('/dashboard')}
                    className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-violet-600 hover:border-violet-200 transition"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
                    Enviar Nova Prova
                </h1>
            </div>

            <div className="max-w-4xl mx-auto">
                {/* Fulfillment Alert */}
                {fulfillmentRequestId && requestDetails && (
                    <div className="mb-6 p-4 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl flex items-start gap-4 animate-in slide-in-from-top-4">
                        <div className="p-2 bg-violet-100 dark:bg-violet-800 rounded-lg shrink-0">
                            <AlertCircle className="w-6 h-6 text-violet-600 dark:text-violet-300" />
                        </div>
                        <div>
                            <h3 className="font-bold text-violet-800 dark:text-violet-200">
                                Atendendo Pedido: {requestDetails.subject}
                            </h3>
                            <p className="text-violet-600 dark:text-violet-400 text-sm mt-1">
                                {requestDetails.description}
                            </p>
                            <p className="text-xs font-semibold text-green-600 dark:text-green-400 mt-2 bg-green-100 dark:bg-green-900/30 w-fit px-2 py-1 rounded-full">
                                +100 Créditos se aceito
                            </p>
                        </div>
                    </div>
                )}

                <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
                    <div className="mb-8 text-center">
                        <div className="mx-auto w-16 h-16 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-2xl flex items-center justify-center mb-4">
                            <Upload className="w-8 h-8" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
                            Upload de Arquivo PDF
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                            Coopere com a comunidade e transforme seus PDFs em provas interativas.                        </p>
                    </div>

                    {!uploading ? (
                        <div className="relative border-3 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-16 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-violet-400 dark:hover:border-violet-600 transition cursor-pointer group bg-slate-50/50 dark:bg-slate-900/50">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf"
                                onChange={handleFileUpload}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <div className="text-center pointer-events-none">
                                <div className="inline-block px-6 py-3 bg-violet-600 text-white font-semibold rounded-xl group-hover:bg-violet-700 transition shadow-lg shadow-violet-200 dark:shadow-none mb-4">
                                    Selecionar Arquivo
                                </div>
                                <p className="text-slate-400 text-sm">Ou arraste e solte o arquivo aqui</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8 max-w-2xl mx-auto">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <span className="flex items-center gap-2">
                                        {uploadStatus}
                                        <span className="flex h-2 w-2 relative">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
                                        </span>
                                    </span>
                                    <span className="text-lg font-bold text-violet-600 dark:text-violet-400">{progress.toFixed(0)}%</span>
                                </div>
                                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                                    <div
                                        className="h-full bg-violet-600 rounded-full transition-all duration-500 ease-out relative"
                                        style={{ width: `${progress}%` }}
                                    >
                                        <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <p className="text-xs text-slate-500 uppercase font-bold mb-1">Sua prova estará pronta para revisão em:</p>
                                    <p className={clsx(
                                        "text-2xl font-mono font-bold",
                                        timeLeft < 60 ? "text-red-500" : "text-slate-700 dark:text-slate-300"
                                    )}>
                                        {timeLeft === 0 ? (
                                            <span className="text-base animate-pulse">Refinando dados...</span>
                                        ) : (
                                            `${Math.floor(timeLeft / 60).toString().padStart(2, '0')}:${(timeLeft % 60).toString().padStart(2, '0')}`
                                        )}
                                    </p>
                                </div>
                                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <p className="text-xs text-slate-500 uppercase font-bold mb-1">Status</p>
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                                        {uploadStatus}
                                    </p>
                                </div>
                            </div>

                            <div className="h-48 overflow-y-auto bg-slate-950 rounded-xl p-4 font-mono text-xs border border-slate-800 shadow-inner">
                                {activityLog.map((log, i) => (
                                    <p key={i} className="text-slate-400 mb-1 border-l-2 border-slate-800 pl-2">
                                        <span className="text-slate-600 mr-2">[{new Date().toLocaleTimeString()}]</span>
                                        {log}
                                    </p>
                                ))}
                                <div ref={logsEndRef}></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {/* Duplicate Warning Modal */}
            {duplicateExam && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 animate-in zoom-in-95">
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mb-4">
                                <AlertCircle className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                                Prova Similar Encontrada!
                            </h3>
                            <p className="text-slate-600 dark:text-slate-300">
                                Encontramos uma prova no sistema com <strong>{(duplicateExam.similarity * 100).toFixed(0)}%</strong> de similaridade com a que você está enviando.
                            </p>
                            <p className="text-sm text-slate-500 mt-2">
                                Deseja conferir a prova existente?
                            </p>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={() => handleViewExistingExam(duplicateExam.id, duplicateExam.userId)}
                                className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl transition"
                            >
                                Ver Prova Existente
                            </button>
                            {/* Button Removed in Strict Mode */}
                            <button
                                onClick={() => {
                                    setDuplicateExam(null);
                                    setUploading(false);
                                    setProgress(0);
                                }}
                                className="w-full py-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-semibold transition"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Payment Confirmation Modal */}
            {showPaymentInfo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800 animate-in zoom-in-95">
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="w-14 h-14 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-full flex items-center justify-center mb-4">
                                <AlertTriangle className="w-7 h-7" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">
                                Confirmar Pagamento
                            </h3>
                            <p className="text-slate-600 dark:text-slate-300 text-sm">
                                Para visualizar esta prova existente, será necessário utilizar <strong>50 créditos</strong> do seu saldo.
                            </p>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={confirmPaymentAndRedirect}
                                disabled={processingPayment}
                                className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition flex items-center justify-center gap-2"
                            >
                                {processingPayment ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Processando...
                                    </>
                                ) : (
                                    "Sim, Pagar 50 Créditos"
                                )}
                            </button>
                            <button
                                onClick={() => setShowPaymentInfo(null)}
                                disabled={processingPayment}
                                className="w-full py-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-semibold transition"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function SendExamPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div></div>}>
            <SendExamContent />
        </Suspense>
    );
}
