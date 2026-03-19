import { existsSync, mkdirSync, copyFileSync, statSync } from 'fs';
import { basename, extname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import type { ArtifactDTO } from '@intentos/protocol';
import { env } from '../config/env.js';
import type { AppDatabase } from '../db/index.js';
import type { AgentResult } from '../agent/types.js';

type AgentArtifact = NonNullable<AgentResult['artifacts']>[number];

export type StoredArtifactRecord = {
  id: string;
  scopeId: string;
  intentId: string;
  runId: string;
  kind: string;
  title: string;
  content: string | null;
  url: string | null;
  previewUrl: string | null;
  downloadUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  localPath: string | null;
  createdAt: number;
};

const MIME_BY_EXT: Record<string, string> = {
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function normalizeKind(kind: string | undefined): ArtifactDTO['kind'] {
  switch (kind) {
    case 'text':
    case 'markdown':
    case 'file':
    case 'link':
    case 'image':
    case 'json':
      return kind;
    default:
      return 'file';
  }
}

function inferMimeType(kind: ArtifactDTO['kind'], fileName?: string, provided?: string): string {
  if (provided) return provided;
  if (fileName) {
    const byExt = MIME_BY_EXT[extname(fileName).toLowerCase()];
    if (byExt) return byExt;
  }
  if (kind === 'json') return 'application/json; charset=utf-8';
  if (kind === 'markdown') return 'text/markdown; charset=utf-8';
  if (kind === 'text') return 'text/plain; charset=utf-8';
  if (kind === 'image') return 'image/*';
  return 'application/octet-stream';
}

function isLikelyLocalPath(value: string): boolean {
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/api/')) {
    return false;
  }
  if (value.startsWith('file://')) return true;
  if (value.startsWith('/')) return true;
  return /^[A-Za-z]:\\/.test(value);
}

function resolveLocalPath(artifact: AgentArtifact): string | null {
  const raw = artifact.localPath ?? artifact.url;
  if (!raw) return null;
  if (!isLikelyLocalPath(raw)) return null;

  let pathValue = raw;
  if (raw.startsWith('file://')) {
    try {
      pathValue = fileURLToPath(raw);
    } catch {
      return null;
    }
  }

  const absolute = isAbsolute(pathValue) ? pathValue : resolve(process.cwd(), pathValue);
  if (!existsSync(absolute)) return null;
  if (!statSync(absolute).isFile()) return null;
  return absolute;
}

function toDto(row: StoredArtifactRecord): ArtifactDTO {
  return {
    id: row.id,
    intentId: row.intentId,
    runId: row.runId,
    kind: normalizeKind(row.kind),
    title: row.title,
    content: row.content ?? undefined,
    url: row.url ?? undefined,
    previewUrl: row.previewUrl ?? undefined,
    downloadUrl: row.downloadUrl ?? undefined,
    fileName: row.fileName ?? undefined,
    fileSize: row.fileSize ?? undefined,
    mimeType: row.mimeType ?? undefined,
    createdAt: row.createdAt,
  };
}

export function saveRunArtifacts(
  database: AppDatabase,
  scopeId: string,
  intentId: string,
  runId: string,
  inputArtifacts: AgentArtifact[],
): ArtifactDTO[] {
  mkdirSync(env.ARTIFACT_STORAGE_DIR, { recursive: true });

  const records: StoredArtifactRecord[] = [];

  for (const input of inputArtifacts) {
    const id = nanoid();
    const kind = normalizeKind(input.kind);
    const createdAt = Date.now();
    const localSourcePath = resolveLocalPath(input);

    let content: string | null = input.content ?? null;
    let url: string | null = input.url ?? null;
    let localPath: string | null = null;
    let fileName: string | null = input.fileName ?? null;
    let fileSize: number | null = input.fileSize ?? null;
    let previewUrl: string | null = null;
    let downloadUrl: string | null = null;

    if (localSourcePath) {
      const sourceFileName = fileName ?? basename(localSourcePath);
      const safeFileName = sanitizeFileName(sourceFileName || 'artifact.bin');
      const targetPath = join(env.ARTIFACT_STORAGE_DIR, `${id}-${safeFileName}`);

      copyFileSync(localSourcePath, targetPath);
      const stat = statSync(targetPath);

      localPath = targetPath;
      fileName = sourceFileName;
      fileSize = stat.size;
      downloadUrl = `/api/artifacts/${id}/download`;
      previewUrl = `/api/artifacts/${id}/preview`;
      url = downloadUrl;
      content = null;
    }

    const mimeType = inferMimeType(kind, fileName ?? undefined, input.mimeType);

    const row: StoredArtifactRecord = {
      id,
      scopeId,
      intentId,
      runId,
      kind,
      title: input.title || 'Artifact',
      content,
      url,
      previewUrl,
      downloadUrl,
      fileName,
      fileSize,
      mimeType,
      localPath,
      createdAt,
    };

    database.sqlite
      .prepare(`
        INSERT INTO artifacts (
          id, scope_id, intent_id, run_id, kind, title, content, url, preview_url, download_url,
          file_name, file_size, mime_type, local_path, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        row.id,
        row.scopeId,
        row.intentId,
        row.runId,
        row.kind,
        row.title,
        row.content,
        row.url,
        row.previewUrl,
        row.downloadUrl,
        row.fileName,
        row.fileSize,
        row.mimeType,
        row.localPath,
        row.createdAt,
      );

    records.push(row);
  }

  return records.map(toDto);
}

export function getArtifactById(database: AppDatabase, artifactId: string): StoredArtifactRecord | null {
  const row = database.sqlite
    .prepare('SELECT * FROM artifacts WHERE id = ? LIMIT 1')
    .get(artifactId) as StoredArtifactRecord | undefined;
  return row ?? null;
}

export function isPreviewableMime(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return (
    mimeType.startsWith('text/') ||
    mimeType.startsWith('image/') ||
    mimeType === 'application/json' ||
    mimeType.startsWith('application/json') ||
    mimeType === 'application/pdf'
  );
}
