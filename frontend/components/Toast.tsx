/**
 * components/Toast.tsx
 * Lightweight toast notification with auto-dismiss and fade-out.
 */

import { useEffect, useState } from "react";
import clsx from "clsx";

export interface ToastProps {
  message: string;
  type?: "success" | "error" | "info";
  onClose?: () => void;
  duration?: number;
  /** Optional inline action button, e.g. "Reload" on the update prompt. */
  action?: ToastAction;
}

/** Clickable action rendered inside a toast. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export default function Toast({ message, type = "info", onClose, duration = 3000, action }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // A duration of 0 (or less) keeps the toast on screen until replaced.
    if (duration <= 0) return;

    const timer = setTimeout(() => {
      setVisible(false);
      if (onClose) {
        setTimeout(onClose, 300); // Wait for fade out
      }
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
        "px-4 py-2.5 rounded-xl text-sm font-medium text-white",
        "border shadow-xl transition-all duration-300",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        type === "success" && "bg-emerald-600 border-emerald-500",
        type === "error" && "bg-red-600 border-red-500",
        type === "info" && "bg-slate-800 border-white/10"
      )}
    >
      <div className="flex items-center gap-2">
        {type === "success" && (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {type === "error" && (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        {message}
        {action && (
          <button
            type="button"
            onClick={() => {
              if (onClose) onClose();
              action.onClick();
            }}
            className="ml-1 rounded-lg border border-white/30 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-white/10"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
