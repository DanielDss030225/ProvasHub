"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "../../lib/firebase";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, Timestamp, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { User, Send, MessageSquare, Pencil, Trash2, X, Check } from "lucide-react";
import Image from "next/image";

// Simple helper for time ago formatting
function timeAgo(date: Date) {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " anos atrás";

    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " meses atrás";

    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " dias atrás";

    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " horas atrás";

    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutos atrás";

    return "agora mesmo";
}

interface Comment {
    id: string;
    text: string;
    userId: string;
    displayName: string;
    photoURL: string | null;
    createdAt: Timestamp;
    updatedAt?: Timestamp;
}

interface CommentsSectionProps {
    questionId: string;
}

export function CommentsSection({ questionId }: CommentsSectionProps) {
    const { user } = useAuth();
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState("");
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Edit State
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editedText, setEditedText] = useState("");

    const scrollToBottom = () => {
        if (containerRef.current) {
            containerRef.current.scrollTo({
                top: containerRef.current.scrollHeight,
                behavior: "smooth"
            });
        }
    };

    useEffect(() => {
        if (!questionId) return;

        const q = query(
            collection(db, "questions", questionId, "comments"),
            orderBy("createdAt", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as Comment[];
            setComments(docs);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [questionId]);

    // Initial scroll on load
    useEffect(() => {
        if (!loading && comments.length > 0) {
            scrollToBottom();
        }
    }, [loading]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || !user) return;

        try {
            await addDoc(collection(db, "questions", questionId, "comments"), {
                text: newComment,
                userId: user.uid,
                displayName: user.displayName || "Usuário",
                photoURL: user.photoURL,
                createdAt: serverTimestamp(),
            });
            setNewComment("");
            // Scroll to bottom after adding
            setTimeout(scrollToBottom, 100);
        } catch (error) {
            console.error("Error adding comment:", error);
        }
    };

    const handleDelete = async (commentId: string) => {
        if (!confirm("Tem certeza que deseja excluir este comentário?")) return;
        try {
            await deleteDoc(doc(db, "questions", questionId, "comments", commentId));
        } catch (error) {
            console.error("Error deleting comment:", error);
            alert("Erro ao excluir comentário.");
        }
    };

    const startEditing = (comment: Comment) => {
        setEditingCommentId(comment.id);
        setEditedText(comment.text);
    };

    const cancelEditing = () => {
        setEditingCommentId(null);
        setEditedText("");
    };

    const saveEdit = async (commentId: string) => {
        if (!editedText.trim()) return;
        try {
            await updateDoc(doc(db, "questions", questionId, "comments", commentId), {
                text: editedText,
                updatedAt: serverTimestamp()
            });
            setEditingCommentId(null);
            setEditedText("");
        } catch (error) {
            console.error("Error updating comment:", error);
            alert("Erro ao atualizar comentário.");
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <h3 className="font-semibold text-lg flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                    <MessageSquare className="w-5 h-5" />
                    Comentários
                </h3>
                <span className="text-xs text-zinc-500">{comments.length} comentários</span>
            </div>

            <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[400px]">
                {loading ? (
                    <div className="text-center py-4 text-zinc-500">Carregando comentários...</div>
                ) : comments.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500">
                        <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-20" />
                        <p>Seja o primeiro a comentar!</p>
                    </div>
                ) : (
                    comments.map((comment) => (
                        <div key={comment.id} className="flex gap-3 group">
                            <div className="flex-shrink-0">
                                {comment.photoURL ? (
                                    <Image
                                        src={comment.photoURL}
                                        alt={comment.displayName}
                                        width={32}
                                        height={32}
                                        className="rounded-full object-cover"
                                        unoptimized // simplicity
                                    />
                                ) : (
                                    <div className="w-8 h-8 bg-zinc-200 dark:bg-zinc-800 rounded-full flex items-center justify-center">
                                        <User className="w-4 h-4 text-zinc-500" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-2">
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{comment.displayName}</span>
                                        <span className="text-xs text-zinc-500">
                                            {comment.createdAt ? timeAgo(comment.createdAt.toDate()) : "Enviando..."}
                                            {comment.updatedAt && " (editado)"}
                                        </span>
                                    </div>

                                    {user?.uid === comment.userId && !editingCommentId && (
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => startEditing(comment)}
                                                className="p-1 text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                                title="Editar"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(comment.id)}
                                                className="p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                title="Excluir"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {editingCommentId === comment.id ? (
                                    <div className="mt-2 animate-in fade-in zoom-in-95 duration-200">
                                        <textarea
                                            value={editedText}
                                            onChange={(e) => setEditedText(e.target.value)}
                                            className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none min-h-[80px]"
                                            autoFocus
                                        />
                                        <div className="flex items-center justify-end gap-2 mt-2">
                                            <button
                                                onClick={cancelEditing}
                                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={() => saveEdit(comment.id)}
                                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors shadow-sm"
                                            >
                                                <Check className="w-3.5 h-3.5" />
                                                Salvar
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-1 whitespace-pre-wrap break-words">{comment.text}</p>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                {user ? (
                    <form onSubmit={handleSubmit} className="flex gap-2">
                        <input
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Escreva um comentário..."
                            className="flex-1 bg-zinc-100 dark:bg-zinc-800 border-none rounded-md px-4 py-2 text-sm focus:ring-2 focus:ring-orange-500 dark:text-zinc-100"
                        />
                        <button
                            type="submit"
                            disabled={!newComment.trim()}
                            className="p-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </form>
                ) : (
                    <div className="text-center text-sm text-zinc-500">
                        Faça login para participar da discussão.
                    </div>
                )}
            </div>
        </div>
    );
}
