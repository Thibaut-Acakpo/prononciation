import { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, PartyPopper, X, WifiOff } from "lucide-react";

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  celebration: PartyPopper,
  offline: WifiOff,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, { type = "success", duration = 4000 } = {}) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-stack">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.type] || CheckCircle2;
          return (
            <div key={toast.id} className={`toast toast--${toast.type}`}>
              <Icon size={20} />
              <span>{toast.message}</span>
              <button onClick={() => dismissToast(toast.id)} aria-label="Fermer">
                <X size={14} />
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
  if (!ctx) throw new Error("useToast doit être utilisé à l'intérieur de <ToastProvider>.");
  return ctx;
}
