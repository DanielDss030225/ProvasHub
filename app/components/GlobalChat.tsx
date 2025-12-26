"use client";

import { useAuth } from "../../context/AuthContext";
import { useEffect, useState, useRef } from "react";
import { db } from "../../lib/firebase";
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send } from "lucide-react";
import clsx from "clsx";

interface Message {
    id: string;
    userId: string;
    userName: string;
    userPhoto?: string;
    message: string;
    timestamp: any;
}

export function GlobalChat() {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [sending, setSending] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
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
                                            <span className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
                                                {msg.userName}
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
                                                {renderMessageWithLinks(msg.message)}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input or Login Prompt */}
                        <div className="p-3 border-t border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-800/50">
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
                                        <Send className="w-4 h-4" />
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
