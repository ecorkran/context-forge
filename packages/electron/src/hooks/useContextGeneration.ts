import { useState, useCallback } from 'react';
import { contextApi } from '../services/api';
import type { ContextOverrides } from '../main/ipc/contextHandlers';

/** Return type for useContextGeneration hook */
interface UseContextGenerationResult {
  contextString: string;
  isLoading: boolean;
  error: string | null;
  regenerate: (overrides?: ContextOverrides) => void;
}

/**
 * Hook for managing context generation via IPC.
 * The main process runs the full pipeline; the renderer makes a single IPC call.
 */
export const useContextGeneration = (projectId: string | null): UseContextGenerationResult => {
  const [contextString, setContextString] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = useCallback(async (overrides?: ContextOverrides) => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await contextApi.generate(projectId, overrides);
      setContextString(result);
    } catch (err) {
      console.error('Context generation failed:', err);
      setError(err instanceof Error ? err.message : 'Context generation failed');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  return { contextString, isLoading, error, regenerate };
};
