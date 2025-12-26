"use client";

import { useAuth } from "../../context/AuthContext";
import { useEffect, useState, useRef } from "react";
import { db } from "../../lib/firebase";
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Edit2, Trash2, Check } from "lucide-react";
import clsx from "clsx";
import { usePathname } from "next/navigation";

interface Message {
    id: string;
    userId: string;
    userName: string;
    userPhoto?: string;
    message: string;
    timestamp: any;
    edited?: boolean;
    editedAt?: any;
}

export function GlobalChat() {
    const pathname = usePathname();
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [sending, setSending] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const lastReadCountRef = useRef(0);

    // Real-time messages listener with LIMIT for performance
    useEffect(() => {
        const q = query(
            collection(db, "globalChat"),
            orderBy("timestamp", "desc"),
            limit(50) // Only load last 50 messages for performance
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs: Message[] = [];
            snapshot.forEach((doc) => {
                msgs.push({ id: doc.id, ...doc.data() } as Message);
            });
            const reversedMsgs = msgs.reverse();
            setMessages(reversedMsgs);

            // Initialize lastReadCountRef on first load
            if (lastReadCountRef.current === 0) {
                lastReadCountRef.current = reversedMsgs.length;
            }

            // Update unread count if chat is closed and new messages arrived
            if (!isOpen && reversedMsgs.length > lastReadCountRef.current) {
                setUnreadCount(reversedMsgs.length - lastReadCountRef.current);
            }
        });

        return () => unsubscribe();
    }, [isOpen]);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isOpen]);

    // Focus input when chat opens and reset unread count
    useEffect(() => {
        if (isOpen) {
            inputRef.current?.focus();
            setUnreadCount(0);
            lastReadCountRef.current = messages.length;
        }
    }, [isOpen, messages.length]);

    // Function to render message with clickable links
    const renderMessageWithLinks = (text: string) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = text.split(urlRegex);

        return parts.map((part, index) => {
            if (part.match(urlRegex)) {
                return (
                    <a
                        key={index}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:opacity-80 transition"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {part}
                    </a>
                );
            }
            return part;
        });
    };

    const handleSend = async () => {
        if (!newMessage.trim() || !user || sending) return;

        // If editing, save edit instead
        if (editingMessageId) {
            handleSaveEdit();
            return;
        }

        setSending(true);
        try {
            await addDoc(collection(db, "globalChat"), {
                userId: user.uid,
                userName: user.displayName || "Anônimo",
                userPhoto: user.photoURL || null,
                message: newMessage.trim(),
                timestamp: serverTimestamp()
            });
            setNewMessage("");
        } catch (error) {
            console.error("Error sending message:", error);
        } finally {
            setSending(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleEdit = (msg: Message) => {
        setEditingMessageId(msg.id);
        setNewMessage(msg.message);
        inputRef.current?.focus();
    };

    const handleSaveEdit = async () => {
        if (!newMessage.trim() || !user || !editingMessageId) return;

        try {
            const messageRef = doc(db, "globalChat", editingMessageId);
            await updateDoc(messageRef, {
                message: newMessage.trim(),
                edited: true,
                editedAt: serverTimestamp()
            });
            setEditingMessageId(null);
            setNewMessage("");
        } catch (error) {
            console.error("Error editing message:", error);
        }
    };

    const handleCancelEdit = () => {
        setEditingMessageId(null);
        setNewMessage("");
    };

    const handleDelete = async (messageId: string) => {
        if (!user) return;
        setDeleteConfirmId(messageId);
    };

    const confirmDelete = async () => {
        if (!deleteConfirmId) return;

        try {
            await deleteDoc(doc(db, "globalChat", deleteConfirmId));
            setDeleteConfirmId(null);
        } catch (error) {
            console.error("Error deleting message:", error);
        }
    };

    const cancelDelete = () => {
        setDeleteConfirmId(null);
    };

    // Hide chat on exam resolution screens
    const hideOnRoutes = [
        '/dashboard/solve',
        '/dashboard/questions-list',
        '/dashboard/questions/solve'
    ];

    const shouldHide = hideOnRoutes.some(route => pathname?.startsWith(route));

    if (shouldHide) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50">
            {/* Chat Window */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ duration: 0.2 }}
                        className="absolute bottom-16 right-0 w-80 h-96 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/50 dark:border-slate-700/50 flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="p-3 border-b border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between bg-white/50 dark:bg-slate-800/50">
                            <div className="flex items-center gap-2">
                                <MessageCircle className="w-4 h-4 text-violet-600" />
                                <h3 className="font-bold text-sm text-slate-800 dark:text-white">Chat Global</h3>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                            >
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                            {messages.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                                    Nenhuma mensagem ainda
                                </div>
                            ) : (
                                messages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={clsx(
                                            "flex gap-2 items-start",
                                            user && msg.userId === user.uid && "flex-row-reverse"
                                        )}
                                    >
                                        {msg.userPhoto ? (
                                            <img
                                                src={msg.userPhoto}
                                                alt={msg.userName}
                                                className="w-6 h-6 rounded-full shrink-0"
                                            />
                                        ) : (
                                            <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                                                <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400">
                                                    {msg.userName.charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                        )}
                                        <div
                                            className={clsx(
                                                "flex flex-col max-w-[70%]",
                                                user && msg.userId === user.uid && "items-end"
                                            )}
                                        >
                                            <span className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5 flex items-center gap-1">
                                                {msg.userName}
                                                {msg.edited && <span className="text-[9px] italic">(editada)</span>}
                                            </span>
                                            <div
                                                className={clsx(
                                                    "px-3 py-1.5 rounded-xl text-sm break-words overflow-wrap-anywhere",
                                                    user && msg.userId === user.uid
                                                        ? "bg-violet-600 text-white"
                                                        : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                                                )}
                                                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                                            >
                                                <div className="flex items-start gap-2 justify-between">
                                                    <span className="flex-1">{renderMessageWithLinks(msg.message)}</span>
                                                    {user && msg.userId === user.uid && (
                                                        <div className="flex gap-1 shrink-0">
                                                            <button
                                                                onClick={() => handleEdit(msg)}
                                                                className="p-1 hover:bg-white/20 dark:hover:bg-slate-700/50 rounded transition"
                                                                title="Editar"
                                                            >
                                                                <Edit2 className="w-3 h-3" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(msg.id)}
                                                                className="p-1 hover:bg-white/20 dark:hover:bg-slate-700/50 rounded transition"
                                                                title="Excluir"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input or Login Prompt */}
                        <div className="p-3 border-t border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-800/50">
                            {editingMessageId && (
                                <div className="mb-2 px-3 py-2 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Edit2 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                                        <span className="text-sm text-violet-700 dark:text-violet-300 font-medium">Editando mensagem</span>
                                    </div>
                                    <button
                                        onClick={handleCancelEdit}
                                        className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            )}
                            {user ? (
                                <div className="flex gap-2">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        onKeyPress={handleKeyPress}
                                        placeholder="Digite sua mensagem..."
                                        className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-800 dark:text-white placeholder:text-slate-400"
                                        maxLength={200}
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={!newMessage.trim() || sending}
                                        className="p-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {editingMessageId ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center py-2">
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                        Faça login para enviar mensagens
                                    </p>
                                    <button
                                        onClick={() => window.location.href = '/'}
                                        className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition"
                                    >
                                        Fazer Login
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {deleteConfirmId && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60]"
                        onClick={cancelDelete}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 max-w-sm mx-4 border border-slate-200 dark:border-slate-700"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                    <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">Excluir mensagem</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Esta ação não pode ser desfeita</p>
                                </div>
                            </div>
                            <p className="text-slate-700 dark:text-slate-300 mb-6">
                                Tem certeza que deseja excluir esta mensagem? Ela será removida permanentemente do chat.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={cancelDelete}
                                    className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition"
                                >
                                    Excluir
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating Button */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsOpen(!isOpen)}
                className="relative w-14 h-14 bg-violet-600 hover:bg-violet-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
            >
                {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}

                {/* Unread Badge */}
                {!isOpen && unreadCount > 0 && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-lg"
                    >
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </motion.div>
                )}
            </motion.button>
        </div>
    );
}
