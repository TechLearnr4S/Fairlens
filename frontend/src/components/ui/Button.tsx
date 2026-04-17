import type { ButtonHTMLAttributes } from 'react';
import { Loader } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = "inline-flex items-center justify-center font-medium transition-all duration-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-900 active:scale-95 disabled:opacity-50 disabled:pointer-events-none";
  
  const variants = {
    primary: "bg-gradient-to-r from-primary-500 to-indigo-500 hover:from-primary-400 hover:to-indigo-400 text-white shadow-lg shadow-primary-500/25 focus:ring-primary-500",
    secondary: "bg-dark-700 hover:bg-dark-600 text-white border border-slate-600 focus:ring-slate-500",
    outline: "border-2 border-primary-500 text-primary-400 hover:bg-primary-500/10 focus:ring-primary-500",
    ghost: "text-slate-300 hover:bg-dark-800 hover:text-white focus:ring-slate-500",
    danger: "bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/25 focus:ring-rose-500"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-base",
    lg: "px-6 py-3 text-lg"
  };

  const widthStyle = fullWidth ? "w-full" : "";

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${widthStyle} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader className="w-4 h-4 mr-2 animate-spin" />}
      {children}
    </button>
  );
}
