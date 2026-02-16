import { Plus, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../lib/ui-core/components/form/select';
import { Button } from '../../lib/ui-core/components/ui/button';
import { ProjectData } from '../../services/storage/types/ProjectData';

export interface ProjectSelectorProps {
  projects: ProjectData[];
  currentProjectId: string | null;
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
  onProjectSwitch: (projectId: string) => void;
  onProjectCreate: () => void;
  onProjectDelete: (projectId: string) => void;
}

export function ProjectSelector({
  projects,
  currentProjectId,
  loading = false,
  error = null,
  disabled = false,
  onProjectSwitch,
  onProjectCreate,
  onProjectDelete,
}: ProjectSelectorProps) {
  const handleProjectChange = (value: string) => {
    if (value && value !== currentProjectId) {
      onProjectSwitch(value);
    }
  };

  const handleDeleteClick = () => {
    if (currentProjectId && projects.length > 1) {
      onProjectDelete(currentProjectId);
    }
  };

  const canDelete = projects.length > 1 && currentProjectId;
  const currentProject = projects.find(p => p.id === currentProjectId);

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <Select
          value={currentProjectId || undefined}
          onValueChange={handleProjectChange}
          disabled={disabled || loading}
        >
          <SelectTrigger>
            <SelectValue 
              placeholder="Select project..."
              className="text-left"
            >
              {currentProject?.name || "Select project..."}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                <div className="flex flex-col">
                  <span className="font-medium">{project.name}</span>
                  <span className="text-xs text-muted-foreground">
                    Updated {new Date(project.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && (
          <p className="mt-1 text-xs text-destructive">{error}</p>
        )}
      </div>
      
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onProjectCreate}
        disabled={disabled || loading}
        title="Create new project"
      >
        <Plus className="h-4 w-4" />
      </Button>
      
      {canDelete && (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={handleDeleteClick}
          disabled={disabled || loading}
          title="Delete current project"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}