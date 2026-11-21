"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-xl font-bold">কিছু একটা সমস্যা হয়েছে</h1>
      <p className="mt-1 text-sm text-gray-500">একটু পরে আবার চেষ্টা করুন। সমস্যা থাকলে সাপোর্টে জানান।</p>
      <div className="mt-5 flex justify-center gap-2">
        <button onClick={reset} className="btn-primary">আবার চেষ্টা করুন</button>
        <a href="/" className="btn-secondary">হোম</a>
      </div>
    </div>
  );
}
