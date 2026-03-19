export type ArtifactDTO = {
  id: string;
  intentId: string;
  runId: string;
  kind: 'text' | 'markdown' | 'file' | 'link' | 'image' | 'json';
  title: string;
  content?: string;
  url?: string;
  previewUrl?: string;
  downloadUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  createdAt: number;
};
