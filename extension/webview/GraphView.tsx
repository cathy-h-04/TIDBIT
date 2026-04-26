import React, { useCallback, useEffect, useRef, useState } from 'react';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import Sigma from 'sigma';

// ── types ──────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  memory: string;
  created_at: string;
  is_conflicted: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  entity?: string;
  score?: number;
  weight?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  entity_edges: GraphEdge[];
  semantic_edges: GraphEdge[];
}

export interface SearchResult {
  id: string;
  memory: string;
  score?: number;
}

interface GraphViewProps {
  graphData: GraphData;
  onDelete: (id: string) => void;
  onSearch: (query: string) => void;
  searchResults: SearchResult[];
}

type GraphTab = 'force-entity' | 'force-semantic' | 'timeline-entity' | 'timeline-semantic';

const TABS: GraphTab[] = ['force-entity', 'force-semantic', 'timeline-entity', 'timeline-semantic'];
const TAB_LABELS: Record<GraphTab, string> = {
  'force-entity':      'Force · Entity',
  'force-semantic':    'Force · Semantic',
  'timeline-entity':   'Timeline · Entity',
  'timeline-semantic': 'Timeline · Semantic',
};
const TAB_DESC: Record<GraphTab, string> = {
  'force-entity':      'Nodes pulled together by shared entities (e.g. same file or concept)',
  'force-semantic':    'Nodes pulled together by embedding similarity',
  'timeline-entity':   'Left = oldest · Right = newest · edges = shared entities',
  'timeline-semantic': 'Left = oldest · Right = newest · edges = semantic similarity',
};

// ── graph construction ─────────────────────────────────────────────────────

function nodeColor(node: GraphNode, highlights: SearchResult[]): string {
  if (highlights.length > 0) {
    const rank = highlights.findIndex(r => r.id === node.id);
    if (rank === 0) return '#ffd700';        // gold — top result
    if (rank > 0)  return '#7a6a2a';        // dim gold — ranks 1–4
  }
  return node.is_conflicted ? '#e07b54' : '#4a9eff';
}

function nodeSize(node: GraphNode, highlights: SearchResult[]): number {
  if (highlights.length > 0) {
    const rank = highlights.findIndex(r => r.id === node.id);
    if (rank === 0) return 11;
    if (rank > 0)  return 6;
  }
  return 6;
}

function buildGraph(data: GraphData, tab: GraphTab, highlights: SearchResult[]): Graph {
  const g = new Graph({ type: 'undirected', multi: false });

  data.nodes.forEach(node => {
    const label = node.memory.length > 35 ? node.memory.slice(0, 35) + '…' : node.memory;
    g.addNode(node.id, {
      label,
      size: nodeSize(node, highlights),
      color: nodeColor(node, highlights),
      created_at: node.created_at ?? '',
      memory: node.memory,
      is_conflicted: node.is_conflicted,
      x: Math.random() * 10,
      y: Math.random() * 10,
    });
  });

  const edges = tab.includes('entity') ? data.entity_edges : data.semantic_edges;
  const seen = new Set<string>();
  edges.forEach(edge => {
    const key = [edge.source, edge.target].sort().join('||');
    if (!seen.has(key) && g.hasNode(edge.source) && g.hasNode(edge.target)) {
      seen.add(key);
      try { g.addEdge(edge.source, edge.target, { size: 1, color: '#555' }); } catch { /* skip */ }
    }
  });

  return g;
}

function applyForceLayout(g: Graph): void {
  if (g.order === 0) return;
  forceAtlas2.assign(g, { iterations: 100, settings: forceAtlas2.inferSettings(g) });
}

function applyTimelineLayout(g: Graph): void {
  if (g.order === 0) return;

  const nodes: { id: string; t: number }[] = [];
  g.forEachNode(id => {
    const raw = g.getNodeAttribute(id, 'created_at');
    nodes.push({ id, t: raw ? new Date(raw).getTime() : 0 });
  });
  nodes.sort((a, b) => a.t - b.t);

  const minT = nodes[0]?.t ?? 0;
  const maxT = nodes[nodes.length - 1]?.t ?? minT;
  const range = maxT - minT || 1;

  nodes.forEach(({ id, t }, i) => {
    // x = proportional time position; y = small sine jitter to prevent overlap
    g.setNodeAttribute(id, 'x', ((t - minT) / range) * 12);
    g.setNodeAttribute(id, 'y', Math.sin(i * 2.1) * 1.5);
  });
}

// ── component ──────────────────────────────────────────────────────────────

export function GraphView({ graphData, onDelete, onSearch, searchResults }: GraphViewProps) {
  const [activeTab, setActiveTab] = useState<GraphTab>('force-entity');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchInput, setSearchInput] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);

  const handleNodeClick = useCallback((nodeId: string) => {
    const node = graphData.nodes.find(n => n.id === nodeId) ?? null;
    setSelectedNode(node);
  }, [graphData.nodes]);

  // Rebuild graph + sigma when tab or data changes
  useEffect(() => {
    if (!containerRef.current) return;

    sigmaRef.current?.kill();
    sigmaRef.current = null;
    graphRef.current = null;

    if (graphData.nodes.length === 0) return;

    const g = buildGraph(graphData, activeTab, searchResults);
    if (activeTab.startsWith('force')) {
      applyForceLayout(g);
    } else {
      applyTimelineLayout(g);
    }
    graphRef.current = g;

    const sigma = new Sigma(g, containerRef.current, {
      renderLabels: false,
      labelRenderedSizeThreshold: Infinity,
      defaultEdgeColor: '#555',
      defaultEdgeType: 'line',
      // Replace the label-box hover with a simple glow ring
      hoverRenderer: (context: CanvasRenderingContext2D, data: any) => {
        context.beginPath();
        context.arc(data.x, data.y, (data.size ?? 6) + 4, 0, Math.PI * 2);
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
        context.shadowBlur = 10;
        context.shadowColor = data.color ?? '#4a9eff';
        context.fillStyle = data.color ?? '#4a9eff';
        context.globalAlpha = 0.35;
        context.fill();
        context.globalAlpha = 1;
        context.shadowBlur = 0;
      },
    });

    sigma.on('clickNode', ({ node }) => handleNodeClick(node));
    sigma.on('clickStage', () => setSelectedNode(null));

    sigmaRef.current = sigma;

    return () => {
      sigma.kill();
      sigmaRef.current = null;
      graphRef.current = null;
    };
  }, [graphData, activeTab]); // searchResults handled separately below

  // Update node colors/sizes when search results change without rebuilding
  useEffect(() => {
    const g = graphRef.current;
    const sigma = sigmaRef.current;
    if (!g || !sigma) return;

    g.forEachNode(nodeId => {
      const node = graphData.nodes.find(n => n.id === nodeId);
      if (!node) return;
      g.setNodeAttribute(nodeId, 'color', nodeColor(node, searchResults));
      g.setNodeAttribute(nodeId, 'size', nodeSize(node, searchResults));
    });
    sigma.refresh();
  }, [searchResults, graphData.nodes, activeTab]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchInput.trim();
    if (q) onSearch(q);
  }

  function handleClearSearch() {
    setSearchInput('');
    // Reset highlights by calling onSearch with empty triggers a clear in parent
    // Instead just clear via a dedicated empty call — parent resets searchResults on new search
    onSearch('');
  }

  const edgeCount = (activeTab.includes('entity') ? graphData.entity_edges : graphData.semantic_edges).length;

  return (
    <div style={s.root}>
      {/* Tab bar */}
      <div style={s.tabBar}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSelectedNode(null); }}
            style={{
              ...s.tab,
              borderBottom: activeTab === tab
                ? '2px solid var(--vscode-focusBorder, #007fd4)'
                : '2px solid transparent',
              color: activeTab === tab
                ? 'var(--vscode-tab-activeForeground, #fff)'
                : 'var(--vscode-tab-inactiveForeground, #aaa)',
            }}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Description + stats */}
      <div style={s.desc}>{TAB_DESC[activeTab]}</div>
      <div style={s.stats}>{graphData.nodes.length} nodes · {edgeCount} edges</div>

      {/* Search bar */}
      <form onSubmit={handleSearch} style={s.searchRow}>
        <input
          type="text"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Highlight relevant nodes…"
          style={s.searchInput}
        />
        {searchInput && (
          <button type="button" onClick={handleClearSearch} style={s.iconBtn} title="Clear">✕</button>
        )}
        <button type="submit" style={s.iconBtn} title="Search">↵</button>
      </form>

      {searchResults.length > 0 && (
        <div style={s.searchHint}>
          top result highlighted gold · {searchResults.length - 1 > 0 ? `${searchResults.length - 1} more dimly highlighted` : ''}
        </div>
      )}

      {/* Sigma canvas */}
      <div ref={containerRef} style={s.canvas} />

      {/* Selected node detail */}
      {selectedNode ? (
        <div style={s.detail}>
          <div style={s.detailHeader}>
            <div style={s.detailMeta}>
              {selectedNode.created_at
                ? new Date(selectedNode.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                : ''}
              {selectedNode.is_conflicted && <span style={s.conflictBadge}> · conflict</span>}
            </div>
            <button
              style={s.deleteBtn}
              onClick={() => { onDelete(selectedNode.id); setSelectedNode(null); }}
              title="Delete memory"
            >
              Delete
            </button>
          </div>
          <div style={s.detailText}>{selectedNode.memory}</div>
        </div>
      ) : (
        <div style={s.hint}>Click a node to read the memory</div>
      )}
    </div>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    fontFamily: 'var(--vscode-font-family)',
    fontSize: 'var(--vscode-font-size)',
    color: 'var(--vscode-foreground)',
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--vscode-panel-border, #333)',
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    padding: '5px 2px',
    fontSize: '10px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  desc: {
    fontSize: '10px',
    opacity: 0.55,
    padding: '4px 6px 0',
    fontStyle: 'italic',
    flexShrink: 0,
  },
  stats: {
    fontSize: '10px',
    opacity: 0.45,
    padding: '1px 6px 3px',
    flexShrink: 0,
  },
  searchRow: {
    display: 'flex',
    gap: '3px',
    alignItems: 'center',
    padding: '0 6px 4px',
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    padding: '3px 6px',
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border, #555)',
    borderRadius: '2px',
    outline: 'none',
    fontSize: '11px',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--vscode-foreground)',
    cursor: 'pointer',
    padding: '2px 4px',
    opacity: 0.7,
    fontSize: '12px',
  },
  searchHint: {
    fontSize: '10px',
    opacity: 0.55,
    padding: '0 6px 3px',
    flexShrink: 0,
  },
  canvas: {
    flex: 1,
    minHeight: '250px',
    background: 'var(--vscode-editor-background, #1e1e1e)',
    position: 'relative',
  },
  hint: {
    fontSize: '10px',
    opacity: 0.4,
    padding: '5px 6px',
    flexShrink: 0,
    fontStyle: 'italic',
  },
  detail: {
    padding: '7px 8px',
    background: 'var(--vscode-editor-inactiveSelectionBackground)',
    borderTop: '1px solid var(--vscode-panel-border, #333)',
    flexShrink: 0,
    maxHeight: '130px',
    overflow: 'auto',
  },
  detailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  detailMeta: {
    fontSize: '10px',
    opacity: 0.6,
  },
  detailText: {
    fontSize: '12px',
    lineHeight: 1.55,
    wordBreak: 'break-word',
  },
  conflictBadge: {
    color: 'var(--vscode-problemsWarningIcon-foreground)',
  },
  deleteBtn: {
    background: 'none',
    border: '1px solid var(--vscode-inputValidation-errorBorder, #be1100)',
    color: 'var(--vscode-errorForeground, #f48771)',
    cursor: 'pointer',
    padding: '1px 6px',
    fontSize: '10px',
    borderRadius: '2px',
  },
};
