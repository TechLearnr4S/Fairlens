import { create } from 'zustand';

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
  
  setFile: (file: File | null) => void;
  setJobId: (id: string | null) => void;
  setColumns: (cols: string[]) => void;
  setColumnTypes: (types: Record<string, string>) => void;
  setPreview: (data: any[]) => void;
  setTargetColumn: (col: string | null) => void;
  toggleProtectedAttribute: (col: string) => void;
  setIsUploading: (status: boolean) => void;
  setDisparities: (data: any) => void;
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
  setIsUploading: (status) => set({ isUploading: status }),
  setDisparities: (data) => set({ disparities: data }),
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
  }),
}));
