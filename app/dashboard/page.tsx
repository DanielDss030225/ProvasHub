"use client";

import { useAuth } from "../../context/AuthContext";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth, db, storage } from "../../lib/firebase";
import { updateProfile, signOut } from "firebase/auth";
import { collection, addDoc, query, where, getDocs, orderBy, Timestamp, updateDoc, arrayUnion, arrayRemove, increment, doc, onSnapshot, runTransaction, getDoc, deleteDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { motion, Variants } from "framer-motion";

import { Loader2, Upload, FileText, AlertCircle, LogOut, User, Edit, X, Search, Heart, Share2, Coins, Bell, Check, Trash2, CircleDollarSign, Target, Menu, BookOpen, Play } from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";
import { FormattedText } from "../components/FormattedText";
import { ImageCropper } from "../components/ImageCropper";
import { getImageDimensions } from "../../lib/imageUtils";
import { useAlert } from "../context/AlertContext";
import clsx from "clsx";

// Animation Variants defined outside component for better performance and type stability
const containerVariants: any = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
            delayChildren: 0.1
        }
    }
};

const itemVariants: any = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } }
};

const headerVariants: any = {
    hidden: { opacity: 0, y: -20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } }
};

const sidebarVariants: any = {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } }
};

export default function Dashboard() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [exams, setExams] = useState<any[]>([]);
    const [selectedExam, setSelectedExam] = useState<any>(null); // For owner modal
    const [confirmingSolveExam, setConfirmingSolveExam] = useState<any>(null); // For non-owner confirmation
    const [processingPayment, setProcessingPayment] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Profile State
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const { showAlert } = useAlert();
    const [profileName, setProfileName] = useState("");
    const [profilePhoto, setProfilePhoto] = useState("");
    const [updatingProfile, setUpdatingProfile] = useState(false);
    const [imageUploadProgress, setImageUploadProgress] = useState(0);
    const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);

    // Search State
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Credits Info Modal State
    const [isCreditsModalOpen, setIsCreditsModalOpen] = useState(false);

    // Exam Requests System
    const [examRequests, setExamRequests] = useState<any[]>([]);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [pendingExam, setPendingExam] = useState<{ id: string, title: string, userId: string } | null>(null);



    const handleDeleteRequest = async (e: React.MouseEvent, requestId: string) => {
        e.stopPropagation();
        if (!confirm("Tem certeza que deseja excluir este pedido?")) return;

        try {
            await deleteDoc(doc(db, "exam_requests", requestId));
            setExamRequests(prev => prev.filter(req => req.id !== requestId));
            showAlert("Pedido excluído com sucesso!", "success", "Sucesso");
        } catch (error) {
            console.error("Error deleting request:", error);
            showAlert("Erro ao excluir pedido.", "error", "Erro");
        }
    };

    const handleAcceptFulfillment = async (notification: any) => {
        if (!notification.data?.requestId || !notification.data?.examId || !notification.data?.fulfillerId) return;

        try {
            await runTransaction(db, async (transaction) => {
                const requestRef = doc(db, "exam_requests", notification.data.requestId);
                const fulfillerRef = doc(db, "users", notification.data.fulfillerId);
                const notificationDocRef = doc(db, "notifications", notification.id);
                const examRef = doc(db, "exams", notification.data.examId);

                // READS FIRST
                const requestSnap = await transaction.get(requestRef);
                const fulfillerSnap = await transaction.get(fulfillerRef);

                if (!requestSnap.exists()) throw new Error("Request not found");

                // Verify if still pending
                if (requestSnap.data().status !== "pending_approval") {
                    throw new Error("Request already handled or status changed.");
                }

                // WRITES AFTER ALL READS
                // 1. Mark Request as Fulfilled
                transaction.update(requestRef, {
                    status: "fulfilled",
                    fulfilledAt: Timestamp.now(),
                    examId: notification.data.examId
                });

                // 2. Mark Exam as Ready/Verified
                transaction.update(examRef, {
                    status: "ready",
                    creditsAwarded: false
                });

                // 3. Award Credits to Fulfiller
                if (fulfillerSnap.exists()) {
                    transaction.update(fulfillerRef, {
                        credits: increment(100)
                    });
                } else {
                    // Fallback create if somehow missing (rare)
                    // transaction.set(fulfillerRef, { ... });
                }

                // 4. Create Notification for Fulfiller
                const fulfillerNotifRef = doc(collection(db, "notifications"));
                transaction.set(fulfillerNotifRef, {
                    userId: notification.data.fulfillerId,
                    type: "fulfillment_accepted",
                    title: "Créditos Recebidos!",
                    message: `Seu envio para o pedido "${requestSnap.data().subject}" foi aceito! Você ganhou +100 créditos.`,
                    read: false,
                    createdAt: Timestamp.now()
                });

                // 5. Mark THIS notification as read & handled
                transaction.update(notificationDocRef, {
                    read: true,
                    "data.accepted": true
                });
            });

            // showAlert("Prova aceita! Créditos enviados ao usuário.", "success", "Sucesso");
            // setIsNotificationsOpen(false);

        } catch (error: any) {
            console.error("Acceptance failed", error);
            showAlert("Erro ao aceitar: " + error.message, "error", "Erro");
        }
    };

    const handleRejectFulfillment = async (notification: any) => {
        if (!notification.data?.requestId || !notification.data?.fulfillerId) return;

        try {
            await runTransaction(db, async (transaction) => {
                const requestRef = doc(db, "exam_requests", notification.data.requestId);
                const notificationDocRef = doc(db, "notifications", notification.id);
                // We might want to notify the fulfiller
                const fulfillerNotifRef = doc(collection(db, "notifications"));

                const requestSnap = await transaction.get(requestRef);
                if (!requestSnap.exists()) throw new Error("Request not found");

                if (requestSnap.data().status !== "pending_approval") {
                    throw new Error("Request status invalid for rejection.");
                }

                // 1. Revert Request to Open
                transaction.update(requestRef, {
                    status: "open",
                    examId: null, // Unlink the exam
                    // fulfilledAt? probably fine to leave or ignore
                });

                // 2. Mark this notification as read/rejected
                transaction.update(notificationDocRef, {
                    read: true,
                    "data.rejected": true
                });

                // 3. Notify Fulfiller
                transaction.set(fulfillerNotifRef, {
                    userId: notification.data.fulfillerId,
                    type: "fulfillment_rejected",
                    title: "Envio Recusado",
                    message: `Seu envio para o pedido "${requestSnap.data().subject}" foi recusado pelo solicitante.`,
                    read: false,
                    createdAt: Timestamp.now()
                });
            });

            // showAlert("Envio recusado. O pedido voltou para 'Aberto'.", "info", "Recusado");
            // No alert needed if we update UI in place, but user might want feedback.
            // Based on "Accept", we kept dropdown open.
        } catch (error: any) {
            console.error("Rejection failed", error);
            showAlert("Erro ao recusar: " + error.message, "error", "Erro");
        }
    };

    const handleMarkAsRead = async (notificationId: string) => {
        try {
            await updateDoc(doc(db, "notifications", notificationId), {
                read: true
            });
        } catch (error) {
            console.error("Error marking as read", error);
        }
    };

    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [requestSubject, setRequestSubject] = useState("");
    const [requestDescription, setRequestDescription] = useState("");
    const [creatingRequest, setCreatingRequest] = useState(false);
    const [fulfillmentRequestId, setFulfillmentRequestId] = useState<string | null>(null);

    // Filtered Exams
    const filteredExams = exams.filter(exam => {
        const queryNormalized = searchQuery.toLowerCase().trim();
        if (!queryNormalized) return true;

        const tokens = queryNormalized.split(/\s+/).filter(Boolean);
        const searchableText = [
            exam.extractedData?.title,
            exam.fileName,
            exam.extractedData?.course,
            exam.extractedData?.description,
            exam.extractedData?.metadata?.concurso,
            exam.extractedData?.metadata?.banca,
            exam.extractedData?.metadata?.cargo
        ].filter(Boolean).join(" ").toLowerCase();

        return tokens.every(token => searchableText.includes(token));
    });

    const [userCredits, setUserCredits] = useState<number | null>(null);

    // User Performance Stats
    const [userStats, setUserStats] = useState<{
        total: number;
        correct: number;
        incorrect: number;
        accuracy: number;
    }>({ total: 0, correct: 0, incorrect: 0, accuracy: 0 });
    const [loadingStats, setLoadingStats] = useState(false);

    // Notification State
    const [notifications, setNotifications] = useState<any[]>([]);
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [isMobileNotificationsOpen, setIsMobileNotificationsOpen] = useState(false);
    const notificationRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!loading && !user) {
            router.push("/");
        } else if (user) {
            setProfileName(user.displayName || "");
            setProfilePhoto(user.photoURL || "");
            fetchExams();
            fetchRequests();

            // Check for pending exam from landing page
            const pendingId = localStorage.getItem('pending_exam_id');
            const pendingTitle = localStorage.getItem('pending_exam_title');
            const pendingUserId = localStorage.getItem('pending_exam_user_id');
            if (pendingId && pendingTitle) {
                setPendingExam({ id: pendingId, title: pendingTitle, userId: pendingUserId || "" });
            }

            // Subscribe to user credits
            const userRef = doc(db, "users", user.uid);
            const unsubscribe = onSnapshot(userRef, (doc) => {
                if (doc.exists()) {
                    setUserCredits(doc.data().credits || 0);
                } else {
                    // Handle missing user doc case if needed
                    setUserCredits(0);
                }
            });
            return () => unsubscribe();
        }
    }, [user, loading, router]);

    // Fetch stats when profile modal opens
    useEffect(() => {
        if (isProfileModalOpen && user) {
            fetchUserStats();
        }
    }, [isProfileModalOpen, user]);

    // Subscribe to Notifications
    useEffect(() => {
        if (!user) return;
        const q = query(
            collection(db, "notifications"),
            where("userId", "==", user.uid)
            // orderBy("createdAt", "desc") -- REMOVED to avoid index requirement
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Client-side sort
            notifs.sort((a: any, b: any) => {
                return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
            });
            setNotifications(notifs);
        });
        return () => unsubscribe();
    }, [user]);

    // Fetch user performance stats
    const fetchUserStats = async () => {
        if (!user) return;
        setLoadingStats(true);
        try {
            const attemptsRef = collection(db, "users", user.uid, "questionAttempts");
            const snapshot = await getDocs(attemptsRef);

            let correct = 0;
            let total = snapshot.size;

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.isCorrect) {
                    correct++;
                }
            });

            const incorrect = total - correct;
            const accuracy = total > 0 ? (correct / total) * 100 : 0;

            setUserStats({ total, correct, incorrect, accuracy });
        } catch (error) {
            console.error("Error fetching user stats:", error);
        } finally {
            setLoadingStats(false);
        }
    };

    const renderNotificationsList = () => {
        if (notifications.length === 0) {
            return <div className="p-8 text-center text-slate-500 text-sm">Nenhuma notificação recente.</div>;
        }

        return notifications.map(notif => (
            <div key={notif.id} className={clsx(
                "p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition",
                !notif.read && "bg-violet-50/50 dark:bg-violet-900/10"
            )}>
                <div className="flex justify-between items-start gap-3">
                    <div className="flex-1">
                        <h4 className="font-bold text-sm text-slate-800 dark:text-white mb-1">{notif.title}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">{notif.message}</p>

                        {notif.type === "fulfillment_approval_needed" && (
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            setIsNotificationsOpen(false);
                                            setIsMobileNotificationsOpen(false);
                                            router.push(`/dashboard/solve/${notif.data.examId}`);
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                                    >
                                        <FileText className="w-3 h-3" />
                                        Analisar
                                    </button>

                                    {!notif.data?.accepted && !notif.data?.rejected ? (
                                        <>
                                            <button
                                                onClick={() => handleAcceptFulfillment(notif)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-bold rounded-lg hover:bg-violet-700 transition"
                                            >
                                                <Check className="w-3 h-3" />
                                                Aceitar
                                            </button>
                                            <button
                                                onClick={() => handleRejectFulfillment(notif)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-bold rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition"
                                            >
                                                <X className="w-3 h-3" />
                                                Recusar
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            {notif.data?.accepted && (
                                                <span className="text-green-600 font-bold text-xs select-none px-1">
                                                    Prova aceita
                                                </span>
                                            )}
                                            {notif.data?.rejected && (
                                                <span className="text-red-500 font-bold text-xs select-none px-1">
                                                    Prova recusada
                                                </span>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {notif.type === "fulfillment_accepted" && !notif.read && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleMarkAsRead(notif.id)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition"
                                >
                                    <Check className="w-3 h-3" />
                                    Marcar como Lido
                                </button>
                            </div>
                        )}
                    </div>
                    {!notif.read && notif.type !== "fulfillment_accepted" && (
                        <button onClick={() => handleMarkAsRead(notif.id)} className="text-slate-400 hover:text-violet-600 transition" title="Marcar como lida">
                            <div className="w-2 h-2 bg-violet-500 rounded-full"></div>
                        </button>
                    )}
                </div>
            </div>
        ));
    };

    // Close notifications when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
                setIsNotificationsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const fetchRequests = async () => {
        try {
            const q = query(
                collection(db, "exam_requests"),
                where("status", "==", "open")
            );
            const snapshot = await getDocs(q);
            const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Client-side sort to avoid missing index error
            requests.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setExamRequests(requests);
        } catch (e) {
            console.error("Error fetching requests", e);
        }
    };

    const handleCreateRequest = async () => {
        if (!user || !requestSubject || !requestDescription) return;
        setCreatingRequest(true);
        try {
            await addDoc(collection(db, "exam_requests"), {
                requesterId: user.uid,
                requesterName: user.displayName || "Usuário",
                requesterPhoto: user.photoURL || null,
                subject: requestSubject,
                description: requestDescription,
                status: "open",
                createdAt: Timestamp.now()
            });
            showAlert("Pedido enviado com sucesso!", "success", "Sucesso");
            setIsRequestModalOpen(false);
            setRequestSubject("");
            setRequestDescription("");
            fetchRequests();
        } catch (e: any) {
            console.error(e);
            showAlert("Erro ao criar pedido: " + e.message, "error", "Erro");
        } finally {
            setCreatingRequest(false);
        }
    };

    const handleFulfillRequest = (requestId: string) => {
        router.push(`/dashboard/send-exam?requestId=${requestId}`);
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            router.push("/");
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const handleUpdateProfile = async () => {
        if (!user) return;
        setUpdatingProfile(true);
        try {
            await updateProfile(user, {
                displayName: profileName,
                photoURL: profilePhoto
            });
            setIsProfileModalOpen(false);
            // Optional: Reload exams to reflect new info if we needed to, but handled mostly client side for display
        } catch (e: any) {
            console.error("Profile update failed", e);
            showAlert("Erro ao atualizar perfil: " + e.message, "error", "Erro ao Atualizar");
        } finally {
            setUpdatingProfile(false);
        }
    };

    // Like & Share
    const handleLike = async (e: React.MouseEvent, exam: any) => {
        e.stopPropagation();
        if (!user) return;

        const isLiked = exam.likedBy?.includes(user.uid);
        const examRef = doc(db, "exams", exam.id);

        try {
            // Optimistic UI Update
            setExams(prev => prev.map(ex => {
                if (ex.id === exam.id) {
                    const newLikedBy = isLiked
                        ? ex.likedBy?.filter((id: string) => id !== user.uid)
                        : [...(ex.likedBy || []), user.uid];
                    return { ...ex, likedBy: newLikedBy };
                }
                return ex;
            }));

            if (isLiked) {
                await updateDoc(examRef, {
                    likedBy: arrayRemove(user.uid)
                });
            } else {
                await updateDoc(examRef, {
                    likedBy: arrayUnion(user.uid)
                });
            }
        } catch (error) {
            console.error("Error liking exam:", error);
            // Revert on error could be added here
        }
    };

    const handleDeleteExam = async (exam: any) => {
        if (!user || user.uid !== exam.userId) return;

        showAlert(
            "Tem certeza que deseja excluir esta prova e todas as suas questões do banco? Esta ação não pode ser desfeita.",
            "warning",
            "Excluir Prova",
            async () => {
                try {
                    // 1. Delete the exam document
                    await deleteDoc(doc(db, "exams", exam.id));

                    // 2. Delete all corresponding questions from the question bank
                    const q = query(collection(db, "questions"), where("examId", "==", exam.id));
                    const snapshot = await getDocs(q);

                    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
                    await Promise.all(deletePromises);

                    // Optional: Delete from storage if you have the path, but Firestore is main
                    setSelectedExam(null);
                    setExams(prev => prev.filter(e => e.id !== exam.id));
                    showAlert("Prova e questões excluídas com sucesso!", "success", "Sucesso");
                } catch (error) {
                    console.error("Error deleting exam and questions:", error);
                    showAlert("Erro ao excluir prova.", "error", "Erro");
                }
            }
        );
    };

    const handleShare = (e: React.MouseEvent, examId: string) => {
        e.stopPropagation();
        const url = `${window.location.origin}/dashboard/solve/${examId}`;
        navigator.clipboard.writeText(url).then(() => {
            showAlert("Link copiado para a área de transferência!", "success", "Compartilhar");
        }).catch(() => {
            showAlert("Erro ao copiar link.", "error", "Erro");
        });
    };

    const uploadImage = async (fileOrBlob: File | Blob) => {
        if (!user) return;
        setUpdatingProfile(true);
        setImageUploadProgress(0);

        try {
            const fileName = `profile_${Date.now()}.jpg`;
            const storageRef = ref(storage, `profile_photos/${user.uid}/${fileName}`);
            const uploadTask = uploadBytesResumable(storageRef, fileOrBlob);

            uploadTask.on('state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setImageUploadProgress(progress);
                },
                (error) => {
                    console.error("Error uploading image:", error);
                    showAlert("Erro ao enviar imagem: " + error.message, "error", "Erro no Upload");
                    setUpdatingProfile(false);
                },
                async () => {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    setProfilePhoto(downloadURL);
                    setUpdatingProfile(false);
                    setImageUploadProgress(0);
                    setTempImageSrc(null); // Clear cropper state if any
                }
            );

        } catch (error: any) {
            console.error("Error setting up upload:", error);
            showAlert("Erro inicial de upload: " + error.message, "error", "Erro Crítico");
            setUpdatingProfile(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validar tamanho (ex: 5MB)
        if (file.size > 5 * 1024 * 1024) {
            showAlert("A imagem deve ter no máximo 5MB.", "warning", "Arquivo Muito Grande");
            return;
        }

        try {
            const dimensions = await getImageDimensions(file);
            const isSquare = Math.abs(dimensions.width - dimensions.height) < 5; // allow small margin
            const isTooLarge = dimensions.width > 300 || dimensions.height > 300;

            if (!isSquare || isTooLarge) {
                const imageUrl = URL.createObjectURL(file);
                setTempImageSrc(imageUrl);
                // Clear input value so same file can be selected again if cancelled
                e.target.value = '';
                return;
            }

            // If okay, upload directly
            uploadImage(file);
        } catch (e) {
            console.error("Error checking image dimensions", e);
            // Fallback to direct upload if check fails
            uploadImage(file);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.addEventListener("load", () => {
                setTempImageSrc(reader.result?.toString() || "");
            });
            reader.readAsDataURL(file);
        }
    };

    const handleCropComplete = (croppedBlob: Blob) => {
        setTempImageSrc(null);
        uploadImage(croppedBlob);
    };

    const handleCloseProfileModal = () => {
        if (imageUploadProgress > 0 && imageUploadProgress < 100) return;
        if (!user) return;
        const hasUnsavedChanges =
            profileName !== (user.displayName || "") ||
            (profilePhoto !== (user.photoURL || "") && profilePhoto !== "");

        const close = () => {
            setProfileName(user.displayName || "");
            setProfilePhoto(user.photoURL || "");
            setIsProfileModalOpen(false);
            setTempImageSrc(null);
        };

        if (hasUnsavedChanges) {
            showAlert(
                "Você tem alterações não salvas. Deseja realmente sair?",
                "warning",
                "Alterações não salvas",
                () => close() // onConfirm
            );
        } else {
            close();
        }
    };





    const fetchExams = async () => {
        if (!user) return;
        try {
            // Fetch ALL exams globally
            const q = query(
                collection(db, "exams"),
                orderBy("createdAt", "desc")
            );
            const snapshot = await getDocs(q);
            setExams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (e: any) {
            console.error("Error fetching exams:", e);
            setError(e.message);
        }
    };



    const executeSolveExam = async (examOverride?: any) => {
        if (!examOverride && !confirmingSolveExam) return;
        if (!user) return;
        setProcessingPayment(true);

        const exam = examOverride || confirmingSolveExam;

        try {
            // Deduct 50 credits from solver, Reward 25 to author
            const authorRef = doc(db, "users", exam.userId);
            const solverRef = doc(db, "users", user.uid);

            await runTransaction(db, async (transaction) => {
                const solverDoc = await transaction.get(solverRef);
                const authorDoc = await transaction.get(authorRef);

                const currentCredits = solverDoc.exists() ? (solverDoc.data().credits || 0) : 100; // Assume 100 for recovered users

                if (currentCredits < 50) {
                    throw new Error("Créditos insuficientes");
                }

                // Update Solver (Create if missing, else update)
                if (!solverDoc.exists()) {
                    transaction.set(solverRef, {
                        email: user.email,
                        displayName: user.displayName,
                        photoURL: user.photoURL,
                        credits: currentCredits - 50,
                        createdAt: new Date(),
                        lastLogin: new Date()
                    });
                } else {
                    transaction.update(solverRef, {
                        credits: increment(-50)
                    });
                }

                // Reward Author (Only if doc exists)
                if (authorDoc.exists()) {
                    transaction.update(authorRef, {
                        credits: increment(25)
                    });
                } else {
                    console.warn(`Author document ${exam.userId} not found. Cannot reward credits.`);
                }

                // Increment Exam Resolutions Count
                const examRef = doc(db, "exams", exam.id);
                transaction.update(examRef, {
                    resolutions: increment(1)
                });
            });

            console.log("Transaction successfully committed!");
            console.log(`-50 credits from solver ${user.uid}`);
            console.log(`+25 credits to author ${exam.userId}`);
            console.log(`+1 resolution to exam ${exam.id}`);

            router.push(`/dashboard/solve/${exam.id}`);

        } catch (err: any) {
            console.error("Transaction failed:", err);
            showAlert("Erro ao processar créditos: " + err.message, "error", "Erro");
            setConfirmingSolveExam(null); // Close modal on error
        } finally {
            setProcessingPayment(false);
        }
    };





    if (loading || !user) return null;

    return (
        <motion.div
            initial="hidden"
            animate="visible"
            className="min-h-screen lg:h-screen bg-slate-50 dark:bg-slate-950 transition-colors lg:overflow-hidden"
        >
            {/* Owner Action Modal */}
            {selectedExam && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setSelectedExam(null)}>
                    <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Como deseja abrir?</h3>
                        <p className="text-slate-500 text-sm mb-6">
                            Você é o autor desta prova. Você pode <strong>resolvê-la gratuitamente</strong> (sem gastar créditos) ou editar o conteúdo.
                        </p>
                        <div className="space-y-3">
                            <button
                                onClick={() => router.push(`/dashboard/solve/${selectedExam.id}`)}
                                className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-green-500 dark:hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition group"
                            >
                                <div className="flex flex-col items-start">
                                    <span className="font-semibold text-slate-700 dark:text-slate-200 group-hover:text-green-700 dark:group-hover:text-green-400">Resolver Prova</span>
                                    <span className="text-[10px] font-bold text-green-600 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-full mt-1">
                                        GRÁTIS • AUTOR
                                    </span>
                                </div>
                                <div className="bg-green-100 text-green-600 p-2 rounded-lg">
                                    <FileText className="w-5 h-5" />
                                </div>
                            </button>
                            <button
                                onClick={() => router.push(`/dashboard/review/${selectedExam.id}`)}
                                className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition group"
                            >
                                <span className="font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-700 dark:group-hover:text-blue-400">Editar / Revisar</span>
                                <div className="bg-blue-100 text-blue-600 p-2 rounded-lg">
                                    <Upload className="w-5 h-5" />
                                </div>
                            </button>
                            <button
                                onClick={() => handleDeleteExam(selectedExam)}
                                className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-red-500 dark:hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition group"
                            >
                                <span className="font-semibold text-slate-700 dark:text-slate-200 group-hover:text-red-700 dark:group-hover:text-red-400">Excluir Prova</span>
                                <div className="bg-red-100 text-red-600 p-2 rounded-lg">
                                    <Trash2 className="w-5 h-5" />
                                </div>
                            </button>
                        </div>
                        <button
                            onClick={() => setSelectedExam(null)}
                            className="mt-6 w-full py-2 text-slate-400 text-sm hover:text-slate-600"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Confirmation Modal for Solving */}
            {confirmingSolveExam && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => !processingPayment && setConfirmingSolveExam(null)}>
                    <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
                                <Coins className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Confirmar Acesso</h3>
                            <p className="text-slate-500 dark:text-slate-400 mb-6">
                                Resolver esta prova consumirá <strong className="text-amber-600 dark:text-amber-500">50 créditos</strong>. Deseja continuar?
                            </p>

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => setConfirmingSolveExam(null)}
                                    disabled={processingPayment}
                                    className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => executeSolveExam()}
                                    disabled={processingPayment}
                                    className="flex-1 py-3 px-4 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {processingPayment ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirmar"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Credits Info Modal */}
            {isCreditsModalOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setIsCreditsModalOpen(false)}>
                    <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Coins className="w-6 h-6 text-amber-500" />
                                Meus Créditos
                            </h3>
                            <button onClick={() => setIsCreditsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl flex items-center justify-between mb-6 border border-amber-100 dark:border-amber-800">
                            <div>
                                <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">Saldo Atual</p>
                                <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{userCredits || 0}</p>
                            </div>
                            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-800 rounded-full flex items-center justify-center text-amber-600 dark:text-amber-400">
                                <Coins className="w-6 h-6" />
                            </div>
                        </div>

                        <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-3">Como obter mais créditos?</h4>
                        <div className="space-y-3">
                            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                                <div className="p-2 bg-amber-100 text-amber-600 rounded-lg shrink-0">
                                    <Target className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="font-bold text-slate-800 dark:text-white text-sm">Responda Questões</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Ganhe <span className="font-bold text-green-600">+1 crédito</span> para cada questão respondida corretamente.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                                <div className="p-2 bg-violet-100 text-violet-600 rounded-lg shrink-0">
                                    <Upload className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="font-bold text-slate-800 dark:text-white text-sm">Envie uma Prova</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Ganhe <span className="font-bold text-green-600">+75 créditos</span> ao publicar uma nova prova validada.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg shrink-0">
                                    <Check className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="font-bold text-slate-800 dark:text-white text-sm">Atenda Pedidos</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Ganhe <span className="font-bold text-green-600">+100 créditos</span> ao enviar uma prova solicitada por outro aluno.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg shrink-0">
                                    <FileText className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="font-bold text-slate-800 dark:text-white text-sm">Tenha suas provas resolvidas</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Ganhe <span className="font-bold text-green-600">+25 créditos</span> cada vez que um usuário resolver sua prova.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => setIsCreditsModalOpen(false)}
                            className="mt-6 w-full py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                        >
                            Entendi
                        </button>
                    </div>
                </div>
            )}

            {/* Search Modal */}
            {isSearchOpen && (
                <div className="fixed inset-0 z-[70] flex items-start justify-center pt-20 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsSearchOpen(false)}>
                    <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl p-4 animate-in slide-in-from-top-4 duration-200 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="relative">
                            <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                            <input
                                autoFocus
                                type="text"
                                placeholder="Pesquisar provas por título ou disciplina..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-lg text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-violet-500"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-600"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>

                        {/* Search Results Inside Modal */}
                        {searchQuery && (
                            <div className="mt-4 overflow-y-auto flex-1">
                                <p className="text-xs text-slate-500 px-2 mb-2">
                                    {filteredExams.length} resultado(s) encontrado(s)
                                </p>
                                {filteredExams.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400">
                                        <Search className="w-10 h-10 mx-auto mb-2 opacity-20" />
                                        <p>Nenhuma prova encontrada.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {filteredExams.map((exam) => (
                                            <div
                                                key={exam.id}
                                                onClick={() => {
                                                    setIsSearchOpen(false);
                                                    setSearchQuery("");
                                                    const isOwner = user.uid === exam.userId;
                                                    if (exam.status === 'ready') {
                                                        if (isOwner) {
                                                            setSelectedExam(exam);
                                                        } else {
                                                            setConfirmingSolveExam(exam);
                                                            // router.push(`/dashboard/solve/${exam.id}`); // OLD: Bypassed payment
                                                        }
                                                    } else if (isOwner) {
                                                        router.push(`/dashboard/review/${exam.id}`);
                                                    } else {
                                                        showAlert("Esta prova ainda está sendo revisada pelo autor.", "info", "Em Revisão");
                                                    }
                                                }}
                                                className="p-3 rounded-lg hover:bg-slate-50 cursor-pointer flex items-center gap-3 transition"
                                            >
                                                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center shrink-0">
                                                    <FileText className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-slate-800 truncate" title={exam.extractedData?.title || exam.fileName}>
                                                        {exam.extractedData?.title || exam.fileName}
                                                    </p>
                                                    <p className="text-xs text-slate-500 truncate">
                                                        {exam.extractedData?.description || exam.extractedData?.course || "Disciplina Desconhecida"} • {exam.userName || "Desconhecido"} • Resoluções: {exam.resolutions || 0}
                                                    </p>
                                                </div>
                                                <span
                                                    className={clsx(
                                                        "px-2 py-0.5 rounded-full text-xs font-medium shrink-0",
                                                        (() => {
                                                            const isReady = exam.status === 'ready';
                                                            const questions = exam.extractedData?.questions || [];

                                                            let hasKey = false;
                                                            if (exam.creditsAwarded === true) hasKey = true;
                                                            else if (exam.creditsAwarded === false) hasKey = false;
                                                            else hasKey = !!exam.extractedData?.answerKeyResult;

                                                            if (!isReady) return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400";
                                                            return !hasKey
                                                                ? "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400"
                                                                : "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400";
                                                        })()
                                                    )}>
                                                    {(() => {
                                                        const isReady = exam.status === 'ready';
                                                        const questions = exam.extractedData?.questions || [];

                                                        let hasKey = false;
                                                        if (exam.creditsAwarded === true) hasKey = true;
                                                        else if (exam.creditsAwarded === false) hasKey = false;
                                                        else hasKey = !!exam.extractedData?.answerKeyResult;

                                                        if (!isReady) return 'Revisão';
                                                        return !hasKey ? 'Pendente de Gabarito' : 'Pronta';
                                                    })()}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Fixed Header */}
            <motion.div
                variants={headerVariants as any}
                className="fixed top-0 left-0 w-full h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-[60] transition-colors"
            >
                <div className="max-w-6xl mx-auto px-4 md:px-8 h-full">
                    <div className="flex items-center justify-between h-full">
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold">
                                <span className="text-slate-900 dark:text-white">View</span>
                                <span className="text-violet-600 dark:text-violet-400">Go</span>
                            </h1>
                        </div>

                        {user && (
                            <>
                                {/* Desktop Menu */}
                                <div className="hidden lg:flex items-center gap-4">
                                    <ThemeToggle />
                                    {/* Notification Bell */}
                                    <div className="relative" ref={notificationRef}>
                                        <button
                                            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                                            className="p-3 rounded-full text-slate-500 dark:text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-slate-800 transition relative border border-slate-200 dark:border-slate-800 shadow-sm"
                                        >
                                            <Bell className="w-5 h-5" />
                                            {notifications.filter(n => !n.read).length > 0 && (
                                                <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
                                            )}
                                        </button>

                                        {/* Notification Dropdown */}
                                        {isNotificationsOpen && (
                                            <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                                                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                                                    <h3 className="font-bold text-slate-800 dark:text-white">Notificações</h3>
                                                    <span className="text-xs text-slate-500">{notifications.filter(n => !n.read).length} não lidas</span>
                                                </div>
                                                <div className="max-h-80 overflow-y-auto custom-scrollbar">
                                                    {renderNotificationsList()}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setIsSearchOpen(true)}
                                        className="p-3 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-800 shadow-sm transition"
                                        title="Pesquisar Provas"
                                    >
                                        <Search className="w-5 h-5" />
                                    </button>

                                    <button
                                        onClick={() => setIsCreditsModalOpen(true)}
                                        className="flex items-center gap-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-4 py-2 rounded-full font-medium border border-amber-200 dark:border-amber-800 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition cursor-pointer"
                                        title="Ver detalhes dos créditos"
                                    >
                                        <Coins className="w-5 h-5" />
                                        <span>{userCredits !== null ? userCredits : '...'}</span>
                                    </button>

                                    <div className="flex items-center gap-3 bg-white dark:bg-slate-900 px-4 py-2 rounded-full border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
                                        {user.photoURL ? (
                                            <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700" referrerPolicy="no-referrer" />
                                        ) : (
                                            <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                                                <User className="w-4 h-4" />
                                            </div>
                                        )}
                                        <div className="text-sm">
                                            <p className="font-semibold text-slate-700 dark:text-slate-200">{user.displayName || "Usuário"}</p>
                                        </div>
                                        <button
                                            onClick={() => setIsProfileModalOpen(true)}
                                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-full transition"
                                            title="Ver/Editar Perfil"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <button
                                        onClick={handleLogout}
                                        className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition font-medium text-sm"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        Sair
                                    </button>
                                </div>

                                {/* Mobile Hamburger Menu Button */}
                                <button
                                    className="lg:hidden p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                                    onClick={() => setIsMobileMenuOpen(true)}
                                >
                                    <Menu className="w-6 h-6" />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </motion.div>

            <motion.div
                variants={containerVariants as any}
                className="max-w-6xl mx-auto space-y-4 pt-16 lg:pt-16 lg:h-full lg:overflow-hidden px-4 md:px-8"
            >
                {/* Responsive Layout: Flex Column Reverse on Mobile (Right on Top), Flex Row on Desktop */}
                <div className="flex flex-col-reverse lg:flex-row gap-4 lg:gap-8 items-start lg:h-full">

                    {/* Main Content (Left on Desktop, Bottom on Mobile) */}
                    <motion.div
                        variants={itemVariants as any}
                        className="flex-1 w-full min-w-0 space-y-4 h-auto lg:h-full lg:overflow-y-auto pb-24 lg:pb-32 custom-scrollbar pt-4"
                    >
                        {/* Upload Section */}
                        {/* Upload Button Section */}
                        <motion.div variants={itemVariants as any} className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors text-center">
                            <div className="max-w-xl mx-auto">
                                <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
                                    Enviar nova Prova ou Simulado
                                </h2>
                                <p className="text-slate-500 dark:text-slate-400 mb-8">
                                    Coopere com a comunidade e transforme seus PDFs em provas interativas.                                </p>

                                <button
                                    onClick={() => router.push('/dashboard/send-exam')}
                                    className="px-8 py-4 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-2xl shadow-lg shadow-violet-200 dark:shadow-none hover:shadow-xl transition-all transform hover:-translate-y-1 flex items-center gap-3 mx-auto"
                                >
                                    <div className="p-1 bg-white/20 rounded-lg">
                                        <Upload className="w-6 h-6" />
                                    </div>
                                    <span className="text-lg">Enviar nova Prova ou Simulado</span>
                                </button>
                            </div>
                        </motion.div>

                        {/* Resolver Questões Cards Grid */}
                        <motion.div variants={itemVariants as any} className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
                            {/* Card 1: List View */}
                            <div className="bg-gradient-to-br from-violet-600 to-indigo-700 p-6 rounded-2xl shadow-lg text-white transition-all hover:shadow-xl hover:-translate-y-1 cursor-pointer group"
                                onClick={() => router.push('/dashboard/questions-list')}
                            >
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
                                            <BookOpen className="w-5 h-5" />
                                            Resolver Questões
                                        </h3>
                                        <p className="text-violet-100 text-sm">
                                            Acesse o banco completo em formato de lista para estudo focado.
                                        </p>
                                    </div>
                                    <div className="p-3 bg-white/20 rounded-xl group-hover:bg-white/30 transition shrink-0">
                                        <FileText className="w-8 h-8" />
                                    </div>
                                </div>
                            </div>

                            {/* Card 2: Modalidade Quiz */}
                            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-2xl shadow-lg text-white transition-all hover:shadow-xl hover:-translate-y-1 cursor-pointer group"
                                onClick={() => router.push('/dashboard/questions')}
                            >
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
                                            <Target className="w-5 h-5" />
                                            Resolver Questões Modalidade Quiz
                                        </h3>
                                        <p className="text-emerald-100 text-sm">
                                            Resolva uma por uma com cronômetro e feedback imediato.
                                        </p>
                                    </div>
                                    <div className="p-3 bg-white/20 rounded-xl group-hover:bg-white/30 transition shrink-0">
                                        <Play className="w-8 h-8 fill-current" />
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        {/* Recent Exams List */}
                        <motion.div variants={itemVariants as any}>
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-slate-800 dark:text-white">Provas Recentes</h2>
                                <button
                                    onClick={() => setIsSearchOpen(true)}
                                    className="flex items-center gap-2 text-violet-600 dark:text-violet-400 text-sm font-medium hover:underline cursor-pointer"
                                >
                                    <Search className="w-5 h-5" />
                                    <h2>Pesquisar</h2>
                                </button>
                            </div>

                            {exams.length === 0 ? (
                                <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                    <p className="text-slate-500 dark:text-slate-400 font-medium">Nenhuma prova encontrada.</p>
                                    <p className="text-sm text-slate-400">Envie o primeiro PDF para começar!</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {exams.map((exam) => (
                                        <div
                                            key={exam.id}
                                            onClick={() => {
                                                const isOwner = user.uid === exam.userId;
                                                if (exam.status === 'ready') {
                                                    if (isOwner) {
                                                        setSelectedExam(exam);
                                                    } else {
                                                        setConfirmingSolveExam(exam);
                                                        // router.push(`/dashboard/solve/${exam.id}`); // OLD: Bypassed payment
                                                    }
                                                } else if (isOwner) {
                                                    router.push(`/dashboard/review/${exam.id}`);
                                                } else {
                                                    showAlert("Esta prova ainda está sendo revisada pelo autor.", "info", "Em Revisão");
                                                }
                                            }}
                                            className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-violet-300 dark:hover:border-violet-700 transition cursor-pointer flex flex-col h-full"
                                        >
                                            <div className="p-5 flex-1">
                                                <div className="flex justify-between items-start mb-4">
                                                    {(() => {
                                                        const isReady = exam.status === 'ready';
                                                        const questions = exam.extractedData?.questions || [];

                                                        let hasKey = false;
                                                        if (exam.creditsAwarded === true) hasKey = true;
                                                        else if (exam.creditsAwarded === false) hasKey = false;
                                                        else hasKey = !!exam.extractedData?.answerKeyResult;

                                                        const isPendingKey = isReady && !hasKey;

                                                        let statusLabel = "Em Revisão";
                                                        let statusClass = "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";

                                                        if (isReady) {
                                                            if (isPendingKey) {
                                                                statusLabel = "Pendente de Gabarito";
                                                                statusClass = "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400";
                                                            } else {
                                                                statusLabel = "Pronta";
                                                                statusClass = "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400";
                                                            }
                                                        }

                                                        return (
                                                            <div className={clsx(
                                                                "px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-semibold uppercase tracking-wide",
                                                                statusClass
                                                            )}>
                                                                <FileText className="w-4 h-4" />
                                                                <span>{statusLabel}</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>

                                                <h3 className="font-bold text-slate-800 dark:text-white mb-1 line-clamp-1" title={exam.extractedData?.title || exam.fileName}>
                                                    {exam.extractedData?.title || exam.fileName}
                                                </h3>
                                                <div className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-1">
                                                    <FormattedText text={exam.extractedData?.description || exam.extractedData?.course || "Disciplina Desconhecida"} />
                                                </div>

                                                <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
                                                    <span>{exam.extractedData?.questions?.length || 0} questões</span>
                                                    <span>•</span>
                                                    <span>{new Date(exam.createdAt?.toDate()).toLocaleDateString()}</span>
                                                </div>

                                                <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800/50">
                                                    <div className="flex items-center gap-2">
                                                        {exam.userPhoto ? (
                                                            <img src={exam.userPhoto} alt={exam.userName} className="w-5 h-5 rounded-full" />
                                                        ) : (
                                                            <div className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center text-[10px] text-slate-500">
                                                                <User className="w-3 h-3" />
                                                            </div>
                                                        )}
                                                        <span className="text-xs text-slate-500 truncate max-w-[80px]">{exam.userName || "Anônimo"}</span>
                                                    </div>


                                                </div>
                                                <div className="menuCard">
                                                    <div
                                                        className={clsx(
                                                            "flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium transition-colors",
                                                            (exam.resolutions || 0) > 0
                                                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                                                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                                        )}
                                                        title="Resoluções realizadas"
                                                    >
                                                        <FileText className="w-3 h-3" />
                                                        <span>{exam.resolutions || 0}</span>
                                                    </div>

                                                    {exam.status === 'ready' && (
                                                        <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-700 pl-2 ml-1">
                                                            <button
                                                                onClick={(e) => handleLike(e, exam)}
                                                                className={clsx(
                                                                    "p-1.5 rounded-full transition hover:bg-slate-50 dark:hover:bg-slate-800",
                                                                    exam.likedBy?.includes(user?.uid) ? "text-violet-600" : "text-slate-400 dark:text-slate-500 hover:text-violet-600"
                                                                )}
                                                                title={exam.likedBy?.includes(user?.uid) ? "Descurtir" : "Curtir"}
                                                            >
                                                                <Heart className={clsx("w-4 h-4", exam.likedBy?.includes(user?.uid) && "fill-current")} />
                                                            </button>
                                                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                                                {exam.likedBy?.length || 0}
                                                            </span>
                                                            <button
                                                                onClick={e => handleShare(e, exam.id)}
                                                                className="p-1.5 text-slate-400 hover:text-violet-500 transition rounded-full hover:bg-slate-50 dark:hover:bg-slate-800"
                                                                title="Compartilhar"
                                                            >
                                                                <Share2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    )}

                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteExam(exam);
                                                        }}
                                                        className="p-1.5 text-slate-400 hover:text-red-500 transition rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 ml-1"
                                                        title="Excluir Prova"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    </motion.div>

                    {/* Right Sidebar: Exam Requests (Right on Desktop, Top on Mobile) */}
                    <motion.div
                        variants={sidebarVariants as any}
                        className="w-full lg:w-[300px] shrink-0 h-auto lg:h-full lg:overflow-y-auto lg:pb-32 pb-0 mt-3 lg:mt-0 custom-scrollbar pt-0"
                    >

                        <div className="">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <AlertCircle className="w-5 h-5 text-violet-500" />
                                    Pedidos de Provas
                                </h3>
                                <button
                                    onClick={() => setIsRequestModalOpen(true)}
                                    className="w-[150px] mt-4 py-3 bg-violet-50 dark:bg-violet-900/10 text-violet-700 dark:text-violet-300 font-semibold rounded-xl hover:bg-violet-100 dark:hover:bg-violet-900/30 transition text-sm flex items-center justify-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#902b91"><path d="m226-559 78 33q14-28 29-54t33-52l-56-11-84 84Zm142 83 114 113q42-16 90-49t90-75q70-70 109.5-155.5T806-800q-72-5-158 34.5T492-656q-42 42-75 90t-49 90Zm178-65q-23-23-23-56.5t23-56.5q23-23 57-23t57 23q23 23 23 56.5T660-541q-23 23-57 23t-57-23Zm19 321 84-84-11-56q-26 18-52 32.5T532-299l33 79Zm313-653q19 121-23.5 235.5T708-419l20 99q4 20-2 39t-20 33L538-80l-84-197-171-171-197-84 167-168q14-14 33.5-20t39.5-2l99 20q104-104 218-147t235-24ZM157-321q35-35 85.5-35.5T328-322q35 35 34.5 85.5T327-151q-25 25-83.5 43T82-76q14-103 32-161.5t43-83.5Zm57 56q-10 10-20 36.5T180-175q27-4 53.5-13.5T270-208q12-12 13-29t-11-29q-12-12-29-11.5T214-265Z" /></svg>
                                    Pedir
                                </button>
                            </div>

                            {examRequests.length === 0 ? (
                                <div className="text-center py-8">
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Nenhum pedido em aberto.</p>
                                    <button
                                        onClick={() => setIsRequestModalOpen(true)}
                                        className="text-xs font-semibold text-violet-600 hover:text-violet-700 hover:underline"
                                    >
                                        Faça o primeiro pedido
                                    </button>
                                </div>
                            ) : (
                                <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:-mx-8 md:px-8 lg:mx-0 lg:px-0 lg:flex-col lg:space-y-4 lg:overflow-x-visible lg:overflow-y-auto lg:pb-24 lg:h-full custom-scrollbar">
                                    {examRequests.map((req) => (
                                        <div key={req.id} className="min-w-[280px] w-[280px] lg:w-full lg:min-w-0 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-violet-300 dark:hover:border-violet-700 transition group relative flex-shrink-0">
                                            {/* Pulsing Dot */}
                                            <span className="absolute top-3 right-3 flex h-3 w-3">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-violet-500"></span>
                                            </span>

                                            {req.requesterId === user.uid && (
                                                <button
                                                    onClick={(e) => handleDeleteRequest(e, req.id)}
                                                    className="absolute top-3 right-8 text-slate-400 hover:text-red-500 transition"
                                                    title="Excluir Pedido"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}

                                            <div className="flex items-start gap-3 mb-2">
                                                {req.requesterPhoto ? (
                                                    <img src={req.requesterPhoto} className="w-8 h-8 rounded-full" />
                                                ) : (
                                                    <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-400"><User className="w-4 h-4" /></div>
                                                )}
                                                <div>
                                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{req.requesterName}</p>
                                                    <p className="text-[10px] text-slate-400">{new Date(req.createdAt?.toDate()).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                            <h4 className="font-bold text-sm text-slate-800 dark:text-white mb-1">{req.subject}</h4>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3 line-clamp-2">
                                                <FormattedText text={req.description} />
                                            </div>

                                            {req.requesterId !== user.uid && (
                                                <button
                                                    onClick={() => handleFulfillRequest(req.id)}
                                                    className="w-full py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-lg hover:bg-violet-600 hover:text-white hover:border-violet-600 transition flex items-center justify-center gap-2"
                                                >
                                                    <Upload className="w-3 h-3" />
                                                    Atender +100<CircleDollarSign className="w-3 h-3 text-yellow-500 inline" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}


                        </div>
                    </motion.div>
                </div>
            </motion.div>

            {/* Profile Modal */}
            {
                isProfileModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={handleCloseProfileModal}>
                        <div className="bg-white dark:bg-slate-900 w-full max-w-md max-h-[90vh] rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95 space-y-6 overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center">
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white">Seu Perfil</h3>
                                <button onClick={handleCloseProfileModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="flex flex-col items-center gap-4">
                                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                    {profilePhoto ? (
                                        <img src={profilePhoto} alt="Profile" className="w-24 h-24 rounded-full object-cover border-4 border-slate-100 dark:border-slate-800" />
                                    ) : (
                                        <div className="w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                                            <User className="w-10 h-10" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Edit className="w-8 h-8 text-white" />
                                    </div>
                                </div>
                                <input
                                    type="file"
                                    hidden
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    accept="image/*"
                                />
                                {imageUploadProgress > 0 && imageUploadProgress < 100 && (
                                    <div className="w-full max-w-[200px] h-1 bg-slate-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-violet-600 transition-all duration-300" style={{ width: `${imageUploadProgress}%` }}></div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome de Exibição</label>
                                    <input
                                        value={profileName}
                                        onChange={e => setProfileName(e.target.value)}
                                        className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
                                        placeholder="Seu nome"
                                    />
                                </div>
                            </div>

                            {/* Performance Dashboard */}
                            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                        <Target className="w-5 h-5 text-violet-600" />
                                        Seu Desempenho
                                    </h4>
                                    {!loadingStats && userStats.total > 0 && (
                                        <button
                                            onClick={fetchUserStats}
                                            className="text-xs text-violet-600 hover:text-violet-700 font-medium"
                                        >
                                            Atualizar
                                        </button>
                                    )}
                                </div>

                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                    Apenas você pode ver essas informações
                                </p>

                                {loadingStats ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
                                    </div>
                                ) : userStats.total === 0 ? (
                                    <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                                        <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Nenhuma questão respondida ainda</p>
                                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Comece a resolver provas para ver suas estatísticas!</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Stats Cards */}
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="bg-violet-50 dark:bg-violet-900/20 p-3 rounded-xl border border-violet-100 dark:border-violet-900/40">
                                                <p className="text-xs text-violet-600 dark:text-violet-400 font-medium mb-1">Total</p>
                                                <p className="text-2xl font-black text-violet-700 dark:text-violet-300">{userStats.total}</p>
                                            </div>
                                            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-xl border border-green-100 dark:border-green-900/40">
                                                <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">Acertos</p>
                                                <p className="text-2xl font-black text-green-700 dark:text-green-300">{userStats.correct}</p>
                                            </div>
                                            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-100 dark:border-red-900/40">
                                                <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Erros</p>
                                                <p className="text-2xl font-black text-red-700 dark:text-red-300">{userStats.incorrect}</p>
                                            </div>
                                        </div>

                                        {/* Donut Chart */}
                                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                                            <div className="flex items-center justify-between mb-3">
                                                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Taxa de Acerto</p>
                                                <p className="text-2xl font-black text-violet-600 dark:text-violet-400">{userStats.accuracy.toFixed(1)}%</p>
                                            </div>
                                            <div className="relative w-32 h-32 mx-auto">
                                                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                                    {/* Background circle */}
                                                    <circle
                                                        cx="50"
                                                        cy="50"
                                                        r="40"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="12"
                                                        className="text-slate-200 dark:text-slate-700"
                                                    />
                                                    {/* Progress circle */}
                                                    <circle
                                                        cx="50"
                                                        cy="50"
                                                        r="40"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="12"
                                                        strokeDasharray={`${(userStats.accuracy / 100) * 251.2} 251.2`}
                                                        className="text-violet-600 dark:text-violet-400 transition-all duration-1000"
                                                        strokeLinecap="round"
                                                    />
                                                </svg>
                                            </div>

                                            {/* Progress Bar */}
                                            <div className="mt-4">
                                                <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-violet-500 to-violet-600 transition-all duration-1000 rounded-full"
                                                        style={{ width: `${userStats.accuracy}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Motivational Message */}
                                        <div className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 p-4 rounded-xl border border-violet-100 dark:border-violet-900/40">
                                            <p className="text-sm font-bold text-violet-900 dark:text-violet-100 mb-1">
                                                {userStats.accuracy >= 90 ? "🎉 Excelente!" :
                                                    userStats.accuracy >= 75 ? "🌟 Muito Bom!" :
                                                        userStats.accuracy >= 60 ? "💪 Continue Assim!" :
                                                            "📚 Pratique Mais!"}
                                            </p>
                                            <p className="text-xs text-violet-700 dark:text-violet-300">
                                                {userStats.accuracy >= 90 ? "Você está dominando! Continue nesse ritmo incrível." :
                                                    userStats.accuracy >= 75 ? "Ótimo desempenho! Você está no caminho certo." :
                                                        userStats.accuracy >= 60 ? "Bom trabalho! Mais prática e você chegará lá." :
                                                            "Não desista! Cada questão é um aprendizado."}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* My Requests Section */}
                            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                                <h4 className="font-bold text-slate-800 dark:text-white mb-3">Meus Pedidos Pendentes</h4>
                                {examRequests.filter(r => r.requesterId === user.uid).length === 0 ? (
                                    <p className="text-sm text-slate-500 text-center py-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">Você não tem pedidos ativos.</p>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto custom-scrollbar">
                                        {examRequests.filter(r => r.requesterId === user.uid).map(req => (
                                            <div key={req.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 relative group">
                                                <button
                                                    onClick={(e) => handleDeleteRequest(e, req.id)}
                                                    className="absolute top-2 right-2 text-slate-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
                                                    title="Excluir Pedido"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                                <h5 className="font-bold text-xs text-slate-800 dark:text-white mb-1 line-clamp-1">{req.subject}</h5>
                                                <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2">{req.description}</p>
                                                <span className="inline-block mt-2 text-[10px] px-1.5 py-0.5 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 rounded-md font-medium">
                                                    Em Aberto
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={handleCloseProfileModal}
                                    className="flex-1 py-3 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleUpdateProfile}
                                    disabled={updatingProfile}
                                    className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {updatingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : "Salvar Alterações"}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Image Cropper Component */}
            {
                tempImageSrc && (
                    <ImageCropper
                        imageSrc={tempImageSrc}
                        onCancel={() => {
                            setTempImageSrc(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        onCropComplete={handleCropComplete}
                    />
                )
            }

            {/* Create Request Modal */}
            {
                isRequestModalOpen && (
                    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setIsRequestModalOpen(false)}>
                        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-4">Pedir uma Prova</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Disciplina / Assunto</label>
                                    <input
                                        value={requestSubject}
                                        onChange={e => setRequestSubject(e.target.value)}
                                        placeholder="Ex: Direito Constitucional, Matemática..."
                                        className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Descrição do Pedido</label>
                                    <textarea
                                        value={requestDescription}
                                        onChange={e => setRequestDescription(e.target.value)}
                                        placeholder="Descreva o que você precisa (ex: Banca Cebraspe, 2024, Nível Superior...)"
                                        className="w-full p-2 h-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    />
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button
                                        onClick={() => setIsRequestModalOpen(false)}
                                        className="flex-1 py-2 text-slate-500 hover:bg-slate-100 rounded-lg transition"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleCreateRequest}
                                        disabled={creatingRequest}
                                        className="flex-1 py-2 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition disabled:opacity-50"
                                    >
                                        {creatingRequest ? "Enviando..." : "Publicar Pedido"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Mobile Menu Drawer */}
            <div className={clsx("fixed inset-0 z-[100] flex justify-end lg:hidden transition-visibility duration-300", isMobileMenuOpen ? "visible" : "invisible delay-300")} role="dialog" aria-modal="true">
                {/* Backdrop */}
                <div
                    className={clsx("fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300", isMobileMenuOpen ? "opacity-100" : "opacity-0")}
                    onClick={() => setIsMobileMenuOpen(false)}
                ></div>

                {/* Drawer Panel */}
                <div className={clsx("relative w-full max-w-[300px] bg-white dark:bg-slate-900 h-full p-6 shadow-2xl transition-transform duration-300 ease-out flex flex-col gap-6 overflow-y-auto", isMobileMenuOpen ? "translate-x-0" : "translate-x-full")}>
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Menu</h2>
                        <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Profile Section */}
                    <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                        {user.photoURL ? (
                            <img src={user.photoURL} alt="Profile" className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-700" />
                        ) : (
                            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                                <User className="w-5 h-5" />
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-800 dark:text-white truncate">{user.displayName || "Usuário"}</p>
                            <button onClick={() => { setIsMobileMenuOpen(false); setIsProfileModalOpen(true); }} className="text-xs text-violet-600 font-medium hover:underline">
                                Ver/Editar Perfil
                            </button>
                        </div>
                    </div>

                    {/* Stats / Credits */}
                    <button
                        onClick={() => { setIsMobileMenuOpen(false); setIsCreditsModalOpen(true); }}
                        className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-xl"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg">
                                <Coins className="w-5 h-5" />
                            </div>
                            <span className="font-semibold text-slate-700 dark:text-slate-200">Meus Créditos</span>
                        </div>
                        <span className="font-bold text-amber-600 dark:text-amber-400 text-lg">{userCredits || 0}</span>
                    </button>

                    <div className="space-y-2">
                        {/* Notifications */}
                        <div className="space-y-2">
                            <button
                                onClick={() => {
                                    setIsMobileMenuOpen(false);
                                    setIsMobileNotificationsOpen(true);
                                }}
                                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition text-left"
                            >
                                <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                                    <Bell className="w-5 h-5" />
                                    <span className="font-medium">Notificações</span>
                                </div>
                                {notifications.filter(n => !n.read).length > 0 && (
                                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                        {notifications.filter(n => !n.read).length}
                                    </span>
                                )}
                            </button>
                        </div>

                        <button
                            onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(true); }}
                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition text-slate-600 dark:text-slate-300"
                        >
                            <Search className="w-5 h-5" />
                            <span className="font-medium">Pesquisar Provas</span>
                        </button>

                        <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                                <div className="scale-90 origin-left"><ThemeToggle /></div>
                                <span className="font-medium">Tema</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-auto pt-6 border-t border-slate-100 dark:border-slate-800">
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center justify-center gap-2 p-3 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition font-semibold"
                        >
                            <LogOut className="w-5 h-5" />
                            Sair
                        </button>
                    </div>
                </div>
            </div>
            {/* Modal: Continuar para a prova (Post-Login Redirect) */}
            {pendingExam && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
                    <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
                        onClick={() => {
                            localStorage.removeItem('pending_exam_id');
                            localStorage.removeItem('pending_exam_title');
                            localStorage.removeItem('pending_exam_user_id');
                            setPendingExam(null);
                        }}
                    />
                    <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-8 animate-in zoom-in-95 duration-300">
                        <div className="flex flex-col items-center text-center space-y-6">
                            <div className="w-20 h-20 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center text-violet-600 dark:text-violet-400">
                                <Play className="w-10 h-10 fill-current" />
                            </div>

                            <div className="space-y-2">
                                <h3 className="text-2xl font-black text-slate-800 dark:text-white">
                                    Vamos continuar?
                                </h3>
                                <p className="text-slate-500 dark:text-slate-400 font-medium">
                                    Você clicou para resolver a prova: <br />
                                    <span className="text-violet-600 dark:text-violet-400 font-bold">"{pendingExam.title}"</span>
                                </p>
                            </div>

                            <div className="flex flex-col w-full gap-3">
                                <button
                                    onClick={() => {
                                        const { id, title, userId } = pendingExam;
                                        localStorage.removeItem('pending_exam_id');
                                        localStorage.removeItem('pending_exam_title');
                                        localStorage.removeItem('pending_exam_user_id');
                                        setPendingExam(null);

                                        if (user.uid === userId) {
                                            router.push(`/dashboard/solve/${id}`);
                                        } else {
                                            setConfirmingSolveExam({
                                                id,
                                                userId,
                                                extractedData: { title }
                                            });
                                        }
                                    }}
                                    className="w-full py-4 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl font-black shadow-lg shadow-violet-500/25 transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <Play className="w-4 h-4" />
                                    CONTINUAR PARA A PROVA
                                </button>

                                <button
                                    onClick={() => {
                                        localStorage.removeItem('pending_exam_id');
                                        localStorage.removeItem('pending_exam_title');
                                        localStorage.removeItem('pending_exam_user_id');
                                        setPendingExam(null);
                                    }}
                                    className="w-full py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl font-bold transition-all active:scale-95"
                                >
                                    Agora não, obrigado
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile Notifications Modal */}
            {isMobileNotificationsOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 lg:hidden">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
                        onClick={() => setIsMobileNotificationsOpen(false)}
                    />
                    <div className="relative bg-white dark:bg-slate-900 w-full max-w-lg max-h-[85vh] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-xl">
                                    <Bell className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800 dark:text-white leading-tight">Notificações</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                        {notifications.filter(n => !n.read).length} não lidas
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsMobileNotificationsOpen(false)}
                                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Notifications List */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar bg-white dark:bg-slate-900">
                            {renderNotificationsList()}
                        </div>

                        {/* Footer */}
                        {notifications.length > 0 && notifications.some(n => !n.read) && (
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 shrink-0">
                                <button
                                    onClick={async () => {
                                        const unread = notifications.filter(n => !n.read);
                                        for (const n of unread) {
                                            await handleMarkAsRead(n.id);
                                        }
                                    }}
                                    className="w-full py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition active:scale-[0.98] text-sm"
                                >
                                    Marcar todas como lidas
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </motion.div>
    );
}
