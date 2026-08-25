import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success', duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast, removeToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((t) => {
          const config = {
            success: {
              bg: 'bg-slate-900 border-teal-500/30 text-white',
              icon: <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0" />,
            },
            error: {
              bg: 'bg-red-950 border-red-500/30 text-red-50',
              icon: <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />,
            },
            warning: {
              bg: 'bg-amber-950 border-amber-500/30 text-amber-50',
              icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
            },
            info: {
              bg: 'bg-slate-900 border-blue-500/30 text-white',
              icon: <Info className="w-5 h-5 text-blue-400 shrink-0" />,
            },
          }[t.type] || {
            bg: 'bg-slate-900 text-white border-slate-700',
            icon: <Info className="w-5 h-5 text-slate-400 shrink-0" />,
          };

          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-lg animate-in slide-in-from-bottom-3 duration-200 ${config.bg}`}
              role="alert"
            >
              <div className="flex items-center gap-3">
                {config.icon}
                <span className="text-sm font-medium leading-snug">{t.message}</span>
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="text-slate-400 hover:text-white p-1 transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback if not inside provider
    return {
      toast: (msg) => console.log('Toast:', msg),
      removeToast: () => {},
    };
  }
  return ctx;
}
