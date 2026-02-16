import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { SettingsDialog } from './SettingsDialog';
import { HealthIndicator } from './HealthIndicator';
import { ProjectData } from '../../services/storage/types/ProjectData';

interface SettingsButtonProps {
  className?: string;
  currentProject: ProjectData | null;
  onProjectUpdate: (updates: Partial<ProjectData>) => void;
}

/**
 * Settings button with gear icon that opens the settings dialog
 */
export const SettingsButton: React.FC<SettingsButtonProps> = ({
  className,
  currentProject,
  onProjectUpdate
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleOpenDialog = () => {
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
  };

  return (
    <div className={`flex items-center gap-1.5 ${className || ''}`}>
      <HealthIndicator
        projectPath={currentProject?.projectPath}
        onClick={handleOpenDialog}
      />
      <button
        onClick={handleOpenDialog}
        className="p-2 text-neutral-10 hover:text-neutral-12 hover:bg-neutral-3 rounded-md transition-colors"
        title="Open settings"
        aria-label="Open settings"
      >
        <Settings size={20} />
      </button>

      <SettingsDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        currentProject={currentProject}
        onProjectUpdate={onProjectUpdate}
      />
    </div>
  );
};