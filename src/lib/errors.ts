/** A user-facing error with a Bangla message and a stable code. */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof AppError) return e.message;
  console.error(e);
  return "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।";
}
