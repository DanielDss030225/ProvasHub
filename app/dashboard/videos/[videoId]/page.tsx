import { db } from "../../../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import VideoLessonClient from "./VideoLessonClient";
import { Metadata } from "next";

interface PageProps {
    params: Promise<{ videoId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { videoId } = await params;

    try {
        const docRef = doc(db, "videoLessons", videoId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const videoData = docSnap.data();
            const title = videoData.title || "Video Aula";
            const description = videoData.description || "Assista a esta aula no ProvasHub.";

            // Truncate description if too long
            const truncatedDesc = description.length > 150 ? description.substring(0, 150) + "..." : description;

            const images = videoData.thumbnailUrl ? [videoData.thumbnailUrl] : [];

            return {
                title: title,
                description: truncatedDesc,
                openGraph: {
                    title: `${title} | ProvasHub`,
                    description: truncatedDesc,
                    type: 'video.other',
                    images: images,
                },
                twitter: {
                    card: 'summary_large_image',
                    title: `${title} | ProvasHub`,
                    description: truncatedDesc,
                    images: images,
                }
            };
        }
    } catch (error) {
        console.error("Error generating metadata:", error);
    }

    return {
        title: "Video Aula | ProvasHub",
        description: "Assista aulas e resolva questões."
    };
}

export default async function VideoPage({ params }: PageProps) {
    const { videoId } = await params;

    return <VideoLessonClient videoId={videoId} />;
}
