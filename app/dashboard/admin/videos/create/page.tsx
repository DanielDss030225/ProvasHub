"use client";

import { useAuth } from "../../../../../context/AuthContext";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { db } from "../../../../../lib/firebase";
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { Loader2, ArrowLeft, Save, Eye, Link as LinkIcon, X, Plus, Search } from "lucide-react";
import { isAdmin, extractQuestionId } from "../../../../../lib/adminUtils";
import { useAlert } from "../../../../context/AlertContext";
import { VideoPlayer } from "../../../../components/VideoPlayer";
import clsx from "clsx";

interface Question {
    id: string;
    text: string;
    disciplina: string;
    banca: string;
    ano: number;
}

export default function CreateEditVideoPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const params = useParams();
    const { showAlert } = useAlert();
    const videoId = params?.videoId as string;
    const isEditMode = !!videoId;

    // Form state
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [embedUrl, setEmbedUrl] = useState("");
    const [thumbnailUrl, setThumbnailUrl] = useState("");
    const [duration, setDuration] = useState("");
    const [subject, setSubject] = useState("");
    const [category, setCategory] = useState("");
    const [difficulty, setDifficulty] = useState<'Básico' | 'Intermediário' | 'Avançado' | ''>('');
    const [transcript, setTranscript] = useState("");
    const [isPublished, setIsPublished] = useState(false);

    // Question management
    const [questionLinks, setQuestionLinks] = useState<string[]>(['']);
    const [selectedQuestions, setSelectedQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingVideo, setLoadingVideo] = useState(false);

    // Check admin access
    useEffect(() => {
        if (!authLoading && (!user || !isAdmin(user.email))) {
            showAlert("Acesso negado. Apenas administradores podem acessar esta página.", "error");
            router.push("/dashboard");
        }
    }, [user, authLoading, router, showAlert]);

    // Load video data if editing
    useEffect(() => {
        if (!isEditMode || !user || !isAdmin(user.email)) return;

        const loadVideo = async () => {
            setLoadingVideo(true);
            try {
                const videoDoc = await getDoc(doc(db, "videoLessons", videoId));

                if (!videoDoc.exists()) {
                    showAlert("Vídeo não encontrado", "error");
                    router.push("/dashboard/admin/videos");
                    return;
                }

                const data = videoDoc.data();
                setTitle(data.title || "");
                setDescription(data.description || "");
                setEmbedUrl(data.embedUrl || "");
                setThumbnailUrl(data.thumbnailUrl || "");
                setDuration(data.duration || "");
                setSubject(data.subject || "");
                setCategory(data.category || "");
                setDifficulty(data.difficulty || "");
                setTranscript(data.transcript || "");
                setIsPublished(data.isPublished || false);

                // Load questions
                if (data.questionIds && data.questionIds.length > 0) {
                    const questionPromises = data.questionIds.map((qId: string) =>
                        getDoc(doc(db, "questions", qId))
                    );

                    const questionDocs = await Promise.all(questionPromises);
                    const questions = questionDocs
                        .filter(doc => doc.exists())
                        .map(doc => ({ id: doc.id, ...doc.data() } as Question));

                    setSelectedQuestions(questions);
                    setQuestionLinks(data.questionIds.map((id: string) =>
                        `${window.location.origin}/dashboard/questions/solve?id=${id}`
                    ));
                }
            } catch (error) {
                console.error("Error loading video:", error);
                showAlert("Erro ao carregar vídeo", "error");
            } finally {
                setLoadingVideo(false);
            }
        };

        loadVideo();
    }, [isEditMode, videoId, user, router, showAlert]);

    const handleAddQuestionLink = () => {
        if (questionLinks.length < 5) {
            setQuestionLinks([...questionLinks, '']);
        }
    };

    const handleRemoveQuestionLink = (index: number) => {
        setQuestionLinks(questionLinks.filter((_, i) => i !== index));
    };

    const handleQuestionLinkChange = (index: number, value: string) => {
        const newLinks = [...questionLinks];
        newLinks[index] = value;
        setQuestionLinks(newLinks);
    };

    const handleLoadQuestions = async () => {
        const questionIds = questionLinks
            .map(link => extractQuestionId(link))
            .filter((id): id is string => id !== null && id.length > 0);

        if (questionIds.length === 0) {
            showAlert("Nenhum link de questão válido encontrado", "error");
            return;
        }

        if (questionIds.length > 5) {
            showAlert("Máximo de 5 questões permitidas", "error");
            return;
        }

        try {
            const questionPromises = questionIds.map(qId =>
                getDoc(doc(db, "questions", qId))
            );

            const questionDocs = await Promise.all(questionPromises);
            const questions = questionDocs
                .filter(doc => doc.exists())
                .map(doc => ({ id: doc.id, ...doc.data() } as Question));

            if (questions.length === 0) {
                showAlert("Nenhuma questão encontrada com os IDs fornecidos", "error");
                return;
            }

            setSelectedQuestions(questions);
            showAlert(`${questions.length} questões carregadas com sucesso!`, "success");
        } catch (error) {
            console.error("Error loading questions:", error);
            showAlert("Erro ao carregar questões", "error");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!title || !description || !embedUrl || !subject) {
            showAlert("Preencha todos os campos obrigatórios", "error");
            return;
        }

        if (selectedQuestions.length === 0) {
            showAlert("Adicione pelo menos 1 questão ao vídeo", "error");
            return;
        }

        setLoading(true);

        try {
            const videoData = {
                title,
                description,
                embedUrl,
                thumbnailUrl: thumbnailUrl || null,
                duration: duration || null,
                subject,
                category: category || null,
                difficulty: difficulty || null,
                transcript: transcript || null,
                questionIds: selectedQuestions.map(q => q.id),
                isPublished,
                updatedAt: serverTimestamp(),
            };

            if (isEditMode) {
                await updateDoc(doc(db, "videoLessons", videoId), videoData);
                showAlert("Vídeo atualizado com sucesso!", "success");
            } else {
                await addDoc(collection(db, "videoLessons"), {
                    ...videoData,
                    createdBy: user!.uid,
                    createdByEmail: user!.email,
                    createdAt: serverTimestamp(),
                    viewCount: 0,
                });
                showAlert("Vídeo criado com sucesso!", "success");
            }

            router.push("/dashboard/admin/videos");
        } catch (error) {
            console.error("Error saving video:", error);
            showAlert("Erro ao salvar vídeo", "error");
        } finally {
            setLoading(false);
        }
    };

    if (authLoading || loadingVideo) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            </div>
        );
    }

    if (!user || !isAdmin(user.email)) {
        return null;
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* Header */}
            <header className="h-16 sticky top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 md:px-6 shadow-sm">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push('/dashboard/admin/videos')}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-lg md:text-xl font-black text-slate-800 dark:text-white">
                        {isEditMode ? 'Editar Vídeo' : 'Novo Vídeo'}
                    </h1>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-4xl mx-auto px-4 md:px-8 py-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Video Preview */}
                    {embedUrl && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Preview do Vídeo</h2>
                            <VideoPlayer embedUrl={embedUrl} title={title || "Preview"} />
                        </div>
                    )}

                    {/* Basic Info */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
                        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Informações Básicas</h2>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                URL do Iframe (Embed) *
                            </label>
                            <input
                                type="text"
                                value={embedUrl}
                                onChange={(e) => setEmbedUrl(e.target.value)}
                                placeholder="https://www.youtube.com/embed/VIDEO_ID ou https://player.vimeo.com/video/VIDEO_ID"
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                required
                            />
                            <p className="text-xs text-slate-500 mt-1">Cole a URL de embed do YouTube, Vimeo ou outra plataforma</p>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                Título *
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Ex: Introdução à Matemática Básica"
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                Descrição *
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Descreva o conteúdo do vídeo..."
                                rows={4}
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none resize-none"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                    Disciplina *
                                </label>
                                <input
                                    type="text"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="Ex: Matemática"
                                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                    Categoria
                                </label>
                                <input
                                    type="text"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    placeholder="Ex: Álgebra"
                                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                    Duração
                                </label>
                                <input
                                    type="text"
                                    value={duration}
                                    onChange={(e) => setDuration(e.target.value)}
                                    placeholder="Ex: 15:30"
                                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                    Dificuldade
                                </label>
                                <select
                                    value={difficulty}
                                    onChange={(e) => setDifficulty(e.target.value as any)}
                                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                >
                                    <option value="">Selecione...</option>
                                    <option value="Básico">Básico</option>
                                    <option value="Intermediário">Intermediário</option>
                                    <option value="Avançado">Avançado</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                URL da Thumbnail
                            </label>
                            <input
                                type="text"
                                value={thumbnailUrl}
                                onChange={(e) => setThumbnailUrl(e.target.value)}
                                placeholder="https://exemplo.com/thumbnail.jpg"
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                Transcrição / Legenda
                            </label>
                            <textarea
                                value={transcript}
                                onChange={(e) => setTranscript(e.target.value)}
                                placeholder="Cole aqui a transcrição do vídeo..."
                                rows={6}
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none resize-none font-mono"
                            />
                        </div>
                    </div>

                    {/* Questions */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                                Questões Associadas (1-5) *
                            </h2>
                            <button
                                type="button"
                                onClick={handleLoadQuestions}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition"
                            >
                                <Search className="w-4 h-4" />
                                Carregar Questões
                            </button>
                        </div>

                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Cole os links das questões abaixo. O sistema irá extrair os IDs e carregar as questões.
                        </p>

                        <div className="space-y-3">
                            {questionLinks.map((link, index) => (
                                <div key={index} className="flex gap-2">
                                    <div className="flex-1 relative">
                                        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={link}
                                            onChange={(e) => handleQuestionLinkChange(index, e.target.value)}
                                            placeholder={`Link da questão ${index + 1} (ex: .../questions/solve?id=ABC123)`}
                                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                        />
                                    </div>
                                    {questionLinks.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveQuestionLink(index)}
                                            className="px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {questionLinks.length < 5 && (
                            <button
                                type="button"
                                onClick={handleAddQuestionLink}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                            >
                                <Plus className="w-4 h-4" />
                                Adicionar Link
                            </button>
                        )}

                        {/* Selected Questions Preview */}
                        {selectedQuestions.length > 0 && (
                            <div className="mt-6 space-y-3">
                                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                    Questões Carregadas ({selectedQuestions.length})
                                </h3>
                                {selectedQuestions.map((question, index) => (
                                    <div
                                        key={question.id}
                                        className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-xs font-bold rounded">
                                                        Q{index + 1}
                                                    </span>
                                                    <span className="text-xs text-slate-500">{question.disciplina}</span>
                                                    <span className="text-xs text-slate-500">•</span>
                                                    <span className="text-xs text-slate-500">{question.banca}</span>
                                                    <span className="text-xs text-slate-500">•</span>
                                                    <span className="text-xs text-slate-500">{question.ano}</span>
                                                </div>
                                                <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
                                                    {question.text}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Publish Toggle */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isPublished}
                                onChange={(e) => setIsPublished(e.target.checked)}
                                className="w-5 h-5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                            />
                            <div>
                                <span className="text-sm font-bold text-slate-800 dark:text-white block">
                                    Publicar vídeo
                                </span>
                                <span className="text-xs text-slate-500">
                                    Vídeos publicados ficam visíveis para todos os usuários
                                </span>
                            </div>
                        </label>
                    </div>

                    {/* Submit Button */}
                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={() => router.push('/dashboard/admin/videos')}
                            className="flex-1 px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Salvando...
                                </>
                            ) : (
                                <>
                                    <Save className="w-5 h-5" />
                                    {isEditMode ? 'Atualizar Vídeo' : 'Criar Vídeo'}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </main>
        </div>
    );
}
