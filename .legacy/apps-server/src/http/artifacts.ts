import { createReadStream, existsSync, statSync } from 'fs';
import { basename } from 'path';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import type { AppDatabase } from '../db/index.js';
import { getArtifactById, isPreviewableMime } from '../artifact/service.js';

function asAttachmentFilename(value: string | null): string {
  return (value && value.trim().length > 0 ? value : 'artifact.bin').replace(/"/g, '');
}

export function registerArtifactRoutes(app: FastifyInstance, database: AppDatabase) {
  app.get<{ Params: { artifactId: string } }>('/api/artifacts/:artifactId', async (req, reply) => {
    const artifact = getArtifactById(database, req.params.artifactId);
    if (!artifact) {
      return reply.code(404).send({ error: 'ARTIFACT_NOT_FOUND' });
    }
    return {
      id: artifact.id,
      kind: artifact.kind,
      title: artifact.title,
      url: artifact.url,
      previewUrl: artifact.previewUrl,
      downloadUrl: artifact.downloadUrl,
      fileName: artifact.fileName,
      fileSize: artifact.fileSize,
      mimeType: artifact.mimeType,
      createdAt: artifact.createdAt,
    };
  });

  app.get<{ Params: { artifactId: string } }>('/api/artifacts/:artifactId/download', async (req, reply) => {
    const artifact = getArtifactById(database, req.params.artifactId);
    if (!artifact) {
      return reply.code(404).send({ error: 'ARTIFACT_NOT_FOUND' });
    }

    if (artifact.localPath) {
      if (!existsSync(artifact.localPath)) {
        return reply.code(404).send({ error: 'ARTIFACT_FILE_MISSING' });
      }
      const fileName = asAttachmentFilename(artifact.fileName ?? basename(artifact.localPath));
      reply.header('Content-Type', artifact.mimeType ?? 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
      return reply.send(createReadStream(artifact.localPath));
    }

    if (artifact.content) {
      const fileName = asAttachmentFilename(artifact.fileName ?? `${artifact.id}.txt`);
      reply.header('Content-Type', artifact.mimeType ?? 'text/plain; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
      return reply.send(artifact.content);
    }

    if (artifact.url && (artifact.url.startsWith('http://') || artifact.url.startsWith('https://'))) {
      return reply.redirect(artifact.url);
    }

    return reply.code(404).send({ error: 'ARTIFACT_NOT_DOWNLOADABLE' });
  });

  app.get<{ Params: { artifactId: string } }>('/api/artifacts/:artifactId/preview', async (req, reply) => {
    const artifact = getArtifactById(database, req.params.artifactId);
    if (!artifact) {
      return reply.code(404).send({ error: 'ARTIFACT_NOT_FOUND' });
    }

    if (artifact.localPath) {
      if (!existsSync(artifact.localPath)) {
        return reply.code(404).send({ error: 'ARTIFACT_FILE_MISSING' });
      }
      if (!isPreviewableMime(artifact.mimeType)) {
        return reply.code(415).send({ error: 'ARTIFACT_PREVIEW_UNSUPPORTED' });
      }
      const stat = statSync(artifact.localPath);
      if (stat.size > env.ARTIFACT_PREVIEW_MAX_BYTES && (artifact.mimeType?.startsWith('text/') || artifact.mimeType?.includes('json'))) {
        return reply.code(413).send({ error: 'ARTIFACT_PREVIEW_TOO_LARGE', maxBytes: env.ARTIFACT_PREVIEW_MAX_BYTES });
      }
      reply.header('Content-Type', artifact.mimeType ?? 'application/octet-stream');
      reply.header('Content-Disposition', `inline; filename="${asAttachmentFilename(artifact.fileName ?? basename(artifact.localPath))}"`);
      return reply.send(createReadStream(artifact.localPath));
    }

    if (artifact.content) {
      reply.header('Content-Type', artifact.mimeType ?? 'text/plain; charset=utf-8');
      reply.header('Content-Disposition', 'inline');
      return reply.send(artifact.content);
    }

    if (artifact.url && (artifact.url.startsWith('http://') || artifact.url.startsWith('https://'))) {
      return reply.redirect(artifact.url);
    }

    return reply.code(404).send({ error: 'ARTIFACT_NOT_PREVIEWABLE' });
  });
}
