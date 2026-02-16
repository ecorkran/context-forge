import React from 'react';
import { cn } from '../../lib/ui-core/utils/cn';

interface LeftPanelProps {
  children?: React.ReactNode;
  className?: string;
}

/**
 * Left panel container for form controls and input elements.
 * Provides proper padding, spacing, and minimum width constraints.
 */
export const LeftPanel: React.FC<LeftPanelProps> = ({ 
  children, 
  className 
}) => {
  return (
    <div className={cn(
      'h-full min-w-80 overflow-y-auto',
      'p-6 bg-neutral-1',
      'border-r border-neutral-3',
      className
    )}>
      {children || (
        <div className="text-neutral-11">
          <h2 className="text-lg font-semibold mb-4">Input Controls</h2>
          <p className="text-sm text-neutral-10">
            Form controls and input elements will be rendered here.
          </p>
        </div>
      )}
    </div>
  );
};