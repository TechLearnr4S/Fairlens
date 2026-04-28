import { useState, useRef, useCallback } from 'react';
import { useAuditStore } from '../../store/auditStore';
import {
  UploadCloud, Cpu, CheckCircle2, AlertCircle,
  Loader2, FileCode2, ChevronRight, Info
} from 'lucide-react';
import { EnhancedColumnSelector } from './EnhancedColumnSelector';
import { apiFetch } from '../../utils/apiFetch';
import { AuditEmptyState } from '../ui/AuditEmptyState';

const ACCEPTED = ['.pkl', '.joblib'];

export default function ModelUploader() {
  const { jobId, columns, setDisparities, setProxies, setExplanation } = useAuditStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<{ status: string; predictions_added: number; column_name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [featureCols, setFeatureCols] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nonTargetCols = columns.filter(c => c !== 'target');

  const handleFile = useCallback(async (file: File) => {
    const ext = '.' + file.name.split('.').pop();
    if (!ACCEPTED.includes(ext)) {
      setError(`Unsupported format. Upload a ${ACCEPTED.join(' or ')} file.`);
      return;
    }
    setSelectedFile(file);
    setError(null);
  }, []);

  const handleUpload = async () => {
    if (!jobId || !selectedFile) return;
    setIsUploading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('model_file', selectedFile);
      if (featureCols.length > 0) {
        fd.append('feature_columns', featureCols.join(','));
      }
      const res = await apiFetch(`http://localhost:8000/audits/${jobId}/upload-model`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Upload failed');
      setResult(data);
      // Re-fetch audit results since model predictions were injected
      const auditRes = await apiFetch(`http://localhost:8000/audits/${jobId}/run`, { method: 'GET' }).catch(() => null);
      if (auditRes?.ok) {
        const auditData = await auditRes.json();
        if (auditData.disparities) setDisparities(auditData.disparities);
        if (auditData.proxies) setProxies(auditData.proxies);
        if (auditData.explanation) setExplanation(auditData.explanation);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload error');
    } finally {
      setIsUploading(false);
    }
  };

  const toggleFeatureCol = (col: string) => {
    setFeatureCols(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  if (!jobId) {
    return (
      <AuditEmptyState
        variant="no-audit"
        title="Model file audit"
        description="Complete a dataset audit first. Then you can attach a pickle/joblib model to score predictions."
        compact
        className="glass-panel rounded-3xl border-slate-700/50"
      />
    );
  }

  return (
    <div className="glass-panel p-8 bg-slate-900/40 border-slate-700/50 rounded-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 bg-violet-500/15 rounded-2xl shrink-0">
          <Cpu size={22} className="text-violet-400" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-3">
            Model File Auditor
            <span className="px-2 py-0.5 text-[10px] font-black bg-violet-500/20 border border-violet-500/30 text-violet-400 rounded-full uppercase tracking-widest">
              New
            </span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Upload a trained sklearn model <span className="font-mono text-slate-300">.pkl</span> or <span className="font-mono text-slate-300">.joblib</span> — FairLens runs inference on your dataset and audits the model's own predictions.
          </p>
        </div>
      </div>

      {/* How it works callout */}
      <div className="flex items-start gap-3 p-4 bg-indigo-500/5 border border-indigo-500/15 rounded-xl">
        <Info size={15} className="text-indigo-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-400 leading-relaxed">
          <span className="text-indigo-300 font-bold">How this works:</span> FairLens loads your model, calls <span className="font-mono">.predict()</span> on your uploaded dataset, injects the output as a synthetic column, then runs the full fairness pipeline — proxy detection, disparity analysis, and Bootstrap CIs — on your model's actual decisions.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 group ${
          isDragging
            ? 'border-violet-500 bg-violet-500/10 scale-[1.01]'
            : selectedFile
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : 'border-slate-700 hover:border-violet-500/50 hover:bg-violet-500/5'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pkl,.joblib"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {selectedFile ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
              <FileCode2 size={24} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">{selectedFile.name}</p>
              <p className="text-slate-500 text-xs mt-0.5">{(selectedFile.size / 1024).toFixed(1)} KB</p>
            </div>
            <p className="text-[10px] text-slate-600 uppercase tracking-widest">Click to change</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center group-hover:bg-violet-500/15 transition-colors">
              <UploadCloud size={24} className="text-slate-500 group-hover:text-violet-400 transition-colors" />
            </div>
            <div>
              <p className="text-slate-300 font-bold text-sm">Drop your model here</p>
              <p className="text-slate-600 text-xs mt-1">Supports sklearn .pkl and .joblib</p>
            </div>
          </div>
        )}
      </div>

      {/* Feature column selector */}
      {nonTargetCols.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Feature Columns <span className="text-slate-600">(optional — leave empty to use all)</span>
            </label>
            {featureCols.length > 0 && (
              <button
                onClick={() => setFeatureCols([])}
                className="text-[10px] font-bold text-slate-500 hover:text-slate-300 uppercase tracking-widest"
              >
                Clear
              </button>
            )}
          </div>
          <EnhancedColumnSelector
            columns={nonTargetCols}
            selectedColumns={featureCols}
            onToggle={toggleFeatureCol}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl">
          <AlertCircle size={16} className="text-rose-400 shrink-0" />
          <p className="text-rose-300 text-sm">{error}</p>
        </div>
      )}

      {/* Success result */}
      {result && (
        <div className="p-5 bg-emerald-500/8 border border-emerald-500/25 rounded-2xl space-y-3 animate-in fade-in duration-500">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={20} className="text-emerald-400" />
            <p className="text-emerald-300 font-bold text-sm">Model inference complete</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Predictions Generated</p>
              <p className="text-xl font-black text-white font-mono">{result.predictions_added.toLocaleString()}</p>
            </div>
            <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Injected as Column</p>
              <p className="text-sm font-black text-violet-400 font-mono">{result.column_name}</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 flex items-center gap-2">
            <ChevronRight size={12} />
            Scroll down to the Bias Sandbox to simulate mitigation on your model's predictions.
          </p>
        </div>
      )}

      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={!selectedFile || isUploading}
        className={`w-full py-4 rounded-xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-[0.98] ${
          !selectedFile || isUploading
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-xl shadow-violet-500/20'
        }`}
      >
        {isUploading ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Running Inference...
          </>
        ) : (
          <>
            <Cpu size={18} />
            Upload & Audit Model
          </>
        )}
      </button>
    </div>
  );
}
