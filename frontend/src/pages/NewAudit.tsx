import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { 
  UploadCloud, CheckCircle, ArrowRight, ArrowLeft, Loader,
  Shield, Target, AlertCircle, Briefcase, CreditCard, HeartPulse, 
  Scale, LayoutGrid, Play, Info,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuditStore } from '../store/auditStore';
import { useAuditProgressStore } from '../store/auditProgressStore';
import { auth } from '../firebase';
import { useToast } from '../components/providers/ToastProvider';
import { apiFetch, isRequestTimeout } from '../utils/apiFetch';
import { unwrapAuditBody } from '../utils/auditEnvelope';
import { buildAuditSummary } from '../utils/auditSummary';
import { AuditEmptyState } from '../components/ui/AuditEmptyState';

async function getApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.clone().json();
    const detail = data?.detail ?? data?.message ?? data?.error;
    if (Array.isArray(detail)) return detail.map((d) => d?.msg || JSON.stringify(d)).join(', ');
    if (typeof detail === 'string') return detail;
    if (detail) return JSON.stringify(detail);
  } catch {
    try {
      const text = await response.clone().text();
      if (text) return text;
    } catch {
      // ignore parse fallback
    }
  }
  return fallback;
}

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

function guessTargetPriority(
  col: string,
  previewRows: Record<string, unknown>[],
  types: Record<string, string>,
): number {
  const lower = col.toLowerCase();
  let score = 0;

  if (
    lower.includes('target') ||
    lower.includes('label') ||
    lower.includes('decision') ||
    lower.includes('approved') ||
    lower.includes('income') ||
    lower.includes('hired')
  ) {
    score += 6;
  }

  if (types[col] === 'categorical') {
    score += 2;
  }

  const uniqueValues = new Set(
    previewRows
      .map((row) => row[col])
      .filter((value) => value !== undefined && value !== null && value !== '-'),
  );

  if (uniqueValues.size === 2) {
    score += 5;
  } else if (uniqueValues.size > 2 && uniqueValues.size <= 5) {
    score += 2;
  }

  return score;
}

/** Stronger ranking for outcome / target column (Step 3 only). Binary + name heuristics. */
const OUTCOME_NAME_TIERS: { test: (lower: string) => boolean; weight: number }[] = [
  { test: (l) => /\b(target|label|y_true|y_label)\b/.test(l) || l.endsWith('_target') || l.startsWith('is_'), weight: 120 },
  { test: (l) => l.includes('target') || l.includes('label') || l.includes('outcome'), weight: 100 },
  { test: (l) => l.includes('income') || l.includes('approved') || l.includes('hired') || l.includes('hire') || l.includes('loan'), weight: 88 },
  { test: (l) => l.includes('decision') || l.includes('prediction') || l.includes('class') || l.includes('score'), weight: 72 },
];

function countDistinctPreview(col: string, previewRows: Record<string, unknown>[]): number {
  return new Set(
    previewRows
      .map((row) => row[col])
      .filter((value) => value !== undefined && value !== null && value !== '' && value !== '-'),
  ).size;
}

function scoreOutcomeTargetColumn(
  col: string,
  previewRows: Record<string, unknown>[],
  types: Record<string, string>,
): number {
  const lower = col.toLowerCase().replace(/[^a-z0-9_]+/g, ' ');
  let score = 0;
  for (const tier of OUTCOME_NAME_TIERS) {
    if (tier.test(lower)) {
      score += tier.weight;
      break;
    }
  }
  const distinct = countDistinctPreview(col, previewRows);
  if (distinct === 2) {
    score += 95;
  } else if (distinct <= 5 && distinct > 2) {
    score += 18;
  }
  if (types[col] === 'numeric' && distinct === 2) {
    score += 12;
  }
  return score;
}

function formatEnglishList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

const USE_CASE_DECISION_LABEL: Record<string, string> = {
  Hiring: 'hiring decisions',
  'Credit Scoring': 'lending decisions',
  Healthcare: 'healthcare decisions',
  'Criminal Justice': 'criminal justice decisions',
  Other: 'your decisions',
};

function buildAuditReviewNarrative(
  useCaseId: string,
  protectedAttrs: string[],
): string | null {
  const decision = USE_CASE_DECISION_LABEL[useCaseId] ?? "your model's decisions";
  const labels = protectedAttrs.filter(Boolean).map((a) =>
    /^[a-z0-9_]+$/.test(a) ? a.replace(/_/g, ' ') : a,
  );
  const against = formatEnglishList(labels);
  if (!against) return `Auditing ${decision} for bias.`;
  return `Auditing ${decision} for bias against ${against}.`;
}

function pickDemoDefaults(columnsList: string[]): {
  useCase: string;
  targetColumn: string | null;
  protectedAttributes: string[];
} {
  const findColumn = (candidates: string[]) =>
    columnsList.find((column) => candidates.includes(column.toLowerCase())) ?? null;

  const targetColumn = findColumn(['income', 'hired', 'approved', 'target', 'label']);
  const protectedAttributes = columnsList.filter((column) =>
    ['sex', 'race', 'age', 'gender', 'ethnicity'].includes(column.toLowerCase()),
  );

  return {
    useCase: 'Hiring',
    targetColumn,
    protectedAttributes,
  };
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
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const { advanceTo, setAuditProgress } = useAuditProgressStore();
  const { 
    currentFile, setFile, 
    columns, setColumns, 
    columnTypes, setColumnTypes,
    preview, setPreview,
    isUploading, setIsUploading, 
    targetColumn, setTargetColumn, 
    protectedAttributes, toggleProtectedAttribute, setProtectedAttributes,
    jobId, setJobId,
    setDisparities, setVerdict, setProxies, setExplanation, setAuditSummary,
    setProxyRisks, setProxySummary, setCorrelationMatrix, setCopilotSummary
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
  const demoRunStarted = useRef(false);

  const recommendedColumnSet = useMemo(() => {
    const rec = listDatasetRecommendedColumns(columns);
    return new Set(rec);
  }, [columns]);

  const rankedTargetColumns = useMemo(
    () => [...columns].sort(
      (a, b) => guessTargetPriority(b, preview, columnTypes) - guessTargetPriority(a, preview, columnTypes),
    ),
    [columns, preview, columnTypes],
  );

  /** Step 3 — outcome column: binary + name heuristics (independent of Step 2 ordering). */
  const rankedOutcomeColumns = useMemo(() => {
    if (columns.length === 0) return [];
    return [...columns].sort(
      (a, b) =>
        scoreOutcomeTargetColumn(b, preview, columnTypes) -
        scoreOutcomeTargetColumn(a, preview, columnTypes),
    );
  }, [columns, preview, columnTypes]);

  const outcomeTopScore = useMemo(() => {
    if (!rankedOutcomeColumns.length) return 0;
    return scoreOutcomeTargetColumn(rankedOutcomeColumns[0], preview, columnTypes);
  }, [rankedOutcomeColumns, preview, columnTypes]);

  const reviewNarrative = useMemo(
    () => buildAuditReviewNarrative(useCase, protectedAttributes),
    [useCase, protectedAttributes],
  );
  const suggestedTargetColumn = rankedOutcomeColumns[0] ?? null;
  const suggestedProtected = useMemo(
    () => listDatasetRecommendedColumns(columns),
    [columns],
  );

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
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to upload CSV.'));
      }
      const data = unwrapAuditBody<{
        columns?: string[];
        column_types?: Record<string, string>;
        preview?: Record<string, unknown>[];
        job_id?: string;
        file_url?: string | null;
      }>(await res.json());
      if (data.columns) {
        setColumns(data.columns);
        setColumnTypes(data.column_types ?? {});
        setPreview(data.preview ?? []);
        if (data.job_id) {
          setJobId(data.job_id);
          setAuditProgress({ auditId: data.job_id, currentStep: 2, status: 'uploaded' });
        }
        setFileUrl(data.file_url ?? null);
        setCurrentStep(1); // Proceed to step 1
      }
      return data as {
        columns: string[];
        column_types: Record<string, string>;
        preview: Record<string, unknown>[];
        job_id: string;
        file_url: string | null;
      };
    } catch (error) {
      console.error(error);
      if (isRequestTimeout(error)) return;
      addToast(error instanceof Error ? error.message : "Failed to parse CSV via backend.", 'error');
      return null;
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

  const handleConfigSave = async (overrides?: {
    targetColumn?: string;
    protectedAttributes?: string[];
    useCase?: string;
  }) => {
    const activeTarget = overrides?.targetColumn ?? targetColumn;
    const activeProtectedAttributes = overrides?.protectedAttributes ?? protectedAttributes;
    const activeUseCase = overrides?.useCase ?? useCase;

    if (!activeTarget || activeProtectedAttributes.length === 0 || !jobId) return;

    setIsConfigSaving(true);
    try {
      const configRes = await apiFetch('http://localhost:8000/audits/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          user_id: auth.currentUser?.uid || "anonymous",
          target: activeTarget,
          target_column: activeTarget,
          protected_attributes: activeProtectedAttributes,
          filename: currentFile?.name,
          file_url: fileUrl,
          use_case: activeUseCase || 'Other'
        })
      });
      if (!configRes.ok) {
        throw new Error(await getApiErrorMessage(configRes, 'Failed to save audit configuration.'));
      }
      advanceTo(2, jobId);
    } catch (error) {
      console.error("Config save failed:", error);
      throw error;
    } finally {
      setIsConfigSaving(false);
    }
  };

  const runDemoPostProcessing = async (
    activeJobId: string,
    activeTarget: string,
    activeProtectedAttributes: string[],
  ) => {
    const [proxyRes, copilotRes] = await Promise.allSettled([
      apiFetch(`http://localhost:8000/audits/${activeJobId}/proxy-risks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protected_attributes: activeProtectedAttributes,
          target_column: activeTarget,
        }),
      }),
      apiFetch(`http://localhost:8000/audits/${activeJobId}/copilot`, {
        method: 'POST',
      }),
    ]);

    if (proxyRes.status === 'fulfilled' && proxyRes.value.ok) {
      const proxyData = unwrapAuditBody<{
        status?: string;
        proxy_risks?: { risk_level?: string; feature?: string }[];
        correlation_matrix?: unknown;
      }>(await proxyRes.value.json());
      const proxyRisks = Array.isArray(proxyData.proxy_risks) ? proxyData.proxy_risks : [];
      setProxyRisks(proxyRisks);
      setCorrelationMatrix(proxyData.correlation_matrix ?? null);
      setProxySummary({
        high_risk_count: proxyRisks.filter((risk) => risk.risk_level === 'High').length,
        top_proxy: proxyRisks[0]?.feature || 'None',
      });
    }

    if (copilotRes.status === 'fulfilled' && copilotRes.value.ok) {
      const copilotData = await copilotRes.value.json();
      setCopilotSummary(copilotData);
    }
  };

  const startAudit = async (options?: {
    demoMode?: boolean;
    targetColumn?: string;
    protectedAttributes?: string[];
    useCase?: string;
  }) => {
    setIsRunning(true);
    try {
      const activeTarget = options?.targetColumn ?? targetColumn;
      const activeProtectedAttributes = options?.protectedAttributes ?? protectedAttributes;
      const activeUseCase = options?.useCase ?? useCase;

      if (!jobId || !activeTarget || activeProtectedAttributes.length === 0) {
        throw new Error('Select a target column and at least one protected attribute before running the audit.');
      }
      await handleConfigSave({
        targetColumn: activeTarget,
        protectedAttributes: activeProtectedAttributes,
        useCase: activeUseCase,
      });
      setAuditSummary(null);

      const res = await apiFetch(`http://localhost:8000/audits/${jobId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_column: activeTarget,
          protected_attributes: activeProtectedAttributes,
          use_case: activeUseCase || 'Other',
          ground_truth_column: groundTruthColumn
        })
      });
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Audit run failed.'));
      }
      const data = unwrapAuditBody<{
        disparities?: Record<string, unknown>;
        proxies?: unknown[];
        verdict?: Record<string, unknown> | null;
        explanation?: unknown;
      }>(await res.json());
      if (data.disparities) {
         setDisparities(data.disparities);
         setProxies(data.proxies || []);
         setVerdict(data.verdict ?? null);
         setAuditSummary(buildAuditSummary(data.disparities));
         setExplanation(data.explanation || null);
         advanceTo(3, jobId);
         if (options?.demoMode) {
           await runDemoPostProcessing(jobId, activeTarget, activeProtectedAttributes);
         }
         navigate('/');
      }
    } catch (error) {
       console.error("Audit run failed:", error);
       if (isRequestTimeout(error)) return;
       addToast(error instanceof Error ? error.message : 'Audit run failed.', 'error');
    } finally {
       setIsRunning(false);
    }
  };

  const runLiveDemo = useCallback(
    async (options?: { guided?: boolean }) => {
      const guided = options?.guided === true;
      if (demoRunStarted.current) return;
      demoRunStarted.current = true;

      try {
        const res = await apiFetch('/demo_data/adult_income_sample.csv');
        if (!res.ok) throw new Error('Demo dataset is unavailable.');

        const blob = await res.blob();
        const demoFile = new File([blob], 'adult_income_sample.csv', { type: 'text/csv' });
        const upload = await uploadToBackend(demoFile);
        if (!upload) return;

        const defaults = pickDemoDefaults(upload.columns);
        if (!defaults.targetColumn || defaults.protectedAttributes.length === 0) {
          throw new Error('Demo dataset columns did not match the expected audit defaults.');
        }

        setUseCase(defaults.useCase);
        setProtectedAttributes(defaults.protectedAttributes);
        setTargetColumn(defaults.targetColumn);
        setGroundTruthColumn(null);

        if (guided) {
          setCurrentStep(1);
          addToast(
            'Demo dataset loaded. Step through the wizard, then run the audit when ready.',
            'info',
          );
          return;
        }

        setCurrentStep(4);

        addToast('Loaded live demo dataset. Running a complete audit now.', 'info');
        window.setTimeout(() => {
          void startAudit({
            demoMode: true,
            targetColumn: defaults.targetColumn ?? undefined,
            protectedAttributes: defaults.protectedAttributes,
            useCase: defaults.useCase,
          });
        }, 0);
      } catch (error) {
        demoRunStarted.current = false;
        if (isRequestTimeout(error)) return;
        addToast(error instanceof Error ? error.message : 'Unable to start the live demo.', 'error');
      }
    },
    [addToast, setProtectedAttributes, setTargetColumn],
  );

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

  useEffect(() => {
    if (searchParams.get('demo') !== 'adult-income') return;
    const guided = searchParams.get('guided') === '1';
    void runLiveDemo({ guided });
  }, [runLiveDemo, searchParams]);

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

      {currentStep > 0 && columns.length > 0 && (
        <section className="rounded-3xl border border-white/[0.08] bg-[#111827] p-6 animate-in fade-in duration-300">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8B5CF6]">Dataset loaded</p>
              <h2 className="mt-2 text-2xl font-black text-white">{currentFile?.name ?? 'Uploaded CSV'}</h2>
              <p className="mt-1 text-sm text-[#9CA3AF]">
                {columns.length} columns detected · showing first {Math.min(preview.length, 5)} preview rows
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black uppercase tracking-widest text-white hover:bg-indigo-500 disabled:opacity-50"
              disabled={!useCase}
            >
              Continue to Analysis
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0B1220] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Suggested target</p>
              <p className="mt-2 text-lg font-black text-white">{suggestedTargetColumn ?? 'No suggestion'}</p>
              <p className="mt-1 text-xs text-[#9CA3AF]">Ranked by binary/low-entropy values and target-like names.</p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-[#0B1220] p-4 lg:col-span-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Protected attribute suggestions</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(suggestedProtected.length ? suggestedProtected : ['gender', 'race', 'age']).map((col) => (
                  <span key={col} className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-200">
                    {col}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {preview.length > 0 && (
            <div className="mt-5 overflow-x-auto rounded-2xl border border-white/[0.08]">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-[#0B1220] text-slate-500">
                  <tr>
                    {columns.slice(0, 8).map((col) => (
                      <th key={col} className="px-4 py-3 font-black uppercase tracking-widest">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.08]">
                  {preview.slice(0, 5).map((row, idx) => (
                    <tr key={idx} className="text-slate-300">
                      {columns.slice(0, 8).map((col) => (
                        <td key={col} className="max-w-[12rem] truncate px-4 py-3">{String(row[col] ?? '-')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
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
            {rankedTargetColumns.map(col => {
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
            <p className="text-slate-500 text-sm mt-3 max-w-lg mx-auto">
              Columns are ranked with likely outcomes first: binary (two-class) fields and names such as{' '}
              <span className="font-mono text-xs text-slate-400">target</span>,{' '}
              <span className="font-mono text-xs text-slate-400">label</span>,{' '}
              <span className="font-mono text-xs text-slate-400">income</span>,{' '}
              <span className="font-mono text-xs text-slate-400">approved</span>.
            </p>
          </div>

          {columns.length === 0 ? (
            <AuditEmptyState
              variant="missing-data"
              title="No columns to choose from"
              description="We couldn’t read any columns from your dataset. Upload a non-empty CSV with a header row from step 1, or restart the wizard."
              cta={{ label: 'Back to upload', onClick: () => setCurrentStep(0) }}
              className="border border-amber-500/20 bg-slate-900/50"
            />
          ) : (
            <>
              {!targetColumn && (
                <div
                  role="status"
                  className="flex gap-4 p-5 mb-6 rounded-2xl border border-indigo-500/35 bg-indigo-500/10 text-left"
                >
                  <div className="shrink-0 w-11 h-11 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                    <Info className="text-indigo-300" size={22} aria-hidden />
                  </div>
                  <div className="space-y-2 min-w-0">
                    <p className="text-sm font-bold text-indigo-100">Select a prediction (outcome) column</p>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      Tap the row that matches what your system predicts or decides—such as approval, income band, hire
                      flag, or risk label. This anchors every fairness metric on the right outcome. The list below is
                      ranked to surface likely decision columns first.
                    </p>
                    <p className="text-xs text-slate-500">
                      You can change this later by starting a new audit; continue only when one row is selected above.
                    </p>
                  </div>
                </div>
              )}

              {columns.length > 0 && preview.length < 2 && (
                <div className="flex items-start gap-3 p-4 mb-6 rounded-xl border border-amber-500/25 bg-amber-500/10 text-left">
                  <AlertCircle className="text-amber-400 shrink-0 mt-0.5" size={18} aria-hidden />
                  <div>
                    <p className="text-sm font-semibold text-amber-200/90">
                      {preview.length === 0 ? 'No preview rows in sample' : 'Limited preview data'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {preview.length === 0
                        ? 'We could not load sample values for hints. The columns below are still selectable; confirm types in your source file if needed.'
                        : `Only ${preview.length} preview row loaded. Column hints (e.g. binary vs categorical) use this sample—verify the full file if results look unexpected.`}
                    </p>
                  </div>
                </div>
              )}
          
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {rankedOutcomeColumns.map((col) => {
                  const isSelected = targetColumn === col;
                  const isRecommended =
                    rankedOutcomeColumns.length > 0 &&
                    col === rankedOutcomeColumns[0] &&
                    outcomeTopScore >= 30;
                  return (
                    <button 
                      key={col}
                      type="button"
                      onClick={() => setTargetColumn(col)}
                      className={`w-full flex items-center justify-between px-6 py-4 rounded-xl border transition-all text-left ${
                        isSelected 
                          ? 'bg-indigo-500/10 border-indigo-500 ring-1 ring-indigo-500' 
                          : 'bg-dark-800 border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <div className={`w-5 h-5 shrink-0 rounded-full border flex items-center justify-center ${isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-600'}`}>
                          {isSelected && <CheckCircle size={12} />}
                        </div>
                        <span className={`font-bold ${isSelected ? 'text-indigo-400' : 'text-slate-300'}`}>{col}</span>
                        {getTargetHint(col)}
                        {isRecommended && (
                          <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded border bg-amber-500/15 text-amber-300 border-amber-500/40">
                            Recommended
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
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
            {reviewNarrative && (
              <blockquote className="mt-6 max-w-xl mx-auto text-left border-l-4 border-indigo-500/60 pl-5 py-1">
                <p className="text-lg text-indigo-100 font-semibold leading-relaxed">
                  {reviewNarrative}
                </p>
              </blockquote>
            )}
          </div>
          
          <div className="bg-dark-800 border border-slate-700 rounded-2xl p-6 mb-8 max-w-xl mx-auto">
            <h3 className="text-lg font-bold text-white mb-4">Audit Summary</h3>
            <ul className="space-y-4">
              <li className="flex gap-3">
                <Target className="text-slate-500 mt-0.5 shrink-0" size={18} />
                <div>
                  <p className="text-sm text-slate-400">Target Decision</p>
                  <p className="font-bold text-white">
                    {targetColumn ?? <span className="text-slate-500 font-medium">Not selected</span>}
                  </p>
                  {!targetColumn && (
                    <p className="text-xs text-amber-400/90 mt-2">
                      Go back one step and pick the outcome column before running the audit.
                    </p>
                  )}
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
              onClick={() => void startAudit()}
              disabled={isRunning || isConfigSaving || !targetColumn}
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
