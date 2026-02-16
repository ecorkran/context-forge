import React from 'react';
import { Modal } from '../../lib/ui-core/components/overlays/Modal';
import { Checkbox } from '../../lib/ui-core/components/form/checkbox';
import { ProjectData } from '../../services/storage/types/ProjectData';
import { ProjectPathSection } from './ProjectPathSection';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: ProjectData | null;
  onProjectUpdate: (updates: Partial<ProjectData>) => void;
}

/**
 * Settings dialog for project-specific settings
 */
export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  isOpen,
  onClose,
  currentProject,
  onProjectUpdate
}) => {
  const handlePathChange = (path: string | undefined) => {
    if (currentProject) {
      onProjectUpdate({ projectPath: path });
    }
  };

  const handleMonorepoModeChange = (checked: boolean) => {
    if (currentProject) {
      onProjectUpdate({ isMonorepoEnabled: checked });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={currentProject ? `Project Settings - ${currentProject.name}` : "Project Settings"}
      className="max-w-lg"
    >
      <div className="space-y-6">
        {currentProject ? (
          <>
            {/* Project Path Section */}
            <ProjectPathSection
              projectPath={currentProject.projectPath}
              onPathChange={handlePathChange}
            />

            {/* Repository Type Section */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-neutral-12 mb-3">
                  Repository Type
                </h3>

                <div className="space-y-3">
                  <Checkbox
                    id="project-monorepo"
                    checked={currentProject.isMonorepoEnabled ?? false}
                    onCheckedChange={handleMonorepoModeChange}
                    label="Enable monorepo features for this project"
                    uiVariant="accent"
                  />

                  <div className="ml-6 text-sm text-neutral-10">
                    <p>
                      Enables monorepo-specific controls and prompt sections for
                      template development and multi-package repositories.
                    </p>
                    <p className="mt-2 text-neutral-9">
                      Enable this if your project contains multiple packages,
                      templates, or requires monorepo-specific tooling.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-4 border-t border-neutral-6">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-neutral-11 hover:text-neutral-12 hover:bg-neutral-3 rounded-md transition-colors"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-neutral-10">
            <p>No project selected. Create or select a project to access settings.</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 text-sm font-medium text-neutral-11 hover:text-neutral-12 hover:bg-neutral-3 rounded-md transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};