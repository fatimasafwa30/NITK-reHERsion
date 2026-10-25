import { useState, useMemo } from 'react';
import {
  Layers,
  User,
  Hash,
  FileText,
  AlertTriangle,
  Info,
  Maximize2,
  Filter,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { LINK_CONFIDENCE } from '../services/incidentCorrelationService';

/**
 * Interactive Account & Identifier Relationship Graph.
 *
 * Renders an SVG network visualization connecting Platforms, Accounts, Shared Identifiers,
 * Evidence Files, and Timeline Incidents. Emphasizes that links are investigative clues,
 * not definitive identity proof.
 */
export function RelationshipGraph({ correlationData, className }) {
  const { graph, epistemicNotice } = correlationData || {};
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [filterType, setFilterType] = useState('ALL');

  // Compute fixed 2D layout coordinates for nodes
  const layoutNodes = useMemo(() => {
    if (!graph?.nodes?.length) return [];
    const width = 740;
    const height = 450;
    const centerX = width / 2;
    const centerY = height / 2;

    const platforms = graph.nodes.filter((n) => n.type === 'PLATFORM');
    const accounts = graph.nodes.filter((n) => n.type === 'ACCOUNT');
    const identifiers = graph.nodes.filter((n) => n.type === 'IDENTIFIER');
    const evidence = graph.nodes.filter((n) => n.type === 'EVIDENCE');
    const incidents = graph.nodes.filter((n) => n.type === 'INCIDENT');

    const positioned = [];

    // 1. Identifiers in the center circle
    identifiers.forEach((node, i) => {
      const angle = (i / Math.max(identifiers.length, 1)) * 2 * Math.PI;
      const radius = 55;
      positioned.push({
        ...node,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    });

    // 2. Accounts in the middle ring
    accounts.forEach((node, i) => {
      const angle = (i / Math.max(accounts.length, 1)) * 2 * Math.PI + Math.PI / 6;
      const radius = 125;
      positioned.push({
        ...node,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    });

    // 3. Platforms on the outer ring
    platforms.forEach((node, i) => {
      const angle = (i / Math.max(platforms.length, 1)) * 2 * Math.PI + Math.PI / 4;
      const radius = 195;
      positioned.push({
        ...node,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    });

    // 4. Evidence files along perimeter
    evidence.forEach((node, i) => {
      const angle = (i / Math.max(evidence.length, 1)) * 2 * Math.PI + Math.PI / 8;
      const radius = 265;
      positioned.push({
        ...node,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    });

    // 5. Timeline incidents along outer perimeter
    incidents.forEach((node, i) => {
      const angle = (i / Math.max(incidents.length, 1)) * 2 * Math.PI + Math.PI / 3;
      const radius = 320;
      positioned.push({
        ...node,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    });

    return positioned;
  }, [graph]);

  const nodeMap = useMemo(
    () => new Map(layoutNodes.map((n) => [n.id, n])),
    [layoutNodes],
  );

  // Filter visible nodes & links
  const visibleNodes = useMemo(() => {
    if (filterType === 'ALL') return layoutNodes;
    return layoutNodes.filter((n) => n.type === filterType);
  }, [layoutNodes, filterType]);

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes],
  );

  const visibleLinks = useMemo(() => {
    if (!graph?.links?.length) return [];
    return graph.links.filter(
      (link) => visibleNodeIds.has(link.source) && visibleNodeIds.has(link.target),
    );
  }, [graph, visibleNodeIds]);

  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) : null;

  // Connected links for highlighted node
  const connectedNodeIds = useMemo(() => {
    if (!selectedNodeId || !graph?.links) return new Set();
    const set = new Set([selectedNodeId]);
    for (const link of graph.links) {
      if (link.source === selectedNodeId) set.add(link.target);
      if (link.target === selectedNodeId) set.add(link.source);
    }
    return set;
  }, [selectedNodeId, graph]);

  const FILTER_LABELS = {
    ALL: 'All Entities',
    PLATFORM: 'Platforms',
    ACCOUNT: 'Accounts',
    IDENTIFIER: 'Shared Clues',
    EVIDENCE: 'Evidence Files',
    INCIDENT: 'Incidents',
  };

  return (
    <div className={cn('rounded-lg border border-lilac bg-paper p-6 shadow-sheet text-plum', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-lilac pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="size-5 text-violet-deep" aria-hidden="true" />
            <h3 className="font-serif text-lg font-semibold text-plum">
              Account & Identifier Relationship Graph
            </h3>
          </div>
          <p className="mono mt-1 text-[0.6875rem] text-muted">
            Interactive correlation between platforms, accounts, shared clues, evidence, and incidents
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
          {['ALL', 'PLATFORM', 'ACCOUNT', 'IDENTIFIER', 'EVIDENCE', 'INCIDENT'].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilterType(type)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                filterType === type
                  ? 'bg-violet-deep text-white'
                  : 'border border-lilac bg-ivory text-muted hover:border-violet hover:text-plum',
              )}
            >
              {FILTER_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Network Canvas */}
      <div className="relative mt-4 overflow-hidden rounded-md border border-lilac/60 bg-ivory/50">
        <svg
          viewBox="0 0 740 450"
          className="w-full h-auto select-none"
          style={{ minHeight: '360px' }}
        >
          {/* Subtle grid background */}
          <defs>
            <pattern id="graph-grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="var(--color-lilac)" strokeWidth="0.5" strokeOpacity="0.4" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#graph-grid)" />

          {/* Empty state overlay inside SVG */}
          {visibleNodes.length === 0 && (
            <text
              x="370"
              y="225"
              textAnchor="middle"
              className="mono text-xs fill-muted"
            >
              No relationship nodes match this filter. Select &ldquo;All Entities&rdquo; to view correlation graph.
            </text>
          )}

          {/* Links / Edges */}
          <g>
            {visibleLinks.map((link, idx) => {
              const src = nodeMap.get(link.source);
              const tgt = nodeMap.get(link.target);
              if (!src || !tgt) return null;

              const isHighlighted =
                selectedNodeId &&
                (link.source === selectedNodeId || link.target === selectedNodeId);

              const isDimmed = selectedNodeId && !isHighlighted;

              const isBypass = link.type === 'CONTACT_AFTER_BLOCK';
              const isClue = link.type === 'SHARED_IDENTIFIER' || link.type === 'CONTAINS_IDENTIFIER';

              return (
                <line
                  key={`link-${idx}`}
                  x1={src.x}
                  y1={src.y}
                  x2={tgt.x}
                  y2={tgt.y}
                  stroke={
                    isBypass
                      ? '#DC2626'
                      : isClue
                      ? '#D97706'
                      : isHighlighted
                      ? 'var(--color-violet-press)'
                      : 'var(--color-lilac)'
                  }
                  strokeWidth={isHighlighted ? 2.5 : isBypass ? 2 : 1.2}
                  strokeDasharray={isBypass ? '4 3' : isClue ? '2 2' : undefined}
                  strokeOpacity={isDimmed ? 0.15 : isHighlighted ? 1 : 0.7}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {visibleNodes.map((node) => {
              const isSelected = selectedNodeId === node.id;
              const isConnected = selectedNodeId && connectedNodeIds.has(node.id);
              const isDimmed = selectedNodeId && !isSelected && !isConnected;

              let fillColor = '#FFFFFF';
              let strokeColor = 'var(--color-violet-deep)';
              if (node.type === 'PLATFORM') {
                fillColor = 'var(--color-wash)';
                strokeColor = 'var(--color-violet-deep)';
              } else if (node.type === 'IDENTIFIER') {
                fillColor = '#FFFDF5';
                strokeColor = '#B45309';
              } else if (node.type === 'EVIDENCE') {
                fillColor = '#F5F3FF';
                strokeColor = '#7C3AED';
              } else if (node.type === 'INCIDENT') {
                fillColor = '#FDF4FF';
                strokeColor = '#A21CAF';
              } else if (node.blockedPrior) {
                fillColor = '#FEF2F2';
                strokeColor = '#DC2626';
              }

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className="cursor-pointer transition-transform duration-150 hover:scale-105"
                  onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                  opacity={isDimmed ? 0.25 : 1}
                >
                  <circle
                    r={node.size / 2}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={isSelected ? 3 : 1.5}
                    className="shadow-sm"
                  />
                  {node.blockedPrior && (
                    <circle
                      r={node.size / 2 + 3}
                      fill="none"
                      stroke="#EF4444"
                      strokeWidth="1.2"
                      strokeDasharray="2 2"
                    />
                  )}
                  <text
                    textAnchor="middle"
                    dy=".3em"
                    fontSize={node.type === 'PLATFORM' ? '10px' : '8.5px'}
                    fontWeight={isSelected ? '600' : '500'}
                    fill="var(--color-plum)"
                    className="pointer-events-none select-none font-sans"
                  >
                    {node.name.length > 15 ? `${node.name.slice(0, 13)}…` : node.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Selected Node Details Floating Overlay */}
        {selectedNode && (
          <div className="absolute bottom-3 left-3 right-3 rounded-md border border-violet/30 bg-paper/95 p-3.5 shadow-md backdrop-blur-sm sm:max-w-md">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="mono text-[0.625rem] uppercase tracking-wider text-muted">
                  {selectedNode.type}
                  {selectedNode.blockedPrior && ' · Block Bypass Observed'}
                </span>
                <p className="font-semibold text-plum">{selectedNode.fullLabel || selectedNode.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNodeId(null)}
                className="text-xs text-muted hover:text-plum"
              >
                Clear
              </button>
            </div>
            {selectedNode.platform && (
              <p className="mt-1 text-xs text-muted">Platform: {selectedNode.platform}</p>
            )}
            {selectedNode.sha256 && (
              <p className="mono mt-1 text-[0.625rem] text-muted truncate">
                SHA-256: {selectedNode.sha256}
              </p>
            )}
            <p className="mono mt-1 text-[0.6875rem] text-violet-deep">
              Connected touchpoints: {connectedNodeIds.size - 1}
            </p>
          </div>
        )}
      </div>

      {/* Legend & Epistemic Disclaimer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border border-violet-deep bg-wash" /> Platform
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border border-violet-deep bg-white" /> Account / Sender
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border border-amber-600 bg-amber-50" /> Shared Clue
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border border-purple-600 bg-purple-50" /> Evidence File
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border border-fuchsia-700 bg-fuchsia-50" /> Incident
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border border-red-500 bg-red-50" /> Contact After Block
          </span>
        </div>
        <p className="mono text-[0.625rem]">Click any node to isolate connections</p>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-md border border-lilac/70 bg-ivory/60 p-3 text-[0.6875rem] text-muted">
        <Info className="size-4 shrink-0 text-violet-deep mt-0.5" aria-hidden="true" />
        <p className="leading-relaxed">
          {epistemicNotice ||
            'Shared handles, phone numbers, or phrases are presented as investigative clues, not definitive legal proof of single-person authorship. Cross-referencing establishes correlation, while final attribution requires lawful service-provider verification.'}
        </p>
      </div>
    </div>
  );
}

export default RelationshipGraph;
