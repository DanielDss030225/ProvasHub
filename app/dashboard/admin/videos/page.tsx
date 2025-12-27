"use client";

import { useAuth } from "../../../../context/AuthContext";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../../lib/firebase";
import { collection, query, orderBy, getDocs, deleteDoc, doc } from "firebase/firestore";
import { Loader2, ArrowLeft, Plus, Edit, Trash2, Eye, EyeOff, Video } from "lucide-react";
import { isAdmin } from "../../../../lib/adminUtils";
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
    difficulty?: 'Básico' | 'Intermediário' | 'Avançado';
    questionIds: string[];
    viewCount: number;
    isPublished: boolean;
    createdAt: any;
}

export default function AdminVideosPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { showAlert } = useAlert();

    const [videos, setVideos] = useState<VideoLesson[]>([]);
    const [loading, setLoading] = useState(true);

    // Check admin access
    useEffect(() => {
        if (!authLoading && (!user || !isAdmin(user.email))) {
            showAlert("Acesso negado. Apenas administradores podem acessar esta página.", "error");
            router.push("/dashboard");
        }
    }, [user, authLoading, router, showAlert]);

    // Fetch all videos (published and unpublished)
    useEffect(() => {
        if (!user || !isAdmin(user.email)) return;

        const fetchVideos = async () => {
            try {
                const videosRef = collection(db, "videoLessons");
                const q = query(videosRef);
                // Removed orderBy to avoid index requirement

                const snapshot = await getDocs(q);
                const videoData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as VideoLesson[];

                // Client-side sorting by createdAt descending
                videoData.sort((a, b) => {
                    const aTime = a.createdAt?.toMillis?.() || 0;
                    const bTime = b.createdAt?.toMillis?.() || 0;
                    return bTime - aTime;
                });

                setVideos(videoData);
            } catch (error) {
                console.error("Error fetching videos:", error);
                showAlert("Erro ao carregar vídeos", "error");
            } finally {
                setLoading(false);
            }
        };

        fetchVideos();
    }, [user, showAlert]);

    const handleDelete = async (videoId: string, title: string) => {
        showAlert(
            `Tem certeza que deseja deletar o vídeo "${title}"?`,
            "warning",
            "Deletar",
            async () => {
                try {
                    await deleteDoc(doc(db, "videoLessons", videoId));
                    setVideos(prev => prev.filter(v => v.id !== videoId));
                    showAlert("Vídeo deletado com sucesso!", "success");
                } catch (error) {
                    console.error("Error deleting video:", error);
                    showAlert("Erro ao deletar vídeo", "error");
                }
            }
        );
    };

    if (authLoading || loading) {
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
                        onClick={() => router.push('/dashboard')}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex flex-col">
                        <h1 className="text-lg md:text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                            <Video className="w-5 h-5 md:w-6 md:h-6 text-violet-500" />
                            Gerenciar Vídeo Aulas
                        </h1>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            {videos.length} {videos.length === 1 ? 'vídeo' : 'vídeos'}
                        </span>
                    </div>
                </div>

                <button
                    onClick={() => router.push('/dashboard/admin/videos/create')}
                    className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl font-bold transition shadow-lg shadow-violet-500/20"
                >
                    <Plus className="w-4 h-4" />
                    <span className="hidden md:inline">Novo Vídeo</span>
                </button>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
                {videos.length > 0 ? (
                    <div className="space-y-4">
                        {videos.map(video => (
                            <div
                                key={video.id}
                                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-shadow"
                            >
                                <div className="flex flex-col md:flex-row gap-6">
                                    {/* Thumbnail */}
                                    <div className="w-full md:w-48 h-28 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl overflow-hidden shrink-0">
                                        {video.thumbnailUrl ? (
                                            <img
                                                src={video.thumbnailUrl}
                                                alt={video.title}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Video className="w-8 h-8 text-white/80" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-4 mb-2">
                                            <h3 className="text-lg font-bold text-slate-800 dark:text-white line-clamp-1">
                                                {video.title}
                                            </h3>

                                            <div className="flex items-center gap-2 shrink-0">
                                                {video.isPublished ? (
                                                    <span className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold rounded-lg">
                                                        <Eye className="w-3 h-3" />
                                                        Publicado
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold rounded-lg">
                                                        <EyeOff className="w-3 h-3" />
                                                        Rascunho
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mb-3">
                                            {video.description}
                                        </p>

                                        <div className="flex flex-wrap gap-2 mb-4">
                                            <span className="px-2 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-xs font-bold rounded">
                                                {video.subject}
                                            </span>
                                            {video.difficulty && (
                                                <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded">
                                                    {video.difficulty}
                                                </span>
                                            )}
                                            <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded">
                                                {video.questionIds.length} questões
                                            </span>
                                            <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded">
                                                {video.viewCount} visualizações
                                            </span>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => router.push(`/dashboard/admin/videos/edit/${video.id}`)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-sm font-bold rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition"
                                            >
                                                <Edit className="w-3.5 h-3.5" />
                                                Editar
                                            </button>

                                            <button
                                                onClick={() => handleDelete(video.id, video.title)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm font-bold rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                Deletar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <Video className="w-16 h-16 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                        <p className="text-lg font-medium text-slate-500 dark:text-slate-400 mb-4">
                            Nenhum vídeo criado ainda
                        </p>
                        <button
                            onClick={() => router.push('/dashboard/admin/videos/create')}
                            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-xl font-bold transition"
                        >
                            <Plus className="w-5 h-5" />
                            Criar Primeiro Vídeo
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}
