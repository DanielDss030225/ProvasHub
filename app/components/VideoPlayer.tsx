"use client";

import { AlertCircle } from "lucide-react";
import clsx from "clsx";
import { useState } from "react";

interface VideoPlayerProps {
    embedUrl: string;
    title: string;
    className?: string;
}

/**
 * VideoPlayer component for rendering iframe-based videos
 * Supports YouTube, Vimeo, and other embed URLs
 * 
 * Supported formats:
 * - YouTube: https://www.youtube.com/embed/VIDEO_ID
 * - Vimeo: https://player.vimeo.com/video/VIDEO_ID
 */
export function VideoPlayer({ embedUrl, title, className }: VideoPlayerProps) {
    const [hasError, setHasError] = useState(false);

    return (
        <div className={clsx("w-full", className)}>
            <div className="relative w-full overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/10 pb-[56.25%]">
                {hasError ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-900">
                        <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
                        <h3 className="text-lg font-bold text-white mb-2">Erro ao carregar vídeo</h3>
                        <p className="text-sm text-slate-400 mb-4">
                            Não foi possível carregar o vídeo. Verifique se a URL está correta.
                        </p>
                        <p className="text-xs text-slate-500 font-mono break-all">
                            {embedUrl}
                        </p>
                    </div>
                ) : (
                    <iframe
                        src={embedUrl}
                        title={title}
                        className="absolute top-0 left-0 w-full h-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        sandbox="allow-same-origin allow-scripts allow-presentation allow-forms"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                        loading="lazy"
                        onError={() => setHasError(true)}
                    />
                )}
            </div>

            {/* Helper text - Outside the video box */}
            {embedUrl.includes('youtube.com') && !embedUrl.includes('/embed/') && (
                <div className="mt-2 text-xs text-slate-400 text-center">
                    <p className="text-amber-500 font-medium">
                        ⚠️ Use o formato: https://www.youtube.com/embed/VIDEO_ID
                    </p>
                </div>
            )}
        </div>
    );
}
