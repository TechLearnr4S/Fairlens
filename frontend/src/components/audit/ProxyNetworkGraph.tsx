import { useMemo, useRef, useEffect, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Share2, Maximize2, Move } from 'lucide-react';
import { unwrapProxyCorrelationHeatmap } from '../../utils/unwrapCorrelationMatrix';

interface ProxyNetworkGraphProps {
  matrix: unknown;
}

export default function ProxyNetworkGraph({ matrix }: ProxyNetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });

  useEffect(() => {
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.offsetWidth,
        height: 500
      });
    }
  }, []);

  const graphData = useMemo(() => {
    const hm = unwrapProxyCorrelationHeatmap(matrix);
    if (!hm) return { nodes: [], links: [] };

    const protectedAttrs = Object.keys(hm);
    if (protectedAttrs.length === 0) return { nodes: [], links: [] };
    
    const features = Object.keys(hm[protectedAttrs[0]]);
    const nodes: any[] = [];
    const links: any[] = [];
    
    // threshold for showing an edge
    const THRESHOLD = 0.3;

    // Add nodes for protected attributes
    protectedAttrs.forEach(attr => {
      nodes.push({
        id: attr,
        name: attr,
        group: 'protected',
        val: 15,
        color: '#f43f5e' // Rose 500
      });
    });

    // Add nodes for features and links
    features.forEach(feat => {
      let hasConnection = false;
      const featLinks: any[] = [];

      protectedAttrs.forEach(attr => {
        const info = hm[attr]?.[feat] as { correlation_score?: number } | undefined;
        const score = info?.correlation_score ?? 0;
        
        if (score >= THRESHOLD) {
          featLinks.push({
            source: feat,
            target: attr,
            value: score,
            label: `${(score * 100).toFixed(1)}% corr`
          });
          hasConnection = true;
        }
      });

      if (hasConnection) {
        nodes.push({
          id: feat,
          name: feat,
          group: 'feature',
          val: 8,
          color: '#cbd5e1' // Slate 300
        });
        links.push(...featLinks);
      }
    });

    return { nodes, links };
  }, [matrix]);

  if (graphData.nodes.length === 0) {
    return (
      <div className="glass-panel p-12 text-center text-slate-500 italic">
        No significant proxy relationships detected above 0.3 threshold.
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 border-slate-700/50 bg-slate-900/40 relative" ref={containerRef}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Share2 size={20} className="text-indigo-400" />
            Proxy Relationship Network
          </h3>
          <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-bold">
            Hidden Dependency Graph
          </p>
        </div>
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
             <div className="w-2 h-2 rounded-full bg-rose-500" /> Protected
           </div>
           <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
             <div className="w-2 h-2 rounded-full bg-slate-400" /> Feature
           </div>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden bg-dark-950/50 border border-slate-800 relative">
        <ForceGraph2D
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          nodeLabel="name"
          nodeColor={node => (node as any).color}
          nodeRelSize={6}
          linkWidth={link => (link as any).value * 6}
          linkColor={() => 'rgba(99, 102, 241, 0.2)'}
          linkDirectionalParticles={1}
          linkDirectionalParticleSpeed={d => (d as any).value * 0.01}
          linkDirectionalParticleWidth={2}
          backgroundColor="transparent"
          d3VelocityDecay={0.3}
          cooldownTicks={100}
          onNodeClick={node => {
            console.log('Clicked node', node);
          }}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const label = (node as any).name;
            const fontSize = (node as any).group === 'protected' ? 14/globalScale : 11/globalScale;
            ctx.font = `${fontSize}px Inter, sans-serif`;
            const textWidth = ctx.measureText(label).width;
            const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.4);

            ctx.fillStyle = (node as any).group === 'protected' ? 'rgba(244, 63, 94, 0.1)' : 'rgba(15, 23, 42, 0.4)';
            ctx.fillRect((node as any).x - bckgDimensions[0] / 2, (node as any).y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = (node as any).color;
            ctx.fillText(label, (node as any).x, (node as any).y);

            (node as any).__bckgDimensions = bckgDimensions;
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            ctx.fillStyle = color;
            const bckgDimensions = (node as any).__bckgDimensions;
            bckgDimensions && ctx.fillRect((node as any).x - bckgDimensions[0] / 2, (node as any).y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
          }}
        />
        
        <div className="absolute bottom-4 left-4 flex flex-col gap-2">
           <div className="flex items-center gap-2 text-[10px] text-slate-500 bg-dark-900/80 p-2 rounded-lg border border-slate-800">
             <Move size={12} /> Drag nodes to explore
           </div>
           <div className="flex items-center gap-2 text-[10px] text-slate-500 bg-dark-900/80 p-2 rounded-lg border border-slate-800">
             <Maximize2 size={12} /> Scroll to zoom
           </div>
        </div>
      </div>

      <div className="mt-4 p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/10 flex items-start gap-4">
        <div className="text-[10px] text-slate-400 leading-relaxed font-medium uppercase tracking-tighter">
          Graph nodes represent dataset features. <span className="text-rose-400">Red nodes</span> are your defined protected attributes. Thick connections indicate high-risk proxy vulnerabilities where a feature can be used to "reconstruct" sensitive data.
        </div>
      </div>
    </div>
  );
}
