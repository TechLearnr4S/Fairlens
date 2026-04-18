import React, { useRef, useState, useCallback } from 'react';
import { UploadCloud, CheckCircle, ArrowRight, Loader, Table, Shield, Target, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuditStore } from '../store/auditStore';
import { auth } from '../firebase';

export default function NewAudit() {
  const navigate = useNavigate();
  const { 
    currentFile, setFile, 
    columns, setColumns, 
    columnTypes, setColumnTypes,
    preview, setPreview,
    isUploading, setIsUploading, 
    targetColumn, setTargetColumn, 
    protectedAttributes, toggleProtectedAttribute, 
    jobId, setJobId, 
    setDisparities, setProxies, setExplanation 
  } = useAuditStore();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isConfigSaving, setIsConfigSaving] = useState(false);

  const handleFile = async (file: File) => {
    if (file && file.name.endsWith('.csv')) {
      setFile(file);
      await uploadToBackend(file);
    } else {
      alert("Please upload a valid CSV file");
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const uploadToBackend = async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:8000/audits/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.columns) {
        setColumns(data.columns);
        setColumnTypes(data.column_types);
        setPreview(data.preview);
        setJobId(data.job_id);
        setFileUrl(data.file_url);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to parse CSV via backend.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfigSave = async () => {
    if (!targetColumn || protectedAttributes.length === 0 || !jobId) return;

    setIsConfigSaving(true);
    try {
      await fetch('http://localhost:8000/audits/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          user_id: auth.currentUser?.uid || "anonymous",
          target: targetColumn,
          protected_attributes: protectedAttributes,
          filename: currentFile?.name,
          file_url: fileUrl
        })
      });
    } catch (error) {
      console.error("Config save failed:", error);
    } finally {
      setIsConfigSaving(false);
    }
  };

  const [groundTruthColumn, setGroundTruthColumn] = useState<string | null>(null);

  const startAudit = async () => {
    await handleConfigSave();
    
    setIsRunning(true);
    try {
      const res = await fetch(`http://localhost:8000/audits/${jobId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_column: targetColumn,
          protected_attributes: protectedAttributes,
          ground_truth_column: groundTruthColumn
        })
      });
      const data = await res.json();
      if (data.disparities) {
         setDisparities(data.disparities);
         setProxies(data.proxies || []);
         setExplanation(data.explanation || null);
         navigate('/');
      }
    } catch (error) {
       console.error("Audit run failed:", error);
       alert("Error running audit. Check console.");
    } finally {
       setIsRunning(false);
    }
  };

  const isConfigComplete = targetColumn && protectedAttributes.length > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-indigo-400">
            New Fairness Audit
          </h1>
          <p className="text-slate-400 mt-2">Upload your dataset to begin diagnosing hidden bias and subgroup disparities.</p>
        </div>
        {columns.length > 0 && (
          <button onClick={() => {
            setColumns([]);
            setPreview([]);
            setTargetColumn(null);
            setGroundTruthColumn(null);
          }} className="text-sm text-slate-500 hover:text-primary-400 transition-colors flex items-center gap-1">
            <AlertCircle size={14} /> Start over
          </button>
        )}
      </header>

      {!columns.length ? (
        <div 
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`glass-panel p-16 text-center border-2 border-dashed transition-all duration-300 ${isDragging ? 'border-primary-500 bg-primary-500/5 scale-[1.01]' : 'border-slate-700 hover:border-slate-500'}`}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} 
            accept=".csv" 
            className="hidden" 
          />
          <div className="w-24 h-24 rounded-full bg-dark-800 flex items-center justify-center mx-auto mb-8 shadow-inner border border-slate-700">
            {isUploading ? (
               <Loader size={48} className="text-primary-400 animate-spin" />
            ) : (
               <UploadCloud size={48} className={`${isDragging ? 'text-primary-400' : 'text-slate-500'}`} />
            )}
          </div>
          <h2 className="text-2xl font-semibold text-white mb-3">
            {isUploading ? "Processing Dataset..." : "Upload CSV Dataset"}
          </h2>
          <p className="text-slate-400 mb-10 max-w-lg mx-auto leading-relaxed">
            Drag and drop your file here, or click to browse. We support CSV files containing features and protected attributes.
          </p>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-10 py-4 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white rounded-xl font-bold text-lg shadow-xl shadow-primary-900/20 transition-all active:scale-95 disabled:opacity-50"
            disabled={isUploading}
          >
            {isUploading ? "Parsing..." : "Select CSV File"}
          </button>
        </div>
      ) : (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-700">
          {/* Dataset Preview Section */}
          <section className="glass-panel overflow-hidden border-slate-700/50">
            <div className="p-4 border-b border-slate-700/50 bg-slate-800/30 flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2 text-slate-200">
                <Table size={18} className="text-primary-400" />
                Dataset Preview (First 10 Rows)
              </h3>
              <span className="text-xs text-slate-500 uppercase tracking-wider font-bold">
                {currentFile?.name}
              </span>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="sticky top-0 bg-dark-800 z-10 shadow-sm">
                  <tr>
                    {columns.map(col => (
                      <th key={col} className="px-4 py-3 border-b border-slate-700 font-medium text-slate-400 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span>{col}</span>
                          <span className={`text-[10px] uppercase font-bold ${columnTypes[col] === 'numeric' ? 'text-emerald-500' : 'text-amber-500'}`}>
                            {columnTypes[col]}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-700/20 transition-colors">
                      {columns.map(col => (
                        <td key={col} className="px-4 py-3 text-slate-300 whitespace-nowrap max-w-[200px] truncate">
                          {String(row[col] ?? '-')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Configuration Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              {/* Target Column Selection */}
              <div className="glass-panel p-6 border-slate-700/50">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center text-primary-400">
                    <Target size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Target Prediction</h3>
                    <p className="text-xs text-slate-400">Select the model prediction column.</p>
                  </div>
                </div>
                
                <div className="relative">
                  <select 
                    className="w-full bg-dark-900 border border-slate-700 rounded-xl px-4 py-4 text-slate-200 focus:ring-2 focus:ring-primary-500 outline-none appearance-none cursor-pointer"
                    value={targetColumn || ''}
                    onChange={(e) => setTargetColumn(e.target.value)}
                  >
                    <option value="" disabled>Select Target Column...</option>
                    {columns.map(col => (
                      <option key={col} value={col}>{col} ({columnTypes[col]})</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                     <ArrowRight size={18} className="rotate-90" />
                  </div>
                </div>
              </div>

              {/* Ground Truth Selection */}
              <div className="glass-panel p-6 border-slate-700/50">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center text-teal-400">
                    <CheckCircle size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Ground Truth <span className="text-xs text-slate-500 font-normal">(Optional)</span></h3>
                    <p className="text-xs text-slate-400">Select actual labels to compute FPR/FNR.</p>
                  </div>
                </div>
                
                <div className="relative">
                  <select 
                    className="w-full bg-dark-900 border border-slate-700 rounded-xl px-4 py-4 text-slate-200 focus:ring-2 focus:ring-teal-500 outline-none appearance-none cursor-pointer"
                    value={groundTruthColumn || ''}
                    onChange={(e) => setGroundTruthColumn(e.target.value)}
                  >
                    <option value="">None (Use Target as Label)</option>
                    {columns.map(col => (
                      <option key={col} value={col}>{col} ({columnTypes[col]})</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                     <ArrowRight size={18} className="rotate-90" />
                  </div>
                </div>
              </div>
            </div>

            {/* Protected Attributes Selection */}
            <div className="glass-panel p-6 border-slate-700/50">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Shield size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Protected Attributes</h3>
                  <p className="text-xs text-slate-400">Select sensitive traits (e.g. Race, Gender).</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                {columns.map(col => (
                  <button 
                    key={col}
                    onClick={() => toggleProtectedAttribute(col)}
                    className={`flex items-center justify-between px-3 py-3 rounded-lg border transition-all ${
                      protectedAttributes.includes(col) 
                        ? 'bg-indigo-500/20 border-indigo-500 text-white' 
                        : 'bg-dark-900 border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <span className="text-xs font-medium truncate mr-2">{col}</span>
                    {protectedAttributes.includes(col) && <CheckCircle size={14} className="text-indigo-400 shrink-0" />}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {protectedAttributes.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No attributes selected yet.</p>
                ) : (
                  protectedAttributes.map(attr => (
                    <span key={attr} className="px-2 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded text-[10px] font-bold text-indigo-300 uppercase">
                      {attr}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex flex-col items-center gap-4 pt-8">
            <button 
              onClick={startAudit}
              disabled={!isConfigComplete || isRunning || isConfigSaving}
              className={`group relative overflow-hidden px-12 py-5 rounded-2xl font-bold text-xl transition-all duration-300 ${
                isConfigComplete 
                  ? 'bg-gradient-to-r from-primary-500 to-indigo-600 text-white shadow-2xl shadow-primary-500/20 hover:scale-105 active:scale-95' 
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3 relative z-10">
                {isRunning ? (
                  <>
                    <Loader className="animate-spin" size={24} />
                    <span>Analyzing Bias...</span>
                  </>
                ) : (
                  <>
                    <span>Run Fairness Audit</span>
                    <ArrowRight size={24} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </div>
              {isConfigComplete && (
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              )}
            </button>
            {!isConfigComplete && (
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <AlertCircle size={14} />
                Please select both a target and at least one protected attribute.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
