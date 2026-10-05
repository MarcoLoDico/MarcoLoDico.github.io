import { Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const TOAST_DURATION_MS = 2200;

export function useToast(): { message: string | null; showToast: (message: string) => void } {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const showToast = useCallback((nextMessage: string) => {
    window.clearTimeout(timer.current);
    setMessage(nextMessage);
    timer.current = window.setTimeout(() => setMessage(null), TOAST_DURATION_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { message, showToast };
}

export function Toast({ message }: { readonly message: string | null }) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {message && (
        <div className="toast">
          <Check size={16} aria-hidden="true" />
          {message}
        </div>
      )}
    </div>
  );
}
