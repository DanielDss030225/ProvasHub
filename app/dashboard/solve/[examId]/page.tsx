import { db } from "../../../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import SolveClient from "./SolveClient";
import { Metadata } from "next";

interface PageProps {
    params: Promise<{ examId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { examId } = await params;

    try {
        const docRef = doc(db, "exams", examId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const examData = docSnap.data();
            const title = examData.extractedData?.title || examData.fileName || "Prova";
            const description = `Resolva a prova: ${title} no ViewGo. Transforme PDFs em questões interativas.`;

            return {
                title: title,
                description: description,
                openGraph: {
                    title: `${title} | ViewGo`,
                    description: description,
                    type: 'article',
                },
                twitter: {
                    card: 'summary_large_image',
                    title: `${title} | ViewGo`,
                    description: description,
                }
            };
        }
    } catch (error) {
        console.error("Error generating metadata:", error);
    }

    return {
        title: "Prova | ViewGo",
        description: "Resolva provas e questões com foco e agilidade no ViewGo."
    };
}

export default async function SolvePage({ params }: PageProps) {
    const { examId } = await params;

    return <SolveClient examId={examId} />;
}
