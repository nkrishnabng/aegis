"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

interface ToastItem {
  id: number;
  message: string;
  kind: "success" | "error";
}

interface ToastContextValue {
  showToast: (message: string, kind?: "success" | "error") => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = useCallback((message: string, kind: "success" | "error" = "success") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div className="toast-container">
            {toasts.map((t) => (
              <div key={t.id} className={`toast ${t.kind}`}>
                {t.message}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
