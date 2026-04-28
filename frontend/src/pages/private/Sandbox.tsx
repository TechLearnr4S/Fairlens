import BiasSandbox from '../../components/audit/BiasSandbox';

export default function Sandbox() {
  return (
    <div className="max-w-7xl mx-auto py-8">
      <header className="mb-8">
        <h1 className="text-4xl font-black text-white tracking-tight">Mitigation Sandbox</h1>
        <p className="text-slate-400 mt-2 font-medium">
          Fine-tune model parameters and evaluate fairness-accuracy trade-offs.
        </p>
      </header>
      
      <BiasSandbox />
    </div>
  );
}
