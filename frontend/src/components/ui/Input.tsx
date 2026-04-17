import { forwardRef, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, fullWidth = true, type = 'text', ...props }, ref) => {
    const widthStyle = fullWidth ? 'w-full' : '';
    const errorStyle = error ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-700 hover:border-slate-600 focus:ring-primary-500';

    return (
      <div className={`flex flex-col space-y-1.5 ${widthStyle} ${className}`}>
        {label && (
          <label className="text-sm font-medium text-slate-300">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            type={type}
            className={`w-full bg-dark-800/80 text-white border rounded-lg px-4 py-2.5 outline-none transition-all duration-200 focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-900 ${errorStyle} disabled:opacity-50 disabled:bg-dark-900`}
            {...props}
          />
          {error && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <AlertCircle className="h-5 w-5 text-rose-500" />
            </div>
          )}
        </div>
        {error && <p className="text-sm text-rose-500 mt-1">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>(
  (props, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          type={showPassword ? 'text' : 'password'}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className={`absolute right-3 ${props.error ? 'top-8' : 'top-9'} -translate-y-1/2 text-slate-400 hover:text-slate-200 focus:outline-none`}
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';
