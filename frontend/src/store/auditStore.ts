import { create } from 'zustand';
import type { DemoSummaryPayload } from '../utils/demoSummary';

interface AuditState {
  currentFile: File | null;
  jobId: string | null;
  columns: string[];
  columnTypes: Record<string, string>;
  preview: any[];
  targetColumn: string | null;
  protectedAttributes: string[];
  isUploading: boolean;
  disparities: any;
  /** Deterministic fairness verdict from POST /audits/{id}/run */
  verdict: Record<string, unknown> | null;
  /** Guided demo only — from buildDemoSummary(disparities) */
  demoSummary: DemoSummaryPayload | null;
  proxies: any[];
  explanation: any | null;
  aiInsight: any | null;
  simulation: any | null;
  isExplaining: boolean;
  isSimulating: boolean;
  proxyRisks: any[];
  proxySummary: any | null;
  proxyAiInsight: any | null;
  isProxyAnalyzing: boolean;
  isExplainingProxy: boolean;
  
  copilotSummary: any | null;
  isCopilotRunning: boolean;
  correlationMatrix: any | null;
  
  setFile: (file: File | null) => void;
  setJobId: (id: string | null) => void;
  setColumns: (cols: string[]) => void;
  setColumnTypes: (types: Record<string, string>) => void;
  setPreview: (data: any[]) => void;
  setTargetColumn: (col: string | null) => void;
  toggleProtectedAttribute: (col: string) => void;
  /** Replace list, or merge by passing a function */
  setProtectedAttributes: (cols: string[] | ((prev: string[]) => string[])) => void;
  setIsUploading: (status: boolean) => void;
  setDisparities: (data: any) => void;
  setVerdict: (data: Record<string, unknown> | null) => void;
  setDemoSummary: (data: DemoSummaryPayload | null) => void;
  setProxies: (data: any[]) => void;
  setExplanation: (data: any | null) => void;
  setAiInsight: (data: any | null) => void;
  setSimulation: (data: any | null) => void;
  setIsExplaining: (status: boolean) => void;
  setIsSimulating: (status: boolean) => void;
  setProxyRisks: (data: any[]) => void;
  setProxySummary: (data: any | null) => void;
  setIsProxyAnalyzing: (status: boolean) => void;
  setProxyAiInsight: (data: any | null) => void;
  setIsExplainingProxy: (status: boolean) => void;
  setCopilotSummary: (data: any | null) => void;
  setIsCopilotRunning: (status: boolean) => void;
  setCorrelationMatrix: (data: any | null) => void;
  removeColumn: (col: string) => void;
  reset: () => void;
}

export const useAuditStore = create<AuditState>((set) => ({
  currentFile: null,
  jobId: null,
  columns: [],
  columnTypes: {},
  preview: [],
  targetColumn: null,
  protectedAttributes: [],
  isUploading: false,
  disparities: null,
  verdict: null,
  demoSummary: null,
  proxies: [],
  explanation: null,
  aiInsight: null,
  simulation: null,
  isExplaining: false,
  isSimulating: false,
  proxyRisks: [],
  proxySummary: null,
  proxyAiInsight: null,
  isProxyAnalyzing: false,
  isExplainingProxy: false,
  copilotSummary: null,
  isCopilotRunning: false,
  correlationMatrix: null,
  
  setFile: (file) => set({ currentFile: file }),
  setJobId: (id) => set({ jobId: id }),
  setColumns: (cols) => set({ columns: cols }),
  setColumnTypes: (types) => set({ columnTypes: types }),
  setPreview: (data) => set({ preview: data }),
  setTargetColumn: (col) => set({ targetColumn: col }),
  toggleProtectedAttribute: (col) => set((state) => ({
    protectedAttributes: state.protectedAttributes.includes(col)
      ? state.protectedAttributes.filter(attr => attr !== col)
      : [...state.protectedAttributes, col]
  })),
  setProtectedAttributes: (cols) =>
    set((state) => ({
      protectedAttributes:
        typeof cols === 'function' ? cols(state.protectedAttributes) : cols,
    })),
  setIsUploading: (status) => set({ isUploading: status }),
  setDisparities: (data) => set({ disparities: data }),
  setVerdict: (data) => set({ verdict: data }),
  setDemoSummary: (data) => set({ demoSummary: data }),
  setProxies: (data) => set({ proxies: data }),
  setExplanation: (data) => set({ explanation: data }),
  setAiInsight: (data) => set({ aiInsight: data }),
  setSimulation: (data) => set({ simulation: data }),
  setIsExplaining: (status) => set({ isExplaining: status }),
  setIsSimulating: (status) => set({ isSimulating: status }),
  setProxyRisks: (data) => set({ proxyRisks: data }),
  setProxySummary: (data) => set({ proxySummary: data }),
  setIsProxyAnalyzing: (status) => set({ isProxyAnalyzing: status }),
  setProxyAiInsight: (data) => set({ proxyAiInsight: data }),
  setIsExplainingProxy: (status) => set({ isExplainingProxy: status }),
  setCopilotSummary: (data) => set({ copilotSummary: data }),
  setIsCopilotRunning: (status) => set({ isCopilotRunning: status }),
  setCorrelationMatrix: (data) => set({ correlationMatrix: data }),
  removeColumn: (col) => set((state) => ({
    columns: state.columns.filter(c => c !== col),
    protectedAttributes: state.protectedAttributes.filter(attr => attr !== col)
  })),
  reset: () => set({
    currentFile: null,
    jobId: null,
    columns: [],
    columnTypes: {},
    preview: [],
    targetColumn: null,
    protectedAttributes: [],
    isUploading: false,
    disparities: null,
    verdict: null,
    demoSummary: null,
    proxies: [],
    proxyRisks: [],
    proxySummary: null,
    proxyAiInsight: null,
    isProxyAnalyzing: false,
    isExplainingProxy: false,
    explanation: null,
    aiInsight: null,
    simulation: null,
    isExplaining: false,
    isSimulating: false,
    copilotSummary: null,
    isCopilotRunning: false,
    correlationMatrix: null,
  }),
}));
