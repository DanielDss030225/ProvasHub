"use client";

import { useAuth } from "../../../context/AuthContext";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../lib/firebase";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { Loader2, ArrowLeft, Search, Filter, Video, BookOpen } from "lucide-react";
import { VideoCard } from "../../components/VideoCard";

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

export default function VideosPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [videos, setVideos] = useState<VideoLesson[]>([]);
    const [filteredVideos, setFilteredVideos] = useState<VideoLesson[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedSubject, setSelectedSubject] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedDifficulty, setSelectedDifficulty] = useState("");

    // Fetch published videos
    useEffect(() => {
        const fetchVideos = async () => {
            try {
                const videosRef = collection(db, "videoLessons");
                const q = query(
                    videosRef,
                    where("isPublished", "==", true)
                    // Removed orderBy to avoid composite index requirement
                );

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
                setFilteredVideos(videoData);
            } catch (error) {
                console.error("Error fetching videos:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchVideos();
    }, []);

    // Filter videos
    useEffect(() => {
        let filtered = [...videos];

        // Search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(video =>
                video.title.toLowerCase().includes(query) ||
                video.description.toLowerCase().includes(query) ||
                video.subject.toLowerCase().includes(query)
            );
        }

        // Subject filter
        if (selectedSubject) {
            filtered = filtered.filter(video => video.subject === selectedSubject);
        }

        // Category filter
        if (selectedCategory) {
            filtered = filtered.filter(video => video.category === selectedCategory);
        }

        // Difficulty filter
        if (selectedDifficulty) {
            filtered = filtered.filter(video => video.difficulty === selectedDifficulty);
        }

        setFilteredVideos(filtered);
    }, [searchQuery, selectedSubject, selectedCategory, selectedDifficulty, videos]);

    // Get unique subjects and categories
    const subjects = Array.from(new Set(videos.map(v => v.subject))).sort();
    const categories = Array.from(new Set(videos.map(v => v.category).filter(Boolean) as string[])).sort();
    const difficulties = ['Básico', 'Intermediário', 'Avançado'];

    if (authLoading || loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            </div>
        );
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
                            Vídeo Aulas
                        </h1>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            {filteredVideos.length} {filteredVideos.length === 1 ? 'vídeo disponível' : 'vídeos disponíveis'}
                        </span>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
                {/* Filters */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 mb-8 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <Filter className="w-5 h-5 text-violet-500" />
                        <h2 className="font-bold text-slate-800 dark:text-white">Filtros</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar vídeos..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                            />
                        </div>

                        {/* Subject Filter */}
                        <select
                            value={selectedSubject}
                            onChange={(e) => setSelectedSubject(e.target.value)}
                            className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                        >
                            <option value="">Todas as disciplinas</option>
                            {subjects.map(subject => (
                                <option key={subject} value={subject}>{subject}</option>
                            ))}
                        </select>

                        {/* Category Filter */}
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                        >
                            <option value="">Todas as categorias</option>
                            {categories.map(category => (
                                <option key={category} value={category}>{category}</option>
                            ))}
                        </select>

                        {/* Difficulty Filter */}
                        <select
                            value={selectedDifficulty}
                            onChange={(e) => setSelectedDifficulty(e.target.value)}
                            className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                        >
                            <option value="">Todos os níveis</option>
                            {difficulties.map(difficulty => (
                                <option key={difficulty} value={difficulty}>{difficulty}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Videos Grid */}
                {filteredVideos.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredVideos.map(video => (
                            <VideoCard key={video.id} video={video} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <BookOpen className="w-16 h-16 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                        <p className="text-lg font-medium text-slate-500 dark:text-slate-400 mb-2">
                            Nenhum vídeo encontrado
                        </p>
                        <p className="text-sm text-slate-400 dark:text-slate-500">
                            Tente ajustar os filtros ou aguarde novos conteúdos
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}
