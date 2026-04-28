import { create } from 'zustand';

export type AuditProgressStatus =
  | 'idle'
  | 'uploaded'
  | 'analyzed'
  | 'detected'
  | 'simulated'
  | 'decided';

export type AuditProgressStep = 1 | 2 | 3 | 4 | 5;

const STATUS_BY_STEP: Record<AuditProgressStep, AuditProgressStatus> = {
  1: 'uploaded',
  2: 'analyzed',
  3: 'detected',
  4: 'simulated',
  5: 'decided',
};

interface AuditProgressState {
  currentStep: AuditProgressStep;
  auditId: string | null;
  status: AuditProgressStatus;
  setAuditProgress: (progress: Partial<Pick<AuditProgressState, 'currentStep' | 'auditId' | 'status'>>) => void;
  advanceTo: (step: AuditProgressStep, auditId?: string | null) => void;
  resetProgress: () => void;
}

export const useAuditProgressStore = create<AuditProgressState>((set) => ({
  currentStep: 1,
  auditId: null,
  status: 'idle',
  setAuditProgress: (progress) => set((state) => ({
    ...progress,
    status: progress.status ?? (progress.currentStep ? STATUS_BY_STEP[progress.currentStep] : state.status),
  })),
  advanceTo: (step, auditId) =>
    set((state) => {
      const nextStep = Math.max(state.currentStep, step) as AuditProgressStep;
      return {
        currentStep: nextStep,
        auditId: auditId ?? state.auditId,
        status: STATUS_BY_STEP[nextStep],
      };
    }),
  resetProgress: () => set({ currentStep: 1, auditId: null, status: 'idle' }),
}));
