"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

type AlertType = 'success' | 'error' | 'info' | 'warning';

interface AlertContextType {
    showAlert: (message: string, type?: AlertType, title?: string, onConfirm?: () => void, onCancel?: () => void) => void;
    hideAlert: () => void;
    alertState: {
        isOpen: boolean;
        message: string;
        title?: string;
        type: AlertType;
        onConfirm?: () => void;
        onCancel?: () => void;
    };
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function AlertProvider({ children }: { children: ReactNode }) {
    const [alertState, setAlertState] = useState<{
        isOpen: boolean;
        message: string;
        title?: string;
        type: AlertType;
        onConfirm?: () => void;
        onCancel?: () => void;
    }>({
        isOpen: false,
        message: '',
        type: 'info'
    });

    const showAlert = (message: string, type: AlertType = 'info', title?: string, onConfirm?: () => void, onCancel?: () => void) => {
        setAlertState({
            isOpen: true,
            message,
            title,
            type,
            onConfirm,
            onCancel
        });
    };

    const hideAlert = () => {
        setAlertState(prev => ({ ...prev, isOpen: false }));
    };

    return (
        <AlertContext.Provider value={{ showAlert, hideAlert, alertState }}>
            {children}
        </AlertContext.Provider>
    );
}

export function useAlert() {
    const context = useContext(AlertContext);
    if (context === undefined) {
        throw new Error('useAlert must be used within an AlertProvider');
    }
    return context;
}
