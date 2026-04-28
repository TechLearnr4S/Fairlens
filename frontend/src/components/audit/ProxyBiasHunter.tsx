import { useState } from 'react';
import { 
  AlertTriangle, 
  Search, 
  Info, 
  BarChart3, 
  Table, 
  ShieldAlert, 
  Loader2, 
  TrendingDown,
  Activity
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { useAuditStore } from '../../store/auditStore';
import ProxyAiInsight from './ProxyAiInsight';
import CorrelationHeatmap from './CorrelationHeatmap';
import ProxyRiskBarChart from './ProxyRiskBarChart';
import ProxyNetworkGraph from './ProxyNetworkGraph';
import { apiFetch, isRequestTimeout } from '../../utils/apiFetch';
import { unwrapAuditBody } from '../../utils/auditEnvelope';
import { AuditEmptyState } from '../ui/AuditEmptyState';

export default function ProxyBiasHunter() {
  const { 
    jobId, 
    targetColumn, 
    protectedAttributes,
    proxyRisks,
    proxySummary,
    isProxyAnalyzing,
    setProxyRisks,
    setProxySummary,
    setCorrelationMatrix,
    setIsProxyAnalyzing,
    correlationMatrix,
    removeColumn
  } = useAuditStore();

  const [detectionError, setDetectionError] = useState(false);

  const runDetection = async () => {
    if (!jobId || !protectedAttributes.length) return;

    setDetectionError(false);
    setIsProxyAnalyzing(true);
    try {
      const res = await apiFetch(`http://localhost:8000/audits/${jobId}/proxy-risks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protected_attributes: protectedAttributes,
          target_column: targetColumn
        })
      });
      const data = unwrapAuditBody<{
        status: string;
        proxy_risks: { risk_level?: string; feature?: string; score?: number }[];
        correlation_matrix: unknown;
      }>(await res.json());
      if (data.status === 'success') {
        setProxyRisks(data.proxy_risks);
        setCorrelationMatrix(data.correlation_matrix);
        
        const summary = {
          high_risk_count: data.proxy_risks.filter((r: any) => r.risk_level === 'High').length,
          top_proxy: data.proxy_risks[0]?.feature || 'None'
        };
        setProxySummary(summary);
      }
    } catch (error) {
      console.error("Proxy detection failed:", error);
      if (!isRequestTimeout(error)) setDetectionError(true);
    } finally {
      setIsProxyAnalyzing(false);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'High': return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      case 'Medium': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'Low': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  const chartData = proxyRisks.slice(0, 5).map(r => ({
    name: r.feature,
    score: r.score,
    risk: r.risk_level
  }));

  if (!jobId) {
    return (
      <div className="space-y-6">
        <AuditEmptyState
          variant="no-audit"
          title="Proxy Bias Hunter"
          description="Load an audit job to analyze proxy correlations and indirect discrimination risks."
          className="glass-panel"
        />
      </div>
    );
  }

  if (protectedAttributes.length === 0) {
    return (
      <div className="space-y-6">
        <AuditEmptyState
          variant="missing-data"
          title="Protected attributes required"
          description="Choose at least one sensitive attribute during audit setup so we can estimate proxy leakage."
          cta={{ label: 'Configure audit', to: '/new-audit' }}
          className="glass-panel"
        />
      </div>
    );
  }

  if (!targetColumn) {
    return (
      <div className="space-y-6">
        <AuditEmptyState
          variant="missing-data"
          title="Prediction column not selected"
          description={
            'Proxy analysis ties candidate features to your outcome and sensitive groups. Choose the column your system predicts or decides (e.g. approval, score, label) in the audit wizard’s target step, then return here to run detection.'
          }
          cta={{ label: 'Set target column', to: '/new-audit' }}
          className="glass-panel"
        />
      </div>
    );
  }

  return (
    <div id="proxy-hunter" className="space-y-6">
      {detectionError && (
        <AuditEmptyState
          variant="failed-api"
          title="Proxy detection failed"
          description="The analysis did not finish. Confirm the API is up, then retry."
          onRetry={() => void runDetection()}
          retryLabel="Retry detection"
          compact
          className="glass-panel border-rose-500/20"
        />
      )}
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="text-rose-500" />
            Proxy Bias Hunter
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Detecting variables that indirectly leak sensitive information and perpetuate systemic bias.
          </p>
        </div>
        <button
          onClick={runDetection}
          disabled={isProxyAnalyzing || !jobId}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all duration-300 ${
            isProxyAnalyzing 
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
              : 'bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white shadow-lg shadow-rose-900/20 active:scale-95'
          }`}
        >
          {isProxyAnalyzing ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              <span>Analyzing Proxy Rels...</span>
            </>
          ) : (
            <>
              <Search size={18} />
              <span>Detect Proxy Bias</span>
            </>
          )}
        </button>
      </div>

      {/* Main Analysis Area */}
      {isProxyAnalyzing ? (
        <div className="glass-panel p-12 flex flex-col items-center justify-center text-center space-y-4 animate-pulse">
          <div className="w-16 h-16 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400">
            <Activity size={32} className="animate-pulse" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-white">Analyzing Proxy Relationships</h3>
            <p className="text-slate-400 max-w-sm mt-2">
              Our engine is computing Mutual Information and Pearson correlations across your feature space...
            </p>
          </div>
        </div>
      ) : proxyRisks.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Summary Card */}
          <div className="lg:col-span-1 space-y-6">
            <div className="glass-panel p-6 border-rose-500/20 bg-gradient-to-br from-dark-800 to-rose-950/10">
              <h3 className="text-lg font-semibold mb-4 text-slate-200 flex items-center gap-2">
                <ShieldAlert size={18} className="text-rose-400" />
                Risk Concentration
              </h3>
              <div className="space-y-4">
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-black text-rose-500">{proxySummary?.high_risk_count || 0}</span>
                  <span className="text-slate-400 mb-2 font-medium">High Risk Features</span>
                </div>
                <div className="p-3 bg-dark-900/50 rounded-lg border border-slate-700/50">
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-wider">Top Proxy Offender</p>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-rose-300">{proxySummary?.top_proxy || 'N/A'}</span>
                    <TrendingDown size={18} className="text-rose-500 opacity-50" />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Chart */}
            <div className="glass-panel p-6 border-slate-700/50">
              <h3 className="text-lg font-semibold mb-4 text-slate-200 flex items-center gap-2">
                <BarChart3 size={18} className="text-primary-400" />
                Proxy Scores
              </h3>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" hide />
                    <YAxis domain={[0, 1]} hide />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }}
                      itemStyle={{ color: '#f8fafc' }}
                    />
                    <Bar dataKey="score" radius={[4, 4, 4, 4]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.risk === 'High' ? '#f43f5e' : entry.risk === 'Medium' ? '#f59e0b' : '#10b981'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-slate-500 text-center mt-2 uppercase font-bold tracking-tighter italic">Top 5 Risky Features</p>
            </div>
          </div>

          {/* Ranking Bar Chart */}
          <div className="lg:col-span-2">
            <ProxyRiskBarChart data={proxyRisks} />
          </div>

          {/* Detailed Table */}
          <div className="lg:col-span-3 glass-panel overflow-hidden border-slate-700/50 flex flex-col max-h-[600px]">
            <div className="p-4 border-b border-slate-700/50 bg-slate-800/30 flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2 text-slate-200">
                <Table size={18} className="text-primary-400" />
                Analysis Results
              </h3>
              <div className="flex gap-2">
                <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase"><div className="w-2 h-2 rounded-full bg-rose-500" /> High</span>
                <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase"><div className="w-2 h-2 rounded-full bg-amber-500" /> Med</span>
                <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Low</span>
              </div>
            </div>
            <div className="overflow-auto flex-1 custom-scrollbar">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="sticky top-0 bg-dark-800 z-10 shadow-sm">
                  <tr>
                    <th className="px-6 py-4 border-b border-slate-700 font-bold text-slate-500 uppercase tracking-widest text-[10px]">Feature</th>
                    <th className="px-6 py-4 border-b border-slate-700 font-bold text-slate-500 uppercase tracking-widest text-[10px]">Correlation Score</th>
                    <th className="px-6 py-4 border-b border-slate-700 font-bold text-slate-500 uppercase tracking-widest text-[10px]">Risk Level</th>
                  </tr>
                </thead>
                <tbody>
                  {proxyRisks.map((entry, i) => (
                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-700/10 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-200">{entry.feature}</span>
                          {entry.is_proxy && (
                            <div className="flex items-center gap-2">
                               <div className="group relative">
                                <AlertTriangle size={14} className="text-rose-400 animate-pulse" />
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-900 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-slate-700 shadow-2xl">
                                  This feature may indirectly encode protected attributes. Score: {entry.score.toFixed(3)}
                                </div>
                              </div>
                              <button 
                                onClick={() => removeColumn(entry.feature)}
                                className="opacity-0 group-hover:opacity-100 px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[9px] font-black uppercase tracking-widest rounded border border-rose-500/30 transition-all active:scale-95"
                              >
                                Remove Feature
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-1000 ${entry.risk_level === 'High' ? 'bg-rose-500' : entry.risk_level === 'Medium' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${entry.score * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-slate-400 text-xs">{(entry.score).toFixed(3)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border ${getRiskColor(entry.risk_level)}`}>
                          {entry.risk_level}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <AuditEmptyState
          variant="missing-data"
          icon={Search}
          title="Ready to scan for proxies"
          description="Run the detection engine to score features that may leak protected attributes."
          cta={{ label: 'Run proxy detection', onClick: () => void runDetection() }}
          className="glass-panel border-dashed border-slate-600/50"
          compact
        />
      )}

      {/* Advanced Visualizations */}
      {correlationMatrix && (
        <div className="space-y-6">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
            <CorrelationHeatmap matrix={correlationMatrix} />
          </div>
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
            <ProxyNetworkGraph matrix={correlationMatrix} />
          </div>
        </div>
      )}

      {/* AI Explanation layer */}
      {proxyRisks.length > 0 && (
        <div className="mt-8">
          <ProxyAiInsight />
        </div>
      )}

      {/* Info Legend */}
      <div className="bg-primary-500/5 border border-primary-500/10 rounded-xl p-4 flex items-start gap-4">
        <Info className="text-primary-400 shrink-0" size={20} />
        <div className="text-xs text-slate-400 leading-relaxed">
          <p>
            <strong className="text-primary-300">How it works:</strong> We use Mutual Information (MI) for categorical relationships and Pearson Correlation for numeric features. 
            A score above <span className="text-rose-400">0.5</span> indicates a high risk of proxy measurement, where the feature correlates strongly with protected attributes like Race, Gender, or Age.
          </p>
        </div>
      </div>
    </div>
  );
}

