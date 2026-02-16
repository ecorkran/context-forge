import React from 'react';
import { cn } from '../../lib/ui-core/utils/cn';

interface RightPanelProps {
  children?: React.ReactNode;
  className?: string;
}

/**
 * Right panel container for output display area.
 * Provides flexible width and vertical scroll capability for long content.
 */
export const RightPanel: React.FC<RightPanelProps> = ({ 
  children, 
  className 
}) => {
  return (
    <div className={cn(
      'h-full flex-1 overflow-y-auto',
      'p-6 bg-neutral-2',
      className
    )}>
      {children || (
        <div className="text-neutral-11">
          <h2 className="text-lg font-semibold mb-4">Output Display</h2>
          <p className="text-sm text-neutral-10">
            Generated context output will be displayed here.
          </p>
        </div>
      )}
    </div>
  );
};