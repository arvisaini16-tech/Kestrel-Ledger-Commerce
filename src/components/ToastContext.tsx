import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface ToastMessage {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
}

interface ToastContextValue {
  pushToast: (variant: ToastVariant, title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (variant: ToastVariant, title: string, description?: string) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, variant, title, description }]);
      setTimeout(() => removeToast(id), 5500);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border p-3.5 shadow-lg flex items-start gap-3 transition-all ${
              t.variant === 'success'
                ? 'bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-700 text-slate-900 dark:text-slate-100'
                : t.variant === 'error'
                ? 'bg-white dark:bg-slate-900 border-red-300 dark:border-red-700 text-slate-900 dark:text-slate-100'
                : t.variant === 'warning'
                ? 'bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-700 text-slate-900 dark:text-slate-100'
                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100'
            }`}
          >
            {t.variant === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            ) : t.variant === 'error' || t.variant === 'warning' ? (
              <AlertTriangle
                className={`w-4 h-4 mt-0.5 shrink-0 ${
                  t.variant === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                }`}
              />
            ) : (
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0 text-xs">
              <p className="font-semibold leading-snug">{t.title}</p>
              {t.description && (
                <p className="mt-1 text-slate-600 dark:text-slate-400 leading-relaxed">{t.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label="Dismiss notification"
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      pushToast: () => {},
    };
  }
  return ctx;
}
