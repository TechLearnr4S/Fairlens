import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { 
  UploadCloud, CheckCircle, ArrowRight, ArrowLeft, Loader,
  Shield, Target, AlertCircle, Briefcase, CreditCard, HeartPulse, 
  Scale, LayoutGrid, Play
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuditStore } from '../store/auditStore';
import { auth } from '../firebase';
import { useToast } from '../components/providers/ToastProvider';
import { apiFetch, isRequestTimeout } from '../utils/apiFetch';

const USE_CASES = [
  { id: 'Hiring', icon: Briefcase, title: 'Hiring / Recruitment', desc: 'EEOC guidelines & 4/5ths Rule' },
  { id: 'Credit Scoring', icon: CreditCard, title: 'Credit Scoring / Lending', desc: 'ECOA & Fair Housing Act' },
  { id: 'Healthcare', icon: HeartPulse, title: 'Healthcare / Medical', desc: 'ACA Section 1557' },
  { id: 'Criminal Justice', icon: Scale, title: 'Criminal Justice', desc: '14th Amend. / ProPublica' },
  { id: 'Other', icon: LayoutGrid, title: 'Other / General', desc: 'Standard fairness metrics' },
];

/** Token match for sex | gender | race | ethnicity in column names (case-insensitive tokens, e.g. `applicant_race`). */
const DATASET_RECOMMENDED_TOKENS = new Set([
  'sex', 'sexes', 'gender', 'genders', 'race', 'races', 'ethnicity', 'ethnicities',
]);

function columnMatchesDatasetRecommendation(columnName: string): boolean {
  const tokens = columnName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.some(
    (t) => DATASET_RECOMMENDED_TOKENS.has(t) || t.startsWith('ethnic'),
  );
}

function listDatasetRecommendedColumns(columnsList: string[]): string[] {
  return columnsList.filter(columnMatchesDatasetRecommendation);
}

const getSmartBadge = (col: string) => {
  const lower = col.toLowerCase();
  if (['sex', 'gender'].includes(lower)) return { label: 'Likely gender-sensitive', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' };
  if (['race', 'ethnicity', 'color'].includes(lower)) return { label: 'Likely race-sensitive', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' };
  if (['age'].includes(lower)) return { label: 'Protected age attribute', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
  if (['zip', 'zipcode', 'neighborhood', 'address'].includes(lower)) return { label: 'Potential geographic proxy', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
  if (['marital', 'married'].includes(lower)) return { label: 'Protected marital status', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
  if (['disability', 'handicap'].includes(lower)) return { label: 'Protected health attribute', color: 'bg-teal-500/20 text-teal-400 border-teal-500/30' };
  return null;
};

export default function NewAudit() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { 
    currentFile, setFile, 
    columns, setColumns, 
    columnTypes, setColumnTypes,
    preview, setPreview,
    isUploading, setIsUploading, 
    targetColumn, setTargetColumn, 
    protectedAttributes, toggleProtectedAttribute, setProtectedAttributes,
    jobId, setJobId, 
    setDisparities, setVerdict, setProxies, setExplanation, setDemoSummary
  } = useAuditStore();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isConfigSaving, setIsConfigSaving] = useState(false);
  
  // Wizard State
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [useCase, setUseCase] = useState<string>('');
  const [groundTruthColumn, setGroundTruthColumn] = useState<string | null>(null);
  const step2RecommendationSeeded = useRef(false);

  const recommendedColumnSet = useMemo(() => {
    const rec = listDatasetRecommendedColumns(columns);
    return new Set(rec);
  }, [columns]);

  useEffect(() => {
    if (currentStep < 2) {
      step2RecommendationSeeded.current = false;
      return;
    }
    if (currentStep !== 2 || step2RecommendationSeeded.current || columns.length === 0) return;

    const recommended = listDatasetRecommendedColumns(columns);
    step2RecommendationSeeded.current = true;
    if (recommended.length === 0) return;

    setProtectedAttributes((prev) => [...new Set([...prev, ...recommended])]);
  }, [currentStep, columns, setProtectedAttributes]);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      addToast("Please upload a CSV file.", 'error');
      return;
    }
    setFile(file);
    await uploadToBackend(file);
  };

  const uploadToBackend = async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiFetch('http://localhost:8000/audits/upload', {
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
        setCurrentStep(1); // Proceed to step 1
      }
    } catch (error) {
      console.error(error);
      if (isRequestTimeout(error)) return;
      addToast("Failed to parse CSV via backend.", 'error');
    } finally {
      setIsUploading(false);
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

  const handleConfigSave = async () => {
    if (!targetColumn || protectedAttributes.length === 0 || !jobId) return;

    setIsConfigSaving(true);
    try {
      await apiFetch('http://localhost:8000/audits/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          user_id: auth.currentUser?.uid || "anonymous",
          target: targetColumn,
          protected_attributes: protectedAttributes,
          filename: currentFile?.name,
          file_url: fileUrl,
          use_case: useCase || 'Other'
        })
      });
    } catch (error) {
      console.error("Config save failed:", error);
    } finally {
      setIsConfigSaving(false);
    }
  };

  const startAudit = async () => {
    await handleConfigSave();
    setDemoSummary(null);

    setIsRunning(true);
    try {
      const res = await apiFetch(`http://localhost:8000/audits/${jobId}/run`, {
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
         setVerdict(data.verdict ?? null);
         setExplanation(data.explanation || null);
         navigate('/');
      }
    } catch (error) {
       console.error("Audit run failed:", error);
       if (isRequestTimeout(error)) return;
       addToast("Error running audit. Check console.", 'error');
    } finally {
       setIsRunning(false);
    }
  };

  const handleUseCaseSelect = (id: string) => {
    setUseCase(id);
    
    // Auto-suggest attributes based on use case
    const matchCols = (keywords: string[]) => {
      return columns.filter(col => keywords.some(kw => col.toLowerCase().includes(kw)));
    };
    
    let suggestions: string[] = [];
    if (id === 'Hiring') {
      suggestions = matchCols(['race', 'gender', 'sex', 'age', 'disability', 'ethnicity']);
    } else if (id === 'Credit Scoring') {
      suggestions = matchCols(['race', 'gender', 'sex', 'age', 'marital', 'zip', 'neighborhood']);
    } else if (id === 'Healthcare') {
      suggestions = matchCols(['race', 'gender', 'sex', 'age', 'insurance', 'income']);
    }
    
    // Automatically select suggested attributes that aren't already selected
    suggestions.forEach(attr => {
       if (!protectedAttributes.includes(attr)) {
          toggleProtectedAttribute(attr);
       }
    });
  };

  const resetAll = () => {
    setColumns([]);
    setPreview([]);
    setTargetColumn(null);
    setGroundTruthColumn(null);
    setCurrentStep(0);
    setUseCase('');
  };

  const getTargetHint = (col: string) => {
    const vals = Array.from(new Set(preview.map(r => r[col])));
    if (vals.length === 2 && vals.every(v => v !== undefined && v !== null)) {
      const count0 = preview.filter(r => r[col] === vals[0]).length;
      const count1 = preview.filter(r => r[col] === vals[1]).length;
      return (
        <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300 ml-2">
          Sample: {vals[0]} ({count0*10}%) / {vals[1]} ({count1*10}%)
        </span>
      );
    }
    return <span className="text-[10px] text-slate-500 uppercase ml-2">{columnTypes[col]}</span>;
  };

  const nextDisabled = 
    (currentStep === 1 && !useCase) || 
    (currentStep === 2 && protectedAttributes.length === 0) || 
    (currentStep === 3 && !targetColumn);

  const handleNext = () => {
    if (!nextDisabled) setCurrentStep(c => c + 1);
  };

  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep(c => c - 1);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 tracking-tight">
            New Fairness Audit
          </h1>
          <p className="text-slate-400 mt-2 font-medium flex items-center gap-2">
            Diagnose hidden bias and subgroup disparities.
            {currentStep > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-black tracking-widest border border-indigo-500/20">
                Step {currentStep}/4
              </span>
            )}
          </p>
        </div>
        {currentStep > 0 && (
          <button onClick={resetAll} className="text-sm text-slate-500 hover:text-indigo-400 transition-colors flex items-center gap-1 bg-dark-800 px-3 py-1.5 rounded-lg border border-slate-700">
            <AlertCircle size={14} /> Start over
          </button>
        )}
      </header>


      {/* Stepper Header */}
      {currentStep > 0 && (
        <div className="flex items-center justify-between mb-8 relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-800 z-0 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${((currentStep - 1) / 3) * 100}%` }}
            />
          </div>
          {[1, 2, 3, 4].map(step => (
            <div 
              key={step} 
              className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-4 border-dark-900 transition-all duration-300
                ${currentStep >= step ? 'bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'bg-slate-800 text-slate-500'}
              `}
            >
              {currentStep > step ? <CheckCircle size={18} /> : step}
            </div>
          ))}
        </div>
      )}

      {currentStep === 0 && (
        <div 
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`glass-panel p-16 text-center border-2 border-dashed transition-all duration-300 ${isDragging ? 'border-indigo-500 bg-indigo-500/5 scale-[1.01]' : 'border-slate-700 hover:border-slate-500'}`}
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
               <Loader size={48} className="text-indigo-400 animate-spin" />
            ) : (
               <UploadCloud size={48} className={`${isDragging ? 'text-indigo-400' : 'text-slate-500'}`} />
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
            className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-lg shadow-xl shadow-indigo-900/20 transition-all active:scale-95 disabled:opacity-50"
            disabled={isUploading}
          >
            {isUploading ? "Parsing..." : "Select CSV File"}
          </button>
        </div>
      )}

      {currentStep === 1 && (
        <div className="glass-panel p-8 animate-in slide-in-from-right-8 duration-500">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-white mb-2">What does your system decide?</h2>
            <p className="text-slate-400">This helps us automatically map your audit to the correct legal and regulatory frameworks.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {USE_CASES.map(uc => {
              const Icon = uc.icon;
              const isSelected = useCase === uc.id;
              return (
                <button
                  key={uc.id}
                  onClick={() => handleUseCaseSelect(uc.id)}
                  className={`flex items-start gap-4 p-5 rounded-xl border text-left transition-all duration-200 ${
                    isSelected 
                      ? 'bg-indigo-500/10 border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.15)] ring-1 ring-indigo-500' 
                      : 'bg-dark-800 border-slate-700 hover:border-slate-500 hover:bg-slate-800'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <h3 className={`font-bold text-lg ${isSelected ? 'text-white' : 'text-slate-300'}`}>{uc.title}</h3>
                    <p className={`text-sm mt-1 ${isSelected ? 'text-indigo-300' : 'text-slate-500'}`}>{uc.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="glass-panel p-8 animate-in slide-in-from-right-8 duration-500">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Who could be affected unfairly?</h2>
            <p className="text-slate-400">Select the sensitive or protected attributes you want to audit for discrimination.</p>
            <p className="text-slate-500 text-sm mt-3 max-w-xl mx-auto">
              Columns named <span className="text-slate-400 font-mono text-xs">sex</span>,{' '}
              <span className="text-slate-400 font-mono text-xs">gender</span>,{' '}
              <span className="text-slate-400 font-mono text-xs">race</span>, or{' '}
              <span className="text-slate-400 font-mono text-xs">ethnicity</span> are pre-selected when present. You can toggle any row.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            {columns.map(col => {
              const badge = getSmartBadge(col);
              const isDatasetRecommended = recommendedColumnSet.has(col);
              const isSelected = protectedAttributes.includes(col);
              return (
                <button 
                  key={col}
                  type="button"
                  onClick={() => toggleProtectedAttribute(col)}
                  className={`flex flex-col px-5 py-4 rounded-xl border transition-all text-left ${
                    isSelected 
                      ? 'bg-indigo-500/10 border-indigo-500 ring-1 ring-indigo-500' 
                      : 'bg-dark-800 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <span className={`font-bold ${isSelected ? 'text-indigo-400' : 'text-slate-300'}`}>{col}</span>
                    <div className={`w-5 h-5 shrink-0 rounded-full border flex items-center justify-center ${isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-600'}`}>
                      {isSelected && <CheckCircle size={12} />}
                    </div>
                  </div>
                  {isDatasetRecommended && (
                    <p className="mt-2 text-[11px] font-semibold text-emerald-400/90">
                      Recommended based on dataset
                    </p>
                  )}
                  {badge && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className={`text-[10px] uppercase font-black tracking-wider px-2 py-1 rounded border ${badge.color}`}>
                        {badge.label}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {currentStep === 3 && (
        <div className="glass-panel p-8 animate-in slide-in-from-right-8 duration-500">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-white mb-2">What column holds the final decision?</h2>
            <p className="text-slate-400">Select the target column your model predicts (e.g. loan_approved, hired, risk_score).</p>
          </div>
          
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            {columns.map(col => {
              const isSelected = targetColumn === col;
              return (
                <button 
                  key={col}
                  onClick={() => setTargetColumn(col)}
                  className={`w-full flex items-center justify-between px-6 py-4 rounded-xl border transition-all text-left ${
                    isSelected 
                      ? 'bg-indigo-500/10 border-indigo-500 ring-1 ring-indigo-500' 
                      : 'bg-dark-800 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-600'}`}>
                      {isSelected && <CheckCircle size={12} />}
                    </div>
                    <span className={`font-bold ${isSelected ? 'text-indigo-400' : 'text-slate-300'}`}>{col}</span>
                    {getTargetHint(col)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {currentStep === 4 && (
        <div className="glass-panel p-8 animate-in slide-in-from-right-8 duration-500">
          <div className="mb-8 text-center">
            <div className="w-20 h-20 bg-emerald-500/10 border-2 border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Shield size={32} className="text-emerald-400" />
            </div>
            <h2 className="text-3xl font-black text-white mb-3">Review & Launch</h2>
            <p className="text-slate-400 max-w-lg mx-auto">
              Your audit is configured and ready to run. We will evaluate the dataset for hidden bias and proxy risks.
            </p>
          </div>
          
          <div className="bg-dark-800 border border-slate-700 rounded-2xl p-6 mb-8 max-w-xl mx-auto">
            <h3 className="text-lg font-bold text-white mb-4">Audit Summary</h3>
            <ul className="space-y-4">
              <li className="flex gap-3">
                <Target className="text-slate-500 mt-0.5 shrink-0" size={18} />
                <div>
                  <p className="text-sm text-slate-400">Target Decision</p>
                  <p className="font-bold text-white">{targetColumn}</p>
                </div>
              </li>
              <li className="flex gap-3">
                <Shield className="text-indigo-500 mt-0.5 shrink-0" size={18} />
                <div>
                  <p className="text-sm text-indigo-300">Protected Attributes ({protectedAttributes.length})</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {protectedAttributes.map(attr => (
                      <span key={attr} className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded text-xs font-bold uppercase">
                        {attr}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <Briefcase className="text-slate-500 mt-0.5 shrink-0" size={18} />
                <div>
                  <p className="text-sm text-slate-400">Use Case & Regulations</p>
                  <p className="font-bold text-white">{USE_CASES.find(u => u.id === useCase)?.title || 'Other'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{USE_CASES.find(u => u.id === useCase)?.desc}</p>
                </div>
              </li>
            </ul>
          </div>
          
          <div className="flex justify-center">
            <button 
              onClick={startAudit}
              disabled={isRunning || isConfigSaving}
              className="group relative overflow-hidden px-14 py-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl font-black text-xl shadow-2xl shadow-emerald-900/30 transition-all active:scale-95 disabled:opacity-50"
            >
              <div className="flex items-center gap-3 relative z-10">
                {isRunning ? (
                  <>
                    <Loader className="animate-spin" size={24} />
                    <span>Analyzing Bias...</span>
                  </>
                ) : (
                  <>
                    <Play size={24} className="fill-white" />
                    <span>Run Fairness Audit</span>
                  </>
                )}
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            </button>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      {currentStep > 0 && currentStep < 4 && (
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-800">
          <button 
            onClick={handlePrev}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={18} /> Back
          </button>
          <button 
            onClick={handleNext}
            disabled={nextDisabled}
            className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-white transition-all ${
              nextDisabled 
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                : 'bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-900/20 hover:scale-105 active:scale-95'
            }`}
          >
            Continue <ArrowRight size={18} />
          </button>
        </div>
      )}

    </div>
  );
}
