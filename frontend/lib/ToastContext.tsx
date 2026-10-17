/**
 * lib/ToastContext.tsx
 * App-wide toast queue. Pages call `useToastContext().addToast(msg, type)`
 * and toasts render bottom-center with auto-dismiss.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Toast, { type ToastAction } from "@/components/Toast";

export type ToastType = "success" | "error" | "info";

/** Optional extras for a toast (action button, custom auto-dismiss time). */
export interface ToastOptions {
  /** Auto-dismiss delay in ms; `0` keeps the toast until replaced. */
  duration?: number;
  /** Inline action button rendered inside the toast. */
  action?: ToastAction;
}

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  duration?: number;
  action?: ToastAction;
}

interface ToastContextValue {
  addToast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });

export function useToastContext(): ToastContextValue {
  return useContext(ToastContext);
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);

  const removeToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = "info", options?: ToastOptions) => {
      const id = nextIdRef.current++;
      setToasts((current) => [
        ...current.slice(-3),
        {
          id,
          message,
          type,
          duration: options?.duration,
          action: options?.action,
        },
      ]);
    },
    []
  );

  const value = useMemo(() => ({ addToast }), [addToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          action={toast.action}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </ToastContext.Provider>
  );
}
