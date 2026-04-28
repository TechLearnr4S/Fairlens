import React, { useEffect, useRef, useState } from 'react';
import { useAuditStore } from '../../store/auditStore';
import { buildDemoSummary } from '../../utils/demoSummary';
import { Play, Zap, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../utils/apiFetch';

const PROTECTED_TOKENS = new Set([
  'sex',
  'gender',
  'race',
  'ethnicity',
  'age',
  'religion',
  'disability',
  'marital',
]);

const TARGET_HINT_TOKENS = ['target', 'label', 'outcome', 'income', 'approved', 'hired', 'default'];

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function inferProtectedAttributes(columns: string[]): string[] {
  const scored = columns
    .map((col) => {
      const toks = tokenize(col);
      const matches = toks.filter((t) => PROTECTED_TOKENS.has(t)).length;
      return { col, matches };
    })
    .filter((x) => x.matches > 0)
    .sort((a, b) => b.matches - a.matches || a.col.localeCompare(b.col))
    .map((x) => x.col);

  return scored.slice(0, 3);
}

function shannonEntropy(values: string[]): number {
  const freq = new Map<string, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  const n = values.length;
  let h = 0;
  for (const count of freq.values()) {
    const p = count / n;
    h -= p * Math.log2(p);
  }
  return h;
}

function inferTargetByEntropy(
  columns: string[],
  preview: Array<Record<string, unknown>>,
  protectedAttrs: string[],
): string | null {
  if (!columns.length || !preview.length) return null;

  const protectedSet = new Set(protectedAttrs);
  const n = preview.length;
  let bestCol: string | null = null;
  let bestScore = -Infinity;

  for (const col of columns) {
    if (protectedSet.has(col)) continue;

    const vals = preview
      .map((row) => row[col])
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '-')
      .map((v) => String(v).trim());

    if (vals.length < 4) continue;
    const uniq = new Set(vals).size;
    if (uniq < 2) continue;

    const normalizedEntropy = shannonEntropy(vals) / Math.log2(Math.max(uniq, 2));
    const uniqueRatio = uniq / vals.length;
    const toks = tokenize(col);
    const hasIdHint = toks.includes('id') || toks.includes('uuid');
    const hasTargetHint = toks.some((t) => TARGET_HINT_TOKENS.includes(t));

    // Prefer columns with useful class signal; avoid identifier-like fields.
    let score = normalizedEntropy;
    if (hasTargetHint) score += 0.35;
    if (hasIdHint || uniqueRatio > 0.9) score -= 0.5;
    if (uniq >= 2 && uniq <= Math.max(4, Math.floor(n * 0.6))) score += 0.1;

    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  }

  return bestCol ?? columns[0] ?? null;
}

export const DemoController: React.FC = () => {
  const navigate = useNavigate();
  const hasAutoStarted = useRef(false);
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [status, setStatus] = useState('');

  const { 
    setFile, setColumns, setColumnTypes, setPreview, setJobId,
    setTargetColumn, setProtectedAttributes,
    setDisparities, setVerdict, setProxies, setExplanation, setDemoSummary, reset
  } = useAuditStore();

  const runDemo = async () => {
    setIsDemoRunning(true);
    setHasError(false);
    setStatus('Loading Sample Dataset...');
    
    try {
      // 1. Load dataset from /demo_data/adult_income_sample.csv
      const resCsv = await apiFetch('/demo_data/adult_income_sample.csv');
      if (!resCsv.ok) throw new Error('Failed to load demo dataset');
      const csvText = await resCsv.text();
      const blob = new Blob([csvText], { type: 'text/csv' });
      const file = new File([blob], 'adult_income_sample.csv', { type: 'text/csv' });
      
      // 2. Upload dataset
      setStatus('Uploading Dataset...');
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await apiFetch('http://localhost:8000/audits/upload', { 
        method: 'POST', 
        body: formData 
      });
      if (!uploadRes.ok) throw new Error('Failed to upload dataset');
      const uploadData = await uploadRes.json();
      
      // Reset store state first to clean up any past runs
      reset();
      
      // Set uploaded state
      setFile(file);
      setColumns(uploadData.columns);
      setColumnTypes(uploadData.column_types);
      setPreview(uploadData.preview);
      setJobId(uploadData.job_id);

      // 3. Auto-select config (fixed use-case + protected attrs + entropy target)
      setStatus('Configuring Fairness Parameters...');
      const columns: string[] = uploadData.columns ?? [];
      const preview: Array<Record<string, unknown>> = uploadData.preview ?? [];
      const protectedAttrs = inferProtectedAttributes(columns);
      const target = inferTargetByEntropy(columns, preview, protectedAttrs) ?? 'income';
      const useCase = 'Hiring';

      const configRes = await apiFetch('http://localhost:8000/audits/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: uploadData.job_id,
          target,
          protected_attributes: protectedAttrs,
          use_case: useCase,
          filename: 'adult_income_sample.csv'
        })
      });
      if (!configRes.ok) throw new Error('Failed to save audit configuration');

      // Sync state for store
      setTargetColumn(target);
      setProtectedAttributes(protectedAttrs);

      // 4. Trigger audit API automatically
      setStatus('Running fairness audit...');
      const runRes = await apiFetch(`http://localhost:8000/audits/${uploadData.job_id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_column: target,
          protected_attributes: protectedAttrs
        })
      });
      if (!runRes.ok) throw new Error('Failed to run audit');
      const auditData = await runRes.json();
      
      setDisparities(auditData.disparities);
      setProxies(auditData.proxies || []);
      setVerdict(auditData.verdict ?? null);
      // Auto-build summary payload immediately after audit completion (zero input).
      setDemoSummary(buildDemoSummary(auditData.disparities));

      // Trigger AI Explanation (Optional/Best Effort)
      try {
        const explainRes = await apiFetch(`http://localhost:8000/audits/${uploadData.job_id}/explain`, {
          method: 'POST'
        });
        if (explainRes.ok) {
          const explainData = await explainRes.json();
          setExplanation(explainData);
        }
      } catch (explainError) {
        console.warn('Optional explanation generation failed:', explainError);
      }

      // 5. Redirect to results page
      setStatus('Redirecting...');
      navigate('/');
      setIsDemoRunning(false);

    } catch (error) {
      console.error('Demo Error:', error);
      setStatus('Audit failed to complete.');
      setHasError(true);
      setIsDemoRunning(false);
    }
  };

  // Zero-click demo: run automatically when the controller mounts.
  useEffect(() => {
    if (hasAutoStarted.current) return;
    hasAutoStarted.current = true;
    void runDemo();
  }, []);

  return (
    <div className="fixed bottom-8 right-8 z-[100] flex flex-col items-end gap-4">
      {isDemoRunning && (
        <div className="bg-slate-900/90 backdrop-blur-xl border border-indigo-500/30 p-4 rounded-2xl shadow-2xl w-72 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
               <Zap className="text-indigo-400 animate-pulse" size={16} />
               <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Demo Execution</span>
            </div>
          </div>
          
          <div className="space-y-3">
             <p className="text-xs font-bold text-white leading-relaxed">
               {status}
             </p>
             <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 animate-pulse w-full" 
                />
             </div>
          </div>
        </div>
      )}

      {hasError && (
        <div className="bg-red-950/90 backdrop-blur-xl border border-red-500/30 p-4 rounded-2xl shadow-2xl w-72 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
               <AlertCircle className="text-red-400" size={16} />
               <span className="text-[10px] font-black uppercase tracking-widest text-red-400">Execution Error</span>
            </div>
          </div>
          
          <div className="space-y-3">
             <p className="text-xs font-bold text-red-200 leading-relaxed">
               {status}
             </p>
             <button 
               onClick={runDemo}
               className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all duration-300"
             >
               Retry Audit
             </button>
          </div>
        </div>
      )}

      <button 
        onClick={runDemo}
        disabled={isDemoRunning}
        className={`flex items-center gap-3 px-6 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all duration-300 shadow-xl ${
          isDemoRunning 
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' 
            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 hover:scale-105 active:scale-95'
        }`}
      >
        {isDemoRunning ? (
          <>
            <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
            <span>Presenting...</span>
          </>
        ) : (
          <>
            <Play size={18} fill="currentColor" />
            <span>Start Guided Demo</span>
          </>
        )}
      </button>
    </div>
  );
};
