/**
 * Admin utility functions for ProvasHub
 * Checks if a user has admin privileges based on email
 */

const ADMIN_EMAIL = 'maispraticodesenvolvimento@gmail.com';

/**
 * Check if a user is an admin
 * @param userEmail - The email address of the user
 * @returns true if the user is an admin, false otherwise
 */
export const isAdmin = (userEmail: string | null | undefined): boolean => {
    if (!userEmail) return false;
    return userEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase();
};

/**
 * Extract question ID from a question URL
 * Supports formats:
 * - /dashboard/questions/solve?id=QUESTION_ID
 * - https://domain.com/dashboard/questions/solve?id=QUESTION_ID
 * @param url - The question URL or ID
 * @returns The question ID or null if invalid
 */
export const extractQuestionId = (url: string): string | null => {
    if (!url) return null;

    // If it's already just an ID (no URL structure), return it
    if (!url.includes('/') && !url.includes('?')) {
        return url.trim();
    }

    try {
        // Try to parse as URL
        const urlObj = new URL(url);
        const questionId = urlObj.searchParams.get('id');
        if (questionId) return questionId;
    } catch {
        // Not a valid URL, try to extract from string
        const match = url.match(/[?&]id=([^&]+)/);
        if (match && match[1]) return match[1];
    }

    return null;
};

/**
 * Validate and parse multiple question URLs/IDs
 * @param inputs - Array of URLs or IDs
 * @returns Array of valid question IDs
 */
export const parseQuestionInputs = (inputs: string[]): string[] => {
    return inputs
        .map(input => extractQuestionId(input))
        .filter((id): id is string => id !== null && id.length > 0);
};
