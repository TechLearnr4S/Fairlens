import { create } from 'zustand';

interface AuditState {
  currentFile: File | null;
  jobId: string | null;
  columns: string[];
  targetColumn: string | null;
  protectedAttributes: string[];
  isUploading: boolean;
  disparities: any;
  proxies: any[];
  explanation: string | null;
  
  setFile: (file: File | null) => void;
  setJobId: (id: string | null) => void;
  setColumns: (cols: string[]) => void;
  setTargetColumn: (col: string) => void;
  toggleProtectedAttribute: (col: string) => void;
  setIsUploading: (status: boolean) => void;
  setDisparities: (data: any) => void;
  setProxies: (data: any[]) => void;
  setExplanation: (text: string | null) => void;
}

export const useAuditStore = create<AuditState>((set) => ({
  currentFile: null,
  jobId: null,
  columns: [],
  targetColumn: null,
  protectedAttributes: [],
  isUploading: false,
  disparities: null,
  proxies: [],
  explanation: null,
  
  setFile: (file) => set({ currentFile: file }),
  setJobId: (id) => set({ jobId: id }),
  setColumns: (cols) => set({ columns: cols }),
  setTargetColumn: (col) => set({ targetColumn: col }),
  toggleProtectedAttribute: (col) => set((state) => ({
    protectedAttributes: state.protectedAttributes.includes(col)
      ? state.protectedAttributes.filter(attr => attr !== col)
      : [...state.protectedAttributes, col]
  })),
  setIsUploading: (status) => set({ isUploading: status }),
  setDisparities: (data) => set({ disparities: data }),
  setProxies: (data) => set({ proxies: data }),
  setExplanation: (text) => set({ explanation: text }),
}));
