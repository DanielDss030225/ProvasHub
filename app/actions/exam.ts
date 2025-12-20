"use server";

import { resolve } from 'path';
import { config } from 'dotenv';
// Explicitly load .env.local with robust path resolution
try {
    const envPath = resolve(process.cwd(), '.env.local');
    config({ path: envPath });
} catch (e) {
    console.error("Failed to load .env.local via dotenv:", e);
}

import { GoogleGenerativeAI } from "@google/generative-ai";
import JSON5 from 'json5';

export interface Question {
    id: string;
    text: string;
    options: string[];
    correctAnswer?: string;
    confidence: number;
    hasGraphic?: boolean;
}

export interface SupportText {
    id: string;
    content: string;
    associatedQuestions: string;
}

export interface ExamMetadata {
    concurso?: string;        // Ex: "INSS 2024", "Polícia Federal 2023"
    banca?: string;           // Ex: "CESPE/CEBRASPE", "FCC", "VUNESP"
    cargo?: string;           // Ex: "Técnico do Seguro Social", "Delegado"
    nivel?: string;           // Ex: "Superior", "Médio", "Fundamental"
    disciplina?: string;      // Ex: "Português", "Matemática", "Direito"
    areaDisciplina?: string;  // Ex: "Interpretação de Texto", "Constitucional"
    ano?: number;             // Ex: 2024, 2023
    estado?: string;          // Ex: "SP", "RJ", "MG"
    municipio?: string;       // Ex: "São Paulo", "Rio de Janeiro"
    tipoQuestao?: 'multipla_escolha' | 'certo_errado';
}

export interface ExamData {
    title: string;
    course: string;
    questions: Question[];
    supportTexts?: SupportText[];
    metadata?: ExamMetadata;
}

/**
 * Robustly parses AI-generated JSON by surgically repairing literal newlines 
 * and structural glitches inside string values without corrupting JSON tokens.
 */
function cleanAndParseJSON(text: string): any {
    let raw = text.trim();

    // 1. Extract JSON block
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        raw = raw.substring(firstBrace, lastBrace + 1);
    } else {
        // Fallback: strip markdown fences
        raw = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    }

    // 2. Surgical Repair Scanner
    let result = "";
    let inString = false;
    let escaped = false;

    for (let i = 0; i < raw.length; i++) {
        const char = raw[i];
        const nextChar = raw[i + 1];

        if (char === '"' && !escaped) {
            if (inString) {
                let foundBoundary = false;
                for (let j = i + 1; j < Math.min(i + 20, raw.length); j++) {
                    if (/\s/.test(raw[j])) continue;
                    if (/[,\}\]:]/.test(raw[j])) {
                        foundBoundary = true;
                        break;
                    }
                    break;
                }

                if (foundBoundary) {
                    inString = false;
                    result += char;
                } else {
                    result += '\\"';
                }
            } else {
                inString = true;
                result += char;
            }
        } else if (inString) {
            if (char === '\n' || char === '\r') {
                result += '\\n';
            } else if (char === '\\' && !escaped) {
                if (/[btnfr"\\\/]/.test(nextChar) || nextChar === 'u') {
                    result += char;
                } else {
                    result += '\\\\';
                }
            } else {
                result += char;
            }
        } else {
            result += char;
        }

        if (char === '\\' && !escaped) {
            escaped = true;
        } else {
            escaped = false;
        }
    }

    let cleaned = result.replace(/,\s*(\.\.\.|\(\s*\.\.\.\s*\)|…)/g, ",");
    cleaned = cleaned.replace(/(\.\.\.|\(\s*\.\.\.\s*\)|…)\s*\]/g, "]");
    cleaned = cleaned.replace(/(\.\.\.|\(\s*\.\.\.\s*\)|…)\s*\}/g, "}");

    try {
        return JSON5.parse(cleaned);
    } catch (e: any) {
        console.error("=== JSON5 PARSE FAILED ===");
        const line = e.lineNumber || 0;
        const column = e.columnNumber || 0;
        console.error(`At Line ${line}, Col ${column}: ${e.message}`);
        throw e;
    }
}

export async function processExamAction(base64Data: string, mimeType: string = "application/pdf"): Promise<ExamData> {
    const apiKey = process.env.GEMINI_API_KEY
        || process.env.NEXT_PUBLIC_GEMINI_API_KEY
        || process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

    if (!apiKey) {
        throw new Error("Missing Gemini API Key. Please set GEMINI_API_KEY in your .env.local file.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
    }, {
        timeout: 300000,
    });

    const prompt = `
    Analyze this exam document (Portuguese).
    Extract ALL questions and support texts.
    
    **CRITICAL RULES FOR EXTRACTION**:
    1. **DESCRIPTION**: Generate a clear, concise summary of the exam (max 200 chars). Include total questions, main subjects, and level if possible.
    2. **QUESTION TEXT**: Keep ONLY the prompt/question in the 'text' field. 
       - **REMOVE** the answer options (A, B, C, D, E) from the 'text' field.
       - The 'text' should end exactly where the options start.
    3. **OPTIONS FORMAT**: The 'options' field MUST be an array of strings: \`["Option A content", "Option B content", ...]\`.
       - DO NOT return options as an object.
       - REMOVE the labels "A)", "B)", "( )", etc. from the content of the options.
    4. **SUPPORT TEXTS**: 
       - 'associatedQuestions' MUST be a string representing the range or list (e.g., "1-5" or "10, 11"). 
       - DO NOT return it as an array.
    5. **TEXT FORMATTING (PRECISION IS MANDATORY)**: 
       - Carefully observe the visual weight and style of the text in the PDF.
       - **Bold**: If a phrase is visually **bold**, wrap it with \`**\`. Be careful not to miss keywords or emphasize entire paragraphs unless they are truly bold. 
       - **IMPORTANT**: DO NOT treat text inside quotes (\`"text"\`) as bold unless it is explicitly and visually bold in the source document. Quotes should remain as plain text unless they meet the visual weight criteria.
       - **Italic**: If text is *italics*, wrap it with \`*\`.
       - **Underline**: If text is <u>underlined</u>, wrap it with \`__\`.
       - **Strict Boundaries**: Formatting tags must be placed immediately adjacent to the text (e.g., \`**bold text**\`), never with internal spaces (e.g., \`** bold text **\`).
       - Apply these rules meticulously to 'text' (questions), 'options', and 'content' (support texts).
    6. **EXHAUSTIVE**: NO truncation. Output the FULL exam.
    
    Schema:
    {
      "title": string,
      "description": string,
      "course": string,
      "metadata": { concurso, banca, cargo, nivel, disciplina, ano, estado, municipio, tipoQuestao },
      "supportTexts": [{ "id": string, "content": string, "associatedQuestions": string }],
      "questions": [{ "id": string, "text": string, "options": string[], "correctAnswer": string, "disciplina": string, "hasGraphic": boolean, "confidence": number }]
    }
  `;

    try {
        const part = { inlineData: { data: base64Data, mimeType: mimeType } };
        console.log("Requesting Gemini 2.5 Flash...");
        const result = await model.generateContent([prompt, part]);
        const response = await result.response;
        const text = response.text();

        const data = cleanAndParseJSON(text);

        // Post-processing to ensure data types match our interfaces exactly
        if (data.supportTexts) {
            data.supportTexts = data.supportTexts.map((st: any) => ({
                ...st,
                // Ensure associatedQuestions is always a string
                associatedQuestions: Array.isArray(st.associatedQuestions)
                    ? st.associatedQuestions.join(", ")
                    : String(st.associatedQuestions || "")
            }));
        }

        if (data.questions) {
            data.questions = data.questions.map((q: any) => {
                let normalizedOptions = [];
                if (Array.isArray(q.options)) {
                    normalizedOptions = q.options;
                } else if (typeof q.options === 'object' && q.options !== null) {
                    // Convert object {A: "...", B: "..."} to array ["...", "..."]
                    normalizedOptions = Object.values(q.options);
                }

                return {
                    ...q,
                    options: normalizedOptions
                };
            });
        }

        return data;
    } catch (error) {
        console.error("Action Error:", error);
        throw error;
    }
}
