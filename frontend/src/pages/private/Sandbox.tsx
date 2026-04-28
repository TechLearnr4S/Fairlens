import { useEffect } from 'react';
import BiasSandbox from '../../components/audit/BiasSandbox';
import { useAuditStore } from '../../store/auditStore';
import { useAuditProgressStore } from '../../store/auditProgressStore';

export default function Sandbox() {
  const jobId = useAuditStore((state) => state.jobId);
  const currentStep = useAuditProgressStore((state) => state.currentStep);
  const advanceTo = useAuditProgressStore((state) => state.advanceTo);

  useEffect(() => {
    if (!jobId || currentStep >= 4) return;
    advanceTo(4, jobId);
  }, [jobId, currentStep, advanceTo]);

  return (
    <div className="max-w-7xl mx-auto py-8">
      <header className="mb-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#8B5CF6]">Step 4 · Simulate</p>
        <h1 className="mt-2 text-4xl font-black text-white tracking-tight">Mitigation Sandbox</h1>
        <p className="text-[#9CA3AF] mt-2 font-medium">
          Fine-tune model parameters and evaluate fairness-accuracy trade-offs.
        </p>
      </header>
      
      <BiasSandbox />
    </div>
  );
}
