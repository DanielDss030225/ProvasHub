"use client";

import { useState } from "react";
import { BookOpen, MessageSquare, Share2, CheckCircle, XCircle, ArrowRight, User, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { FormattedText } from "./FormattedText";
import { CommentsSection } from "./CommentsSection";

interface QuestionCardProps {
    question: {
        id: string;
        text: string;
        options: string[];
        correctAnswer?: string;
        graphicUrl?: string;
        supportText?: string;
        concurso: string;
        banca: string;
        cargo: string;
        nivel: string;
        disciplina: string;
        ano: number;
        examTitle?: string;
        questionIndex?: number;
        createdByDisplayName?: string;
        createdByPhotoURL?: string;
        isVerified?: boolean;
    };
    userAnswer?: string;
    isAnswered: boolean;
    isCorrect?: boolean;
    previousResult?: boolean;
    onAnswer: (questionId: string, optionLetter: string, e: React.MouseEvent<HTMLButtonElement>) => void;
    onShare: (questionId: string) => void;
    hasComments?: boolean;
}

export function QuestionCard({
    question,
    userAnswer,
    isAnswered,
    isCorrect,
    previousResult,
    onAnswer,
    onShare,
    hasComments
}: QuestionCardProps) {
    const [showSupportText, setShowSupportText] = useState(false);
    const [showComments, setShowComments] = useState(false);
    const [selectedOption, setSelectedOption] = useState<string | null>(null);

    // Determine if the current answer is correct or if a previous result was correct
    const currentIsCorrect = isAnswered && isCorrect;

    return (
        <div className={clsx(
            "bg-white dark:bg-slate-900 rounded-2xl p-6 md:p-8 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group",
            isAnswered
                ? (isCorrect ? "border-2 border-green-500" : "border-2 border-red-500")
                : "border border-slate-200 dark:border-slate-800"
        )}>

            {/* Header: Exam Title & Question Number */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-100 dark:border-slate-800/50 pb-4">
                <div className="flex flex-col gap-1">
                    {question.examTitle && (
                        <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                            {question.examTitle}
                        </h3>
                    )}
                    <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-slate-700 dark:text-slate-200">
                            Questão {question.questionIndex !== undefined ? question.questionIndex + 1 : "?"}
                        </span>
                        {question.isVerified === false && (
                            <span className="px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white rounded-lg shadow-md shadow-amber-500/20 flex items-center gap-1 animate-pulse">
                                <AlertTriangle className="w-3 h-3" />
                                Pendente de Gabarito
                            </span>
                        )}
                    </div>
                </div>

                {/* Status Badge */}
                {(isAnswered || previousResult !== undefined) && (
                    <div className={clsx(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tight shadow-sm border animate-in fade-in zoom-in duration-300",
                        currentIsCorrect || previousResult === true
                            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                            : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800"
                    )}>
                        {currentIsCorrect || previousResult === true ? (
                            <><CheckCircle className="w-3 h-3" /> Correta</>
                        ) : (
                            <><XCircle className="w-3 h-3" /> Incorreta</>
                        )}
                    </div>
                )}
            </div>

            {/* Metadata Badges */}
            <div className="flex flex-wrap gap-2 mb-6">
                {question.banca && (
                    <span className="px-3 py-1 text-xs font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 rounded-lg border border-blue-100 dark:border-blue-900/30">
                        {question.banca}
                    </span>
                )}
                {question.ano && (
                    <span className="px-3 py-1 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700">
                        {question.ano}
                    </span>
                )}
                {question.disciplina && (
                    <span className="px-3 py-1 text-xs font-bold bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300 rounded-lg border border-violet-100 dark:border-violet-900/30">
                        {question.disciplina}
                    </span>
                )}
                {question.cargo && (
                    <span className="px-3 py-1 text-xs font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 rounded-lg border border-indigo-100 dark:border-indigo-900/30">
                        {question.cargo}
                    </span>
                )}
                {question.concurso && (
                    <span className="px-3 py-1 text-xs font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300 rounded-lg border border-amber-100 dark:border-amber-900/30">
                        {question.concurso}
                    </span>
                )}
                {question.nivel && (
                    <span className="px-3 py-1 text-xs font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                        {question.nivel}
                    </span>
                )}
                {(question.createdByDisplayName || question.createdByPhotoURL) && (
                    <div className="flex items-center gap-2 px-3 py-1 text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700">
                        {question.createdByPhotoURL ? (
                            <img src={question.createdByPhotoURL} alt={question.createdByDisplayName} className="w-4 h-4 rounded-full" />
                        ) : (
                            <div className="w-4 h-4 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-[10px] text-slate-500">
                                <User className="w-2.5 h-2.5" />
                            </div>
                        )}
                        <span className="truncate max-w-[100px]">
                            {question.createdByDisplayName || "Anônimo"}
                        </span>
                    </div>
                )}
            </div>

            {/* Support Text Toggle */}
            {question.supportText && (
                <div className="mb-6">
                    <button
                        onClick={() => setShowSupportText(!showSupportText)}
                        className="flex items-center gap-2 text-sm font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors bg-amber-50 dark:bg-amber-900/10 px-4 py-2 rounded-lg border border-amber-100 dark:border-amber-900/20 w-full md:w-auto justify-center md:justify-start"
                    >
                        <BookOpen className="w-4 h-4" />
                        {showSupportText ? "Ocultar" : "Mostrar"} Texto de Apoio
                    </button>

                    {showSupportText && (
                        <div className="mt-3 bg-white dark:bg-slate-800 border-l-4 border-amber-400 p-4 md:p-6 shadow-sm rounded-r-lg animate-in fade-in slide-in-from-top-2 duration-300">
                            <h4 className="text-xs font-bold text-amber-600 uppercase mb-2">Texto de Apoio</h4>
                            <FormattedText
                                text={question.supportText}
                                className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 block"
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Question Text */}
            <div className="mb-8">
                <FormattedText
                    text={question.text}
                    className="text-base md:text-xl font-medium text-slate-800 dark:text-slate-100 leading-relaxed block"
                />
            </div>

            {/* Graphic */}
            {question.graphicUrl && (
                <div className="mb-8 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <img
                        src={question.graphicUrl}
                        alt="Imagem da questão"
                        className="max-w-full h-auto max-h-[500px] rounded-lg mx-auto shadow-md"
                    />
                </div>
            )}

            {/* Options */}
            <div className="grid grid-cols-1 gap-3 mb-8">
                {question.options?.map((opt, idx) => {
                    const letter = String.fromCharCode(97 + idx);
                    const isSelected = userAnswer === letter;
                    const isCurrentlySelected = selectedOption === letter;
                    const isCorrectOption = letter.toLowerCase() === (question.correctAnswer?.toLowerCase() || '');

                    let containerStyle = "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:border-violet-200 dark:hover:border-violet-700";
                    let letterStyle = "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 group-hover:bg-violet-100 dark:group-hover:bg-slate-600 group-hover:text-violet-700";

                    if (isAnswered) {
                        if (isCorrectOption) {
                            containerStyle = "border-green-500/50 bg-green-50/50 dark:bg-green-900/10";
                            letterStyle = "bg-green-500 text-white shadow-green-200";
                        } else if (isSelected && !isCorrectOption) {
                            containerStyle = "border-red-500/50 bg-red-50/50 dark:bg-red-900/10";
                            letterStyle = "bg-red-500 text-white shadow-red-200";
                        } else {
                            containerStyle = "border-slate-100 dark:border-slate-800 opacity-60";
                        }
                    } else if (isCurrentlySelected) {
                        containerStyle = "border-violet-600 bg-violet-50 dark:bg-violet-900/20 shadow-sm";
                        letterStyle = "bg-violet-600 text-white shadow-violet-200";
                    }

                    return (
                        <button
                            key={idx}
                            id={`option-${question.id}-${letter}`}
                            onClick={() => !isAnswered && setSelectedOption(letter)}
                            disabled={isAnswered}
                            className={clsx(
                                "w-full text-left p-4 md:p-5 rounded-2xl border-2 transition-all flex items-start gap-4 group relative overflow-hidden",
                                containerStyle,
                                isAnswered && !isCorrectOption && !isSelected && "hover:bg-transparent cursor-default"
                            )}
                        >
                            <div className={clsx(
                                "w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center text-sm md:text-base font-bold shrink-0 transition-all shadow-sm",
                                letterStyle
                            )}>
                                {isAnswered && isCorrectOption ? (
                                    <CheckCircle className="w-5 h-5" />
                                ) : isAnswered && isSelected && !isCorrectOption ? (
                                    <XCircle className="w-5 h-5" />
                                ) : (
                                    letter.toUpperCase()
                                )}
                            </div>
                            <div className="pt-1 md:pt-1.5">
                                <FormattedText
                                    text={opt}
                                    className={clsx(
                                        "text-sm md:text-base leading-relaxed",
                                        isAnswered && isCorrectOption
                                            ? "text-green-900 dark:text-green-100 font-medium"
                                            : isAnswered && isSelected && !isCorrectOption
                                                ? "text-red-900 dark:text-red-100"
                                                : isSelected
                                                    ? "text-violet-900 dark:text-violet-100 font-medium"
                                                    : "text-slate-700 dark:text-slate-300"
                                    )}
                                />
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Confirm Answer Button */}
            {!isAnswered && selectedOption && (
                <div className="mb-6 flex justify-end animate-in fade-in slide-in-from-left-2 duration-300">
                    <button
                        onClick={(e) => onAnswer(question.id, selectedOption, e)}
                        className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:shadow-violet-500/30 hover:-translate-y-0.5 transition-all flex items-center gap-3 text-sm"
                    >
                        <span>Confirmar</span>
                        <div className="w-5 h-5 rounded-md bg-white/20 dark:bg-slate-900/10 flex items-center justify-center text-[10px]">
                            {selectedOption.toUpperCase()}
                        </div>
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-slate-800/50">
                <button
                    onClick={() => setShowComments(!showComments)}
                    className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-400 transition-colors"
                >
                    <MessageSquare className="w-4 h-4" />
                    <span className="flex items-center gap-2">
                        {showComments ? "Ocultar Comentários" : "Comentários e Discussão"}
                        {hasComments && !showComments && (
                            <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
                            </span>
                        )}
                    </span>
                </button>

                <button
                    onClick={() => onShare(question.id)}
                    className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors"
                >
                    <Share2 className="w-4 h-4" />
                    <span className="hidden xs:inline">Compartilhar</span>
                </button>
            </div>

            {/* Comments Section */}
            {showComments && (
                <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800/50 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 md:p-6">
                        <div className="h-[400px]">
                            <CommentsSection questionId={question.id} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
