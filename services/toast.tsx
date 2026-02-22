
import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useRef,
    ReactNode
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: string;
    type: ToastType;
    message: string;
}

interface ToastContextValue {
    toast: {
        success: (message: string) => void;
        error: (message: string) => void;
        info: (message: string) => void;
    };
}

// ─── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// ─── Toast Item ────────────────────────────────────────────────────────────────

const TOAST_CONFIG: Record<ToastType, { icon: React.FC<any>; bg: string; border: string; iconClass: string }> = {
    success: { icon: CheckCircle, bg: 'bg-green-950/95', border: 'border-green-500/50', iconClass: 'text-green-400' },
    error: { icon: XCircle, bg: 'bg-red-950/95', border: 'border-red-500/50', iconClass: 'text-red-400' },
    info: { icon: Info, bg: 'bg-royal-900/95', border: 'border-white/20', iconClass: 'text-blue-400' },
};

const ToastItem: React.FC<{ toast: Toast; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
    const cfg = TOAST_CONFIG[toast.type];
    const Icon = cfg.icon;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.22 }}
            className={`flex items-start gap-3 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-lg max-w-sm w-full ${cfg.bg} ${cfg.border}`}
        >
            <Icon size={20} className={`flex-shrink-0 mt-0.5 ${cfg.iconClass}`} />
            <p className="text-sm text-white flex-1 leading-snug">{toast.message}</p>
            <button
                onClick={() => onDismiss(toast.id)}
                className="flex-shrink-0 text-white/40 hover:text-white transition-colors ml-1 mt-0.5"
                aria-label="Dismiss notification"
            >
                <X size={16} />
            </button>
        </motion.div>
    );
};

// ─── Provider ──────────────────────────────────────────────────────────────────

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const dismiss = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
        const timer = timers.current.get(id);
        if (timer) { clearTimeout(timer); timers.current.delete(id); }
    }, []);

    const addToast = useCallback((type: ToastType, message: string) => {
        const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        setToasts(prev => [{ id, type, message }, ...prev].slice(0, 5));
        const timer = setTimeout(() => dismiss(id), 4000);
        timers.current.set(id, timer);
    }, [dismiss]);

    const toast = {
        success: (msg: string) => addToast('success', msg),
        error: (msg: string) => addToast('error', msg),
        info: (msg: string) => addToast('info', msg),
    };

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            {/* Fixed Toast Container */}
            <div
                className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
                aria-live="polite"
                aria-atomic="false"
            >
                <AnimatePresence mode="popLayout">
                    {toasts.map(t => (
                        <div key={t.id} className="pointer-events-auto">
                            <ToastItem toast={t} onDismiss={dismiss} />
                        </div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
};

// ─── Hook ──────────────────────────────────────────────────────────────────────

export const useToast = (): ToastContextValue['toast'] => {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx.toast;
};
