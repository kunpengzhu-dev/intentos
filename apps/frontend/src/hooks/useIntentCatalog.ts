import type { IntentSummary } from '@intentos/shared';
import { useEffect, useState } from 'react';
import { fetchIntentCatalog } from '../lib/api';

export function useIntentCatalog(enabled: boolean) {
  const [intents, setIntents] = useState<IntentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    let timer: number | undefined;

    const load = async () => {
      try {
        const response = await fetchIntentCatalog();
        if (cancelled) {
          return;
        }

        setIntents(response.intents);
        setError(null);
        setIsLoading(false);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Failed to load intents');
        setIsLoading(false);
      }
    };

    void load();
    timer = window.setInterval(() => {
      void load();
    }, 5000);

    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearInterval(timer);
      }
    };
  }, [enabled]);

  return {
    intents,
    isLoading,
    error,
    setIntents,
  };
}
