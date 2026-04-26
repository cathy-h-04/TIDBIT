import React, { useEffect, useRef, useState } from 'react';
import { GraphView, GraphData } from './GraphView';

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode =
  typeof acquireVsCodeApi !== 'undefined'
    ? acquireVsCodeApi()
    : {
        postMessage: (msg: unknown) => console.log('[mock vscode]', msg),
        getState: () => null,
        setState: () => {},
      };

// ── types ──────────────────────────────────────────────────────────────────

interface Memory {
  id: string;
  memory: string;
  created_at: string;
  updated_at: string;
  score?: number;
  has_conflict?: boolean;
}

type ViewState =
  | { status: 'loading'; text?: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; memories: Memory[]; searchQuery?: string };

type GraphState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: GraphData }
  | { status: 'error'; message: string };

interface SearchResult {
  id: string;
  memory: string;
  score?: number;
}

type ExtMessage =
  | { type: 'loading'; text?: string }
  | { type: 'memories'; memories: Memory[]; searchQuery?: string }
  | { type: 'error'; message: string }
  | { type: 'searchStart'; query: string }
  | { type: 'graphLoading' }
  | { type: 'graph'; data: GraphData }
  | { type: 'graphSearchResults'; results: SearchResult[] };

type TopTab = 'list' | 'graph';

// ── App ───────────────────────────────────────────────────────────────────

export function App() {
  const [topTab, setTopTab] = useState<TopTab>('list');
  const [listState, setListState] = useState<ViewState>({ status: 'loading' });
  const [graphState, setGraphState] = useState<GraphState>({ status: 'idle' });
  const [graphSearchResults, setGraphSearchResults] = useState<SearchResult[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const graphLoadedRef = useRef(false);
  const topTabRef = useRef<TopTab>('list');

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const msg = event.data as ExtMessage;
      switch (msg.type) {
        case 'loading':
          setListState({ status: 'loading', text: msg.text });
          break;
        case 'memories':
          setListState({ status: 'ready', memories: msg.memories, searchQuery: msg.searchQuery });
          break;
        case 'error':
          setListState({ status: 'error', message: msg.message });
          setGraphState({ status: 'error', message: msg.message });
          break;
        case 'searchStart':
          setSearchInput(msg.query);
          setListState({ status: 'loading' });
          break;
        case 'graphLoading':
          setGraphState({ status: 'loading' });
          break;
        case 'graph':
          setGraphState({ status: 'ready', data: msg.data });
          graphLoadedRef.current = true;
          break;
        case 'graphSearchResults':
          setGraphSearchResults(msg.results.slice(0, 5));
          break;
      }
    }
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  function handleTabSwitch(tab: TopTab) {
    topTabRef.current = tab;
    setTopTab(tab);
    if (tab === 'graph' && !graphLoadedRef.current) {
      vscode.postMessage({ type: 'loadGraph' });
    }
  }

  function handleGraphSearch(query: string) {
    if (!query.trim()) {
      setGraphSearchResults([]);
      return;
    }
    setGraphSearchResults([]);
    vscode.postMessage({ type: 'graphSearch', query });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchInput.trim();
    if (q) {
      vscode.postMessage({ type: 'search', query: q });
    } else {
      vscode.postMessage({ type: 'refresh' });
    }
  }

  function handleClear() {
    setSearchInput('');
    vscode.postMessage({ type: 'refresh' });
  }

  function handleDelete(id: string) {
    vscode.postMessage({ type: 'delete', id });
    if (topTabRef.current === 'graph') {
      graphLoadedRef.current = false;
      setGraphState({ status: 'loading' });
      vscode.postMessage({ type: 'loadGraph' });
    }
  }

  return (
    <div style={s.root}>
      {/* Top tab bar: List | Graph */}
      <div style={s.topTabBar}>
        <button
          style={{ ...s.topTab, ...(topTab === 'list' ? s.topTabActive : {}) }}
          onClick={() => handleTabSwitch('list')}
        >
          List
        </button>
        <button
          style={{ ...s.topTab, ...(topTab === 'graph' ? s.topTabActive : {}) }}
          onClick={() => handleTabSwitch('graph')}
        >
          Graph
        </button>
      </div>

      {/* List view */}
      {topTab === 'list' && (
        <div style={s.listView}>
          <form onSubmit={handleSearch} style={s.searchRow}>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search memories…"
              style={s.input}
            />
            {searchInput && (
              <button type="button" onClick={handleClear} style={s.iconBtn} title="Clear search">
                ✕
              </button>
            )}
            <button type="submit" style={s.iconBtn} title="Search">
              ↵
            </button>
          </form>

          {listState.status === 'loading' && <p style={s.dim}>{listState.text ?? 'Loading…'}</p>}

          {listState.status === 'error' && (
            <div style={s.errorBox}>
              <strong>Error:</strong> {listState.message}
              <br />
              <small>Is the TIDBIT backend running? (uvicorn backend.main:app --reload)</small>
            </div>
          )}

          {listState.status === 'ready' && (
            <>
              <div style={s.meta}>
                {listState.searchQuery ? (
                  <>Results for <em>"{listState.searchQuery}"</em> — {listState.memories.length} found</>
                ) : (
                  <>{listState.memories.length} memories</>
                )}
              </div>

              {listState.memories.length === 0 ? (
                <p style={s.dim}>No memories yet.</p>
              ) : (
                <ul style={s.list}>
                  {listState.memories.map((m) => (
                    <MemoryCard key={m.id} memory={m} onDelete={handleDelete} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {/* Graph view */}
      {topTab === 'graph' && (
        <div style={s.graphView}>
          {graphState.status === 'idle' && <p style={s.dim}>Loading graph…</p>}
          {graphState.status === 'loading' && <p style={s.dim}>Building graph — this may take a moment…</p>}
          {graphState.status === 'error' && (
            <div style={s.errorBox}>
              <strong>Graph error:</strong> {graphState.message}
            </div>
          )}
          {graphState.status === 'ready' && (
            <GraphView
              graphData={graphState.data}
              onDelete={handleDelete}
              onSearch={handleGraphSearch}
              searchResults={graphSearchResults}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── MemoryCard ────────────────────────────────────────────────────────────

function MemoryCard({ memory, onDelete }: { memory: Memory; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW_LEN = 130;
  const isLong = memory.memory.length > PREVIEW_LEN;
  const text = expanded || !isLong ? memory.memory : memory.memory.slice(0, PREVIEW_LEN) + '…';

  const date = (() => {
    try {
      return new Date(memory.updated_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  })();

  return (
    <li style={{ ...s.card, borderLeftColor: memory.has_conflict ? 'var(--vscode-problemsWarningIcon-foreground)' : 'var(--vscode-activityBarBadge-background)' }}>
      <div style={s.cardBody}>
        {memory.has_conflict && (
          <span style={s.conflictPip} title="Conflict detected" />
        )}
        <span
          style={s.cardText}
          onClick={() => isLong && setExpanded(!expanded)}
          title={isLong ? 'Click to expand' : undefined}
        >
          {text}
        </span>
        <button
          style={s.deleteBtn}
          onClick={() => onDelete(memory.id)}
          title="Delete memory"
        >
          ✕
        </button>
      </div>
      <div style={s.cardFooter}>
        {memory.score != null && (
          <span style={s.dim}>score {memory.score.toFixed(3)}</span>
        )}
        <span style={{ ...s.dim, marginLeft: 'auto' }}>{date}</span>
      </div>
    </li>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    fontFamily: 'var(--vscode-font-family)',
    fontSize: 'var(--vscode-font-size)',
    color: 'var(--vscode-foreground)',
    overflow: 'hidden',
  },
  topTabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--vscode-panel-border, #333)',
    flexShrink: 0,
  },
  topTab: {
    flex: 1,
    padding: '6px 4px',
    fontSize: '12px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: 'var(--vscode-tab-inactiveForeground, #aaa)',
    cursor: 'pointer',
  },
  topTabActive: {
    borderBottom: '2px solid var(--vscode-focusBorder, #007fd4)',
    color: 'var(--vscode-tab-activeForeground, #fff)',
  },
  listView: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  graphView: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  searchRow: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    padding: '4px 8px',
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border, #555)',
    borderRadius: '2px',
    outline: 'none',
    fontSize: 'inherit',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--vscode-foreground)',
    cursor: 'pointer',
    padding: '2px 6px',
    opacity: 0.7,
    fontSize: '13px',
  },
  meta: {
    fontSize: '11px',
    opacity: 0.6,
    paddingLeft: '2px',
  },
  dim: {
    opacity: 0.6,
    fontSize: '11px',
    margin: 0,
  },
  errorBox: {
    padding: '8px',
    background: 'var(--vscode-inputValidation-errorBackground, #5a1d1d)',
    border: '1px solid var(--vscode-inputValidation-errorBorder, #be1100)',
    borderRadius: '2px',
    fontSize: '12px',
    lineHeight: 1.6,
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  card: {
    padding: '7px 8px',
    background: 'var(--vscode-editor-inactiveSelectionBackground)',
    borderRadius: '3px',
    borderLeft: '3px solid var(--vscode-activityBarBadge-background)',
  },
  cardBody: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '5px',
  },
  conflictPip: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: 'var(--vscode-problemsWarningIcon-foreground)',
    flexShrink: 0,
    marginTop: '5px',
  },
  cardText: {
    flex: 1,
    lineHeight: 1.55,
    wordBreak: 'break-word',
    cursor: 'default',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--vscode-errorForeground)',
    cursor: 'pointer',
    padding: '0 2px',
    fontSize: '12px',
    opacity: 0.5,
    flexShrink: 0,
    lineHeight: 1,
    marginTop: '2px',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    marginTop: '4px',
  },
};
