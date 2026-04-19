import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rect' | 'circle';
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', variant = 'rect', style }) => {
  const base = "animate-pulse bg-slate-800/50";
  const variants = {
    text: "h-4 rounded-md w-3/4",
    rect: "rounded-xl",
    circle: "rounded-full aspect-square",
  };

  return <div className={`${base} ${variants[variant]} ${className}`} style={style} />;
};

export const CardSkeleton: React.FC = () => (
  <div className="glass-panel p-6 rounded-2xl border border-slate-800/50 bg-slate-900/20">
    <Skeleton variant="text" className="w-1/3 mb-4" />
    <Skeleton className="h-40 w-full mb-4" />
    <div className="flex gap-2">
      <Skeleton variant="circle" className="w-8" />
      <Skeleton variant="text" className="flex-1 mt-2" />
    </div>
  </div>
);

export const ChartSkeleton: React.FC = () => (
  <div className="h-64 flex items-end gap-2 p-4 border border-slate-800/30 rounded-xl">
    {[...Array(12)].map((_, i) => (
      <Skeleton 
        key={i} 
        className="flex-1" 
        style={{ height: `${Math.random() * 80 + 20}%` }} 
      />
    ))}
  </div>
);
