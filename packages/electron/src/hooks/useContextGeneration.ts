import { useState, useEffect, useMemo } from 'react';
import { ProjectData } from '../services/storage/types/ProjectData';
import { ContextIntegrator } from '../services/context/ContextIntegrator';

/**
 * Hook for managing context generation from project data
 * Handles loading states, error handling, and automatic regeneration
 */
export const useContextGeneration = (projectData: ProjectData | null) => {
  const [contextString, setContextString] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Create ContextIntegrator instance (memoized to avoid recreation)
  const contextIntegrator = useMemo(() => new ContextIntegrator(), []);

  useEffect(() => {
    const generateContext = async () => {
      // Clear previous error
      setError(null);

      // Handle empty project data
      if (!projectData || !contextIntegrator.validateProject(projectData)) {
        setContextString('');
        setIsLoading(false);
        return;
      }

      try {
        // Generate context with performance monitoring
        const startTime = Date.now();
        const generatedContext = await contextIntegrator.generateContextFromProject(projectData);
        const duration = Date.now() - startTime;

        // Log performance for optimization (development only)
        if (process.env.NODE_ENV === 'development' && duration > 100) {
          console.warn(`Context generation took ${duration}ms (target: <100ms)`);
        }

        setContextString(generatedContext);
        
        // Only show loading for slow operations (>150ms) to avoid flash
        if (duration > 150) {
          setIsLoading(true);
          setTimeout(() => setIsLoading(false), 100);
        } else {
          setIsLoading(false);
        }
        
      } catch (err) {
        console.error('Context generation failed:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        setError(`Failed to generate context: ${errorMessage}`);
        
        // Keep previous valid context on error, just show error state
        setIsLoading(false);
      }
    };

    generateContext();
  }, [projectData, contextIntegrator]);

  return {
    contextString,
    isLoading,
    error,
    // Utility method to manually trigger regeneration
    regenerate: () => {
      if (projectData) {
        setError(null);
        setIsLoading(true);
        // Trigger the effect by creating a small state change
        setContextString(prev => prev); // This will trigger useEffect
      }
    }
  };
};