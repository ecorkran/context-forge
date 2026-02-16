import React, { ReactNode, useEffect, useState } from 'react';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels';
import { cn } from '../../lib/ui-core/utils/cn';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';

interface SplitPaneLayoutProps {
  leftContent?: ReactNode;
  rightContent?: ReactNode;
  defaultLayout?: [number, number];
  minSize?: number;
  maxSize?: number;
  className?: string;
}

/**
 * Split-pane layout component with resizable panels.
 * Default split is 40/60 (left/right) on desktop.
 * Automatically saves and restores layout to localStorage.
 * Uses scrollable container on mobile devices (< 768px).
 */
export const SplitPaneLayout: React.FC<SplitPaneLayoutProps> = ({
  leftContent,
  rightContent,
  defaultLayout = [40, 60],
  minSize = 25,
  maxSize = 75,
  className,
}) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Mobile layout: Simple scrollable container
  if (isMobile) {
    return (
      <div className={cn('h-full w-full overflow-y-auto', className)}>
        <div className="flex flex-col">
          <div className="w-full border-b border-neutral-3">
            <LeftPanel>
              {leftContent}
            </LeftPanel>
          </div>
          <div className="w-full">
            <RightPanel>
              {rightContent}
            </RightPanel>
          </div>
        </div>
      </div>
    );
  }

  // Desktop layout: Resizable panels
  return (
    <PanelGroup
      direction="horizontal"
      autoSaveId="context-forge-layout"
      className={cn('h-full w-full', className)}
    >
      <Panel
        defaultSize={defaultLayout[0]}
        minSize={minSize}
        maxSize={maxSize}
        className="h-full"
      >
        <LeftPanel>
          {leftContent}
        </LeftPanel>
      </Panel>
      
      <PanelResizeHandle className="w-1 bg-neutral-3 hover:bg-neutral-4 transition-colors cursor-col-resize" />
      
      <Panel
        defaultSize={defaultLayout[1]}
        minSize={100 - maxSize}
        className="h-full"
      >
        <RightPanel>
          {rightContent}
        </RightPanel>
      </Panel>
    </PanelGroup>
  );
};