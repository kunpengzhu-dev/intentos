export type ArtifactDTO = {
  id: string;
  intentId: string;
  runId: string;
  kind: 'text' | 'markdown' | 'file' | 'link' | 'image' | 'json';
  title: string;
  content?: string;
  url?: string;
  mimeType?: string;
  createdAt: number;
};
