export type NodeKind = 'text' | 'card' | 'image' | 'video';
export type Side = 'left' | 'right';
export interface RichNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RichNode[];
}
export interface MindNode {
  id: string;
  kind: NodeKind;
  parentId: string | null;
  extraParentIds?: string[];
  childIds: string[];
  title: string;
  body: RichNode;
  contentCollapsed: boolean;
  childrenCollapsed: boolean;
  side: Side;
  position: { x: number; y: number };
  preferredWidth?: number;
  assetId?: string;
  altText?: string;
  color: string;
}
export interface MindDocument {
  id: string;
  schemaVersion: number;
  title: string;
  rootId: string;
  revision: number;
  layoutMode: 'auto' | 'free';
  viewport: { x: number; y: number; zoom: number };
  nodes: Record<string, MindNode>;
  updatedAt: number;
}
export interface Asset {
  id: string;
  mime: string;
  byteSize: number;
  sha256: string;
  width: number;
  height: number;
  relativePath: string;
  thumbnailPath?: string;
  duration?: number;
  name: string;
}
export interface LibraryInfo {
  workspace?: LibraryWorkspace;
  defaultNodeKind?: NodeKind | null;
  startupError?: string;
  initialized: boolean;
  storagePath: string | null;
  configPath: string;
  documents: { id: string; title: string; updatedAt: number; nodeCount: number }[];
  assets: Asset[];
  recentId: string | null;
}
export const blankBody = (): RichNode => ({ type: 'doc', content: [{ type: 'paragraph' }] });
export interface LibraryWorkspace {
  folders: {id:string;name:string}[];
  documentFolders: Record<string,string>;
  openIds: string[];
}
export const uid = () => crypto.randomUUID();
