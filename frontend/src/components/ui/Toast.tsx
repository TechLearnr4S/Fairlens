import React, { useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ id, message, type, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), 5000);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  const config = {
    success: { icon: CheckCircle2, bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
    error:   { icon: XCircle,      bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    text: 'text-rose-400' },
    warning: { icon: AlertTriangle, bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   text: 'text-amber-400' },
    info:    { icon: AlertTriangle, bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20',  text: 'text-indigo-400' },
  };

  const { icon: Icon, bg, border, text } = config[type];

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${bg} ${border} shadow-lg animate-in slide-in-from-right-full duration-300`}>
      <Icon size={18} className={text} />
      <p className={`text-sm font-medium ${text}`}>{message}</p>
      <button 
        onClick={() => onDismiss(id)}
        className="ml-2 p-1 hover:bg-white/10 rounded-md transition-colors text-slate-400"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC<{ toasts: {id: string, message: string, type: ToastType}[] , onDismiss: (id: string) => void }> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-md">
      {toasts.map(t => (
        <Toast key={t.id} {...t} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
