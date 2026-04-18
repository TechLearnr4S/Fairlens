import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  LabelList
} from 'recharts';
import { TrendingUp, AlertCircle } from 'lucide-react';

interface ProxyRiskBarChartProps {
  data: any[];
}

export default function ProxyRiskBarChart({ data }: ProxyRiskBarChartProps) {
  const chartData = [...data].sort((a, b) => b.score - a.score).slice(0, 8);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const entry = payload[0].payload;
      return (
        <div className="bg-dark-950 border border-slate-700 p-3 rounded-lg shadow-2xl backdrop-blur-md">
          <p className="text-xs font-black uppercase text-slate-500 mb-1 tracking-widest">{entry.feature}</p>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">{entry.score.toFixed(3)}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
              entry.risk_level === 'High' ? 'bg-rose-500/20 text-rose-400' : 
              entry.risk_level === 'Medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
            }`}>
              {entry.risk_level} Risk
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 italic">Max Correlation with: {entry.max_protected}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="glass-panel p-6 border-slate-700/50 bg-slate-900/20 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <TrendingUp size={20} className="text-primary-400" />
            Top Proxy Risk Features
          </h3>
          <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-bold font-mono">
            Direct Association Ranking
          </p>
        </div>
        <div className="w-10 h-10 rounded-full bg-slate-800/50 flex items-center justify-center text-slate-500 border border-slate-700/50">
          <AlertCircle size={20} />
        </div>
      </div>

      <div className="flex-1 w-full min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={chartData} 
            layout="vertical" 
            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
            barSize={24}
          >
            <XAxis type="number" domain={[0, 1]} hide />
            <YAxis 
              dataKey="feature" 
              type="category" 
              tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} 
              width={100}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            <Bar dataKey="score" radius={[0, 6, 6, 0]} animationDuration={1500}>
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.risk_level === 'High' ? '#f43f5e' : entry.risk_level === 'Medium' ? '#fbbf24' : '#10b981'}
                  style={{ filter: index < 3 ? 'drop-shadow(0 0 4px rgba(244, 63, 94, 0.4))' : '' }}
                />
              ))}
              <LabelList 
                dataKey="score" 
                position="right" 
                formatter={(val: number) => val.toFixed(2)} 
                style={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold', fontFamily: 'monospace' }} 
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-4 flex gap-4 pt-4 border-t border-slate-800/50">
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
          <div className="w-2 h-2 rounded-full bg-rose-500" /> High Risk
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
          <div className="w-2 h-2 rounded-full bg-amber-400" /> Med Risk
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
          <div className="w-2 h-2 rounded-full bg-emerald-500" /> Low Risk
        </div>
      </div>
    </div>
  );
}
