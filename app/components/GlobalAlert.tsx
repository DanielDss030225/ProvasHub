"use client";

import { useAlert } from "../context/AlertContext";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";
import clsx from "clsx";

export function GlobalAlert() {
    const { alertState, hideAlert } = useAlert();
    const { isOpen, message, title, type } = alertState;

    if (!isOpen) return null;

    const getIcon = () => {
        switch (type) {
            case 'success': return <CheckCircle className="w-12 h-12 text-green-500" />;
            case 'error': return <AlertCircle className="w-12 h-12 text-red-500" />;
            case 'warning': return <AlertTriangle className="w-12 h-12 text-amber-500" />;
            default: return <Info className="w-12 h-12 text-blue-500" />;
        }
    };

    const getColorClass = () => {
        switch (type) {
            case 'success': return "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800";
            case 'error': return "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800";
            case 'warning': return "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800";
            default: return "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800";
        }
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={clsx(
                "w-full max-w-sm rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95 border",
                "bg-white dark:bg-slate-900",
                getColorClass() // Optional: remove this if you want white bg always, but subtle tint is nice
            )}>
                <button
                    onClick={hideAlert}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="flex flex-col items-center text-center">
                    <div className="mb-4">
                        {getIcon()}
                    </div>

                    {title && (
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                            {title}
                        </h3>
                    )}

                    <p className="text-slate-600 dark:text-slate-300 mb-6">
                        {message}
                    </p>

                    <div className="flex gap-3 justify-center w-full">
                        {alertState.onConfirm && (
                            <button
                                onClick={() => {
                                    alertState.onCancel?.();
                                    hideAlert();
                                }}
                                className="px-6 py-2 rounded-xl font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition shadow-sm"
                            >
                                Cancelar
                            </button>
                        )}
                        <button
                            onClick={() => {
                                alertState.onConfirm?.();
                                hideAlert();
                            }}
                            className={clsx(
                                "px-6 py-2 rounded-xl font-medium text-white transition shadow-sm",
                                type === 'success' ? "bg-green-600 hover:bg-green-700" :
                                    type === 'error' ? "bg-red-600 hover:bg-red-700" :
                                        type === 'warning' ? "bg-amber-600 hover:bg-amber-700" :
                                            "bg-blue-600 hover:bg-blue-700"
                            )}
                        >
                            {alertState.onConfirm ? 'Confirmar' : 'OK'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
