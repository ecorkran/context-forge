import React, { useState, useEffect, useRef } from 'react';
import { cn } from '../../lib/ui-core/utils/cn';

interface ContextOutputProps {
  context: string;
  title?: string;
  className?: string;
}

/**
 * OUTPUT PREVIEW COMPONENT - Main display area for generated context
 *
 * This is the primary output preview that users see in the right panel.
 * Displays the complete generated context string including project info,
 * Current Slice, Tasks File, and all other sections assembled by the
 * context generation system.
 *
 * Also provides copy functionality for the generated content.
 */
export const ContextOutput: React.FC<ContextOutputProps> = ({
  context,
  title = "Generated Context",
  className
}) => {
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(context);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  // Add keyboard shortcut support
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if Ctrl+C (Windows/Linux) or Cmd+C (macOS) is pressed
      if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
        // Only handle if the context output area is focused or clicked
        const container = containerRef.current;
        if (container && (container.contains(document.activeElement) || container === document.activeElement)) {
          // Check if there's any text selected
          const selection = window.getSelection();
          const hasTextSelection = selection && selection.toString().length > 0;
          
          // Only handle if NO text is selected
          if (!hasTextSelection && context) {
            event.preventDefault();
            handleCopy();
          }
          // If text IS selected, let browser handle it naturally (don't preventDefault)
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [context, handleCopy]);

  // Check if we should use full height
  const useFullHeight = className?.includes('h-full');
  
  return (
    <div ref={containerRef} className={cn('flex flex-col', useFullHeight ? 'h-full' : 'space-y-4', className)}>
      <div className="flex items-center justify-between flex-shrink-0">
        <h3 className="text-lg font-semibold text-neutral-12">{title}</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopy}
            disabled={!context}
            className={cn(
              'px-3 py-1 text-sm rounded-md font-medium transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-accent-8 focus:ring-offset-2',
              copied 
                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                : 'bg-accent-9 hover:bg-accent-10 text-white disabled:bg-neutral-4 disabled:text-neutral-8'
            )}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div className={cn('relative flex-grow pt-3 pb-3', useFullHeight ? 'min-h-0' : '')}>
        <pre 
          tabIndex={0}
          className={cn(
            'w-full p-4 text-sm font-mono',
            'bg-neutral-2 border border-neutral-3 rounded-md',
            'text-neutral-11 leading-relaxed',
            'overflow-auto resize-none',
            'whitespace-pre-wrap',
            'focus:outline-none focus:ring-2 focus:ring-accent-8 focus:border-transparent',
            'cursor-text',
            useFullHeight ? 'h-full' : 'h-96'
          )}
        >
          {context || (
            <span className="text-neutral-9 italic">
              Configure your project details to generate context...
            </span>
          )}
        </pre>
      </div>

      {context && (
        <div className="flex items-center justify-between pb-2 text-sm text-neutral-10 flex-shrink-0">
          <span>{context.length} characters</span>
          <span>{context.split('\n').length} lines</span>
        </div>
      )}
    </div>
  );
};