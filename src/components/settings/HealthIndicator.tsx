import React, { useState, useEffect } from 'react';

type HealthStatus = 'none' | 'valid' | 'invalid' | 'checking';

interface HealthIndicatorProps {
  projectPath?: string;
  onClick: () => void;
}

const STATUS_STYLES: Record<Exclude<HealthStatus, 'none'>, string> = {
  valid: 'bg-green-500',
  invalid: 'bg-amber-500',
  checking: 'bg-neutral-8 animate-pulse',
};

const STATUS_TITLES: Record<Exclude<HealthStatus, 'none'>, string> = {
  valid: 'Project path valid',
  invalid: 'Project path issue — click to fix',
  checking: 'Checking project path...',
};

/**
 * Small dot indicator showing project path health at a glance.
 * Renders nothing when no path is set.
 */
export const HealthIndicator: React.FC<HealthIndicatorProps> = ({
  projectPath,
  onClick,
}) => {
  const [status, setStatus] = useState<HealthStatus>('none');

  useEffect(() => {
    if (!projectPath) {
      setStatus('none');
      return;
    }

    let cancelled = false;
    setStatus('checking');

    window.electronAPI.projectPath
      .healthCheck(projectPath)
      .then((result) => {
        if (!cancelled) {
          setStatus(result.valid ? 'valid' : 'invalid');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('invalid');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  if (status === 'none') {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-2.5 h-2.5 rounded-full cursor-pointer ${STATUS_STYLES[status]}`}
      title={STATUS_TITLES[status]}
      aria-label={STATUS_TITLES[status]}
    />
  );
};
