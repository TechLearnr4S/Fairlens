import { Loader as LucideLoader } from 'lucide-react';

export function Loader({ size = 24, className = '' }: { size?: number, className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-primary-500 ${className}`}>
      <LucideLoader size={size} className="animate-spin" />
      <span className="sr-only">Loading...</span>
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <Loader size={48} />
    </div>
  );
}
