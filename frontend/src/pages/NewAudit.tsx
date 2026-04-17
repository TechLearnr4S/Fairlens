import React, { useRef, useState } from 'react';
import { UploadCloud, CheckCircle, ArrowRight, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuditStore } from '../store/auditStore';

export default function NewAudit() {
  const navigate = useNavigate();
  const { currentFile, setFile, columns, setColumns, isUploading, setIsUploading, targetColumn, setTargetColumn, protectedAttributes, toggleProtectedAttribute, jobId, setJobId, setDisparities, setProxies, setExplanation } = useAuditStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleFileDrop = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.csv')) {
      setFile(file);
      await uploadToBackend(file);
    } else {
      alert("Please upload a valid CSV file");
    }
  };

  const uploadToBackend = async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      // Connect to local FastAPI
      const res = await fetch('http://localhost:8000/audits/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.columns) {
        setColumns(data.columns);
        setJobId(data.job_id);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to parse CSV via backend.");
    } finally {
      setIsUploading(false);
    }
  };

  const startAudit = async () => {
    if (!targetColumn || protectedAttributes.length === 0 || !jobId) {
      alert("Please select a target outcome and at least one protected attribute.");
      return;
    }
    
    setIsRunning(true);
    try {
      const res = await fetch('http://localhost:8000/audits/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          target_column: targetColumn,
          protected_attributes: protectedAttributes
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

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-indigo-400">
          New Fairness Audit
        </h1>
        <p className="text-slate-400 mt-2">Upload your dataset to begin diagnosing hidden bias and subgroup disparities.</p>
      </header>

      {!columns.length ? (
        <div className="glass-panel p-12 text-center border-2 border-dashed border-slate-600 hover:border-primary-500 transition-colors">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileDrop} 
            accept=".csv" 
            className="hidden" 
          />
          <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-6">
            <UploadCloud size={40} className="text-primary-400" />
          </div>
          <h2 className="text-2xl font-medium text-white mb-2">Upload Dataset or Model Predictions</h2>
          <p className="text-slate-400 mb-8 max-w-lg mx-auto">
            Upload a CSV containing your features, protected attributes (like gender, race, age), and the target prediction/outcome.
          </p>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary px-8 py-3 text-lg"
            disabled={isUploading}
          >
            {isUploading ? "Parsing File..." : "Select File"}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="glass-panel p-6 flex items-center justify-between border-green-500/30 border">
            <div className="flex items-center gap-4">
              <CheckCircle className="text-green-500" size={28} />
              <div>
                <h3 className="text-lg font-medium">Dataset Loaded Successfully</h3>
                <p className="text-slate-400 text-sm">File: {currentFile?.name} | {columns.length} features detected</p>
              </div>
            </div>
            <button onClick={() => setColumns([])} className="text-sm text-primary-400 hover:underline">Change File</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-panel p-6">
              <h3 className="text-xl font-semibold mb-4">1. Select Target Outcome</h3>
              <p className="text-slate-400 text-sm mb-4">This is the prediction or actual outcome your model uses (e.g., 'hired', 'loan_approved').</p>
              <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                {columns.map(col => (
                  <button 
                    key={col}
                    onClick={() => setTargetColumn(col)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors border ${targetColumn === col ? 'bg-primary-500/20 border-primary-500 text-white' : 'bg-dark-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
                  >
                    {col}
                  </button>
                ))}
              </div>
            </div>

            <div className="glass-panel p-6">
              <h3 className="text-xl font-semibold mb-4">2. Select Protected Attributes</h3>
              <p className="text-slate-400 text-sm mb-4">Select sensitive fields to test for disparities (e.g., 'gender', 'race', 'age_band').</p>
              <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                {columns.map(col => (
                  <button 
                    key={col}
                    onClick={() => toggleProtectedAttribute(col)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors border ${protectedAttributes.includes(col) ? 'bg-indigo-500/20 border-indigo-500 text-white flex justify-between' : 'bg-dark-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
                  >
                    <span>{col}</span>
                    {protectedAttributes.includes(col) && <CheckCircle size={18} className="text-indigo-400" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button 
              onClick={startAudit}
              disabled={!targetColumn || protectedAttributes.length === 0 || isRunning}
              className={`btn-primary flex items-center gap-2 px-8 py-3 text-lg ${(!targetColumn || protectedAttributes.length === 0 || isRunning) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isRunning ? <Loader className="animate-spin" size={20} /> : "Run Fairness Scan"}
              {!isRunning && <ArrowRight size={20} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
