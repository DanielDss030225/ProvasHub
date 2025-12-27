"use client";

import { Play, Clock, Eye, BookOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

interface VideoCardProps {
    video: {
        id: string;
        title: string;
        description: string;
        thumbnailUrl?: string;
        duration?: string;
        subject: string;
        difficulty?: 'Básico' | 'Intermediário' | 'Avançado';
        viewCount: number;
        questionIds: string[];
    };
}

const difficultyColors = {
    'Básico': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'Intermediário': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    'Avançado': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export function VideoCard({ video }: VideoCardProps) {
    const router = useRouter();

    return (
        <div
            onClick={() => router.push(`/dashboard/videos/${video.id}`)}
            className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-[1.02]"
        >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-gradient-to-br from-violet-500 to-purple-600 overflow-hidden">
                {video.thumbnailUrl ? (
                    <img
                        src={video.thumbnailUrl}
                        alt={video.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Play className="w-16 h-16 text-white/80" />
                    </div>
                )}

                {/* Duration Badge */}
                {video.duration && (
                    <div className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-white" />
                        <span className="text-xs font-bold text-white">{video.duration}</span>
                    </div>
                )}

                {/* Play Overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-white/0 group-hover:bg-white/90 flex items-center justify-center transition-all duration-300 scale-0 group-hover:scale-100">
                        <Play className="w-8 h-8 text-violet-600 ml-1" />
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-5 space-y-3">
                {/* Title */}
                <h3 className="font-bold text-lg text-slate-800 dark:text-white line-clamp-2 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                    {video.title}
                </h3>

                {/* Description */}
                <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                    {video.description}
                </p>

                {/* Metadata */}
                <div className="flex flex-wrap gap-2 items-center">
                    <span className="px-2 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-xs font-bold rounded-lg">
                        {video.subject}
                    </span>

                    {video.difficulty && (
                        <span className={clsx("px-2 py-1 text-xs font-bold rounded-lg", difficultyColors[video.difficulty])}>
                            {video.difficulty}
                        </span>
                    )}

                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <Eye className="w-3 h-3" />
                        <span>{video.viewCount}</span>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <BookOpen className="w-3 h-3" />
                        <span>{video.questionIds.length} questões</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
