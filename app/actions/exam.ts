"use server";

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

export interface ExamData {
    title: string;
    course: string;
    questions: Question[];
    supportTexts?: SupportText[];
}

// Helper to clean and parse JSON resiliently using JSON5
function cleanAndParseJSON(text: string): any {
    let cleaned = text;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        cleaned = jsonMatch[0];
    } else {
        cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    }

    try {
        return JSON5.parse(cleaned);
    } catch (e) {
        console.error("JSON5 parse failed. Raw text start:", cleaned.substring(0, 500));
        throw e;
    }
}

export async function processExamAction(base64Data: string, mimeType: string = "application/pdf"): Promise<ExamData> {
    // Check multiple possible env var names
    const apiKey = process.env.GEMINI_API_KEY
        || process.env.NEXT_PUBLIC_GEMINI_API_KEY
        || process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

    if (!apiKey) {
        console.error("Available env vars:", Object.keys(process.env).filter(k => k.includes("GEMINI") || k.includes("API") || k.includes("GOOGLE")));
        throw new Error("GEMINI_API_KEY is not configured on the server. Please add GEMINI_API_KEY=your_key to your .env.local file.");
    }

    // Initialize Gemini with the key
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
    }, {
        timeout: 300000, // 5 minutes timeout for large PDFs
    });

    const prompt = `
    Analyze the following exam document (PDF/Image) which is in **Portuguese**.
    Extract the structured data maintaining the original language (Portuguese) for titles, texts, and options.
    
    **CRITICAL INSTRUCTIONS**:
    1. **Structure**: Identify Title, Course, and **Support Texts**.
       - **CRITICAL**: Search for support texts **throughout the entire document**, not just at the beginning.
       - Look for texts interspersed between questions (e.g., "Leia o texto a seguir para responder as questões X a Y", "Texto para a questão 26").
       - Extract these texts and link them to the correct questions in 'associatedQuestions'.
    2. **Questions**: Extract all questions.
       - **hasGraphic**: Set to true if the question refers to an image, graph, map, or figure (e.g., "observe a figura", "o gráfico mostra").
    3. **Answer Key (Gabarito)**: Look for an answer key at the end of the document. If found, mark the 'correctAnswer' field for each question. If not found, try to infer or leave null.
    4. **TEXT FORMATTING - VERY IMPORTANT**:
       - Preserve text formatting using Markdown syntax:
         - **Bold text** → use **text** (double asterisks)
         - *Italic text* → use *text* (single asterisks)
         - Underlined text → use <u>text</u> (HTML underline tag)
       - Apply this to question texts, options, and support texts.
       - This is crucial for maintaining the original exam appearance.
    
    Return a valid JSON object with the following schema:
    {
      "title": "Titulo da Prova",
      "course": "Nome da Disciplina",
      "supportTexts": [
        { "id": "Texto I", "content": "Full text with **formatting**...", "associatedQuestions": "1-3" }
      ],
      "questions": [
        {
          "id": "1",
          "text": "Texto da questão com **negrito** e *itálico*...",
          "options": ["a) Opção com **destaque**...", "b) ..."],
          "correctAnswer": "a", 
          "hasGraphic": true,
          "confidence": 0.95
        }
      ]
    }
    
    Ensure strict JSON output without markdown code fences. Escape all special characters in strings.
  `;

    try {
        const part = {
            inlineData: {
                data: base64Data,
                mimeType: mimeType
            }
        };

        console.log("Sending payload to Gemini (Server Action)...");

        let result;
        let retries = 3;
        while (retries > 0) {
            try {
                result = await model.generateContent([prompt, part]);
                break;
            } catch (e: any) {
                if (e.message?.includes("503") || e.message?.includes("overloaded") || e.message?.includes("429")) {
                    console.warn(`Model overloaded, retrying in 2s... (${retries} retries left)`);
                    retries--;
                    await new Promise(res => setTimeout(res, 2000));
                } else {
                    throw e;
                }
            }
        }
        if (!result) throw new Error("Failed to process exam after multiple retries due to server overload.");

        console.log("Received response from Gemini");
        const response = await result.response;
        const text = response.text();

        return cleanAndParseJSON(text);
    } catch (error) {
        console.error("Error processing exam inside server action:", error);
        throw error;
    }
}
