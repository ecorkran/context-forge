import React from 'react';
import { ContextBuilderApp } from '../ContextBuilderApp';

interface AppShellProps {
  children?: React.ReactNode;
}

/**
 * Main application container component that provides the full-height layout
 * and integrates the context builder functionality.
 */
export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  return (
    <div className="h-screen w-full overflow-hidden bg-neutral-1">
      {children || <ContextBuilderApp />}
    </div>
  );
};