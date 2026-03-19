import { Surface } from '@intentos/ui/react';
import { motion } from 'framer-motion';
import type { RunArtifact } from '../../../store/run';
import { resolveBackendUrl } from '../../../lib/runtimeConfig';

export function ArtifactCard({ artifact }: { artifact: RunArtifact }) {
  const downloadUrl = resolveBackendUrl(artifact.downloadUrl ?? artifact.url);
  const previewUrl = resolveBackendUrl(
    artifact.previewUrl
      ?? (artifact.url?.includes('/download') ? artifact.url.replace('/download', '/preview') : undefined),
  );

  return (
    <Surface as={motion.div} variant="panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-[1.6rem] p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">✓</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">{artifact.title}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{artifact.kind}</p>
        </div>
      </div>

      {artifact.content && <p className="text-sm leading-6 whitespace-pre-wrap text-slate-600">{artifact.content}</p>}
      {artifact.fileName && (
        <p className="mt-1 text-xs text-slate-500">
          {artifact.fileName}
          {typeof artifact.fileSize === 'number' ? ` · ${Math.ceil(artifact.fileSize / 1024)} KB` : ''}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-4">
        {previewUrl && (
          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex text-sm font-medium text-blue-700 hover:underline">
            Preview
          </a>
        )}
        {downloadUrl && (
          <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="inline-flex text-sm font-medium text-blue-700 hover:underline">
            Download
          </a>
        )}
      </div>
    </Surface>
  );
}
