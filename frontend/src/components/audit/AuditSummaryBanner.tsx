import React from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle, TrendingDown, Users } from 'lucide-react';
import { useAuditStore } from '../../store/auditStore';

export const AuditSummaryBanner: React.FC = () => {
  const { disparities, explanation } = useAuditStore();

  if (!disparities) return null;

  // Derive risk profile
  const attrs = Object.keys(disparities);
  const maxDisp = Math.max(...attrs.map(a => disparities[a].disparity_score));
  const highRisk = attrs.filter(a => disparities[a].risk_level === 'High');
  
  const riskLevel = maxDisp > 0.2 ? 'High' : maxDisp > 0.1 ? 'Medium' : 'Low';
  
  const config = {
    High:   { icon: ShieldAlert, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', label: 'High Fairness Risk' },
    Medium: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'Moderate Risk' },
    Low:    { icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'Low Risk / Fair' },
  };

  const { icon: Icon, color, bg, border, label } = config[riskLevel];

  return (
    <div className={`glass-panel p-6 rounded-3xl border ${border} ${bg} mb-8 animate-in fade-in slide-in-from-top-4 duration-500`}>
      <div className="flex flex-col lg:flex-row lg:items-center gap-8">
        {/* Risk Badge */}
        <div className="flex items-center gap-4 min-w-[240px]">
          <div className={`p-4 rounded-2xl ${bg} ${color} border ${border}`}>
            <Icon size={32} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Status</p>
            <h2 className={`text-xl font-black ${color}`}>{label}</h2>
          </div>
        </div>

        {/* Key Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 flex-1">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-slate-900/50 rounded-xl text-indigo-400">
              <TrendingDown size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Max Disparity</p>
              <p className="text-lg font-black text-white">{(maxDisp * 100).toFixed(1)}% Gap</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-slate-900/50 rounded-xl text-indigo-400">
              <Users size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Critical Group</p>
              <p className="text-lg font-black text-white">{highRisk[0] || attrs[0] || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Recommendation Snippet */}
        {explanation && (
          <div className="lg:max-w-md bg-white/5 p-4 rounded-2xl border border-white/10">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-2">AI Recommendation</p>
            <p className="text-sm text-slate-300 line-clamp-2 leading-relaxed italic">
              "{explanation.recommendations?.[0] || 'Perform mitigation review immediately.'}"
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
