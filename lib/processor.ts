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

// Deprecated: Use Server Action in app/actions/exam.ts instead
export async function processExam(base64Data: string, mimeType: string = "application/pdf"): Promise<ExamData> {
  throw new Error("This function has been moved to the server side (Server Actions) for security. Please use processExamAction.");
}
