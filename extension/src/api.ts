import * as vscode from 'vscode';

function baseUrl(): string {
  return vscode.workspace
    .getConfiguration('tidbit')
    .get<string>('backendUrl', 'http://localhost:8000');
}

// Node.js fetch (WHATWG URL) normalizes %2F → / in path segments, breaking
// routes when the project_id is a filesystem path. Base64url has no slashes.
function pid(projectId: string): string {
  return Buffer.from(projectId).toString('base64url');
}

export interface Memory {
  id: string;
  memory: string;
  created_at: string;
  updated_at: string;
  score?: number;
  has_conflict?: boolean;
}

export interface Conflict {
  id: string;
  memory_id_1: string;
  memory_id_2: string;
  description?: string;
}

export async function getMemories(projectId: string): Promise<Memory[]> {
  const res = await fetch(
    `${baseUrl()}/projects/${pid(projectId)}/memories`
  );
  if (!res.ok) throw new Error(`GET memories failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.memories ?? data ?? [];
}

export async function searchMemories(projectId: string, query: string): Promise<Memory[]> {
  const res = await fetch(
    `${baseUrl()}/projects/${pid(projectId)}/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    }
  );
  if (!res.ok) throw new Error(`Search failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.results ?? data ?? [];
}

export async function deleteMemory(projectId: string, memoryId: string): Promise<void> {
  const res = await fetch(
    `${baseUrl()}/projects/${pid(projectId)}/memories/${encodeURIComponent(memoryId)}`,
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error(`DELETE memory failed: ${res.status} ${res.statusText}`);
}

export async function getConflicts(projectId: string): Promise<Conflict[]> {
  const res = await fetch(
    `${baseUrl()}/projects/${pid(projectId)}/conflicts`
  );
  if (!res.ok) throw new Error(`GET conflicts failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.conflicts ?? data ?? [];
}

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

export async function getGraph(projectId: string): Promise<GraphData> {
  const res = await fetch(
    `${baseUrl()}/projects/${pid(projectId)}/graph`
  );
  if (!res.ok) throw new Error(`GET graph failed: ${res.status} ${res.statusText}`);
  return res.json();
}
