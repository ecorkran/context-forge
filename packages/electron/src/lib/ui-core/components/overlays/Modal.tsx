import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Simple modal component for dialogs and overlays
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className
}) => {
  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className={cn(
          "relative z-10 w-full max-w-md mx-4 bg-neutral-1 border border-neutral-6 rounded-lg shadow-xl",
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between p-6 border-b border-neutral-6">
            <h2 id="modal-title" className="text-lg font-semibold text-neutral-12">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-1 text-neutral-10 hover:text-neutral-12 hover:bg-neutral-3 rounded-sm transition-colors"
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        )}

        {/* Close button when no title */}
        {!title && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 text-neutral-10 hover:text-neutral-12 hover:bg-neutral-3 rounded-sm transition-colors z-10"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        )}

        {/* Content */}
        <div className={cn("p-6", title ? "pt-4" : "pt-12")}>
          {children}
        </div>
      </div>
    </div>
  );
};