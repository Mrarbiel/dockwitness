'use client';

import { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center rounded-lg border border-red-200 bg-red-50/50 m-4">
      <h2 className="text-xl font-semibold text-red-800 mb-2">Something went wrong!</h2>
      <p className="text-sm text-red-600 mb-6 max-w-md">
        An unexpected error occurred in the application interface.
      </p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
