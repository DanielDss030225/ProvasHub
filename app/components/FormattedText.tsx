"use client";

import React from 'react';
import clsx from 'clsx';

interface FormattedTextProps {
    text: string;
    className?: string;
}

/**
 * A reusable component that renders text with basic Markdown-like formatting:
 * **text** -> Bold
 * *text*  -> Italic
 */
export const FormattedText: React.FC<FormattedTextProps> = ({ text, className }) => {
    if (!text) return null;

    // Split by bold (**bold**), italic (*italic*), and underline (__underline__) tokens
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|__.*?__)/g);

    return (
        <span className={clsx("whitespace-pre-wrap", className)}>
            {parts.map((part, index) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    // Bold: remove delimiters and wrap in <strong>
                    return <strong key={index} className="font-black text-slate-900 dark:text-white">{part.slice(2, -2)}</strong>;
                } else if (part.startsWith('*') && part.endsWith('*')) {
                    // Italic: remove delimiters and wrap in <em>
                    return <em key={index} className="italic opacity-90">{part.slice(1, -1)}</em>;
                } else if (part.startsWith('__') && part.endsWith('__')) {
                    // Underline: remove delimiters and wrap in <u>
                    return <u key={index} className="underline decoration-inherit underline-offset-2">{part.slice(2, -2)}</u>;
                }
                // Regular text
                return <React.Fragment key={index}>{part}</React.Fragment>;
            })}
        </span>
    );
};
