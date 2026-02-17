import React, { useState, useEffect } from 'react';
import { cn } from '../../lib/ui-core/utils/cn';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../lib/ui-core/components/form/select';
import { Checkbox } from '../../lib/ui-core/components/form/checkbox';
import { CreateProjectData, ProjectData } from '@context-forge/core';
import { ProjectSelector } from '../project/ProjectSelector';

/**
 * Development phase options with ordering and grouping
 *
 * SINGLE SOURCE OF TRUTH for both dropdown rendering and developmentPhase field
 *
 * IMPORTANT: The 'value' field is used for fuzzy matching against section headers
 * in prompt.ai-project.system.md. The system searches for prompts where the section
 * header contains the value string (case-insensitive).
 *
 * Examples:
 * - value="implementation" matches "##### Task Implementation (Phase 7)"
 * - value="task-breakdown" matches "##### Task Breakdown (Phase 5)"
 * - value="concept" matches "##### Concept Creation (Phase 1)"
 *
 * The 'label' field is the human-readable text shown in the dropdown AND used
 * as the {development-phase} variable in context output templates.
 *
 * Ensure value strings appear in the corresponding prompt file section headers
 * for reliable matching.
 */
type PhaseOption =
  | { type: 'option'; value: string; label: string }
  | { type: 'divider' };

const PHASE_OPTIONS: PhaseOption[] = [
  { type: 'option', value: 'concept', label: 'Phase 1: Concept' },
  { type: 'option', value: 'spec-creation', label: 'Phase 2: Spec Creation' },
  { type: 'option', value: 'slice-planning', label: 'Phase 3: Slice Planning' },
  { type: 'option', value: 'slice-design', label: 'Phase 4: Slice Design' },
  { type: 'option', value: 'task-breakdown', label: 'Phase 5: Task Breakdown' },
  { type: 'option', value: 'task-breakdown-explicit', label: 'Phase 5: Task Breakdown - Explicit Follow' },
  { type: 'option', value: 'task-expansion', label: 'Phase 6: Task Expansion' },
  { type: 'option', value: 'implementation', label: 'Phase 7: Implementation' },
  { type: 'divider' },
  { type: 'option', value: 'feature-design', label: 'Feature Design' },
  { type: 'option', value: 'ad-hoc-tasks', label: 'Ad-Hoc Tasks' },
  { type: 'option', value: 'custom-instruction', label: 'Custom Instruction' },
  { type: 'divider' },
  { type: 'option', value: 'analyze-codebase', label: 'Analyze Codebase' },
  { type: 'option', value: 'analyze-processing', label: 'Analyze Processing' },
  { type: 'option', value: 'analyze-lld', label: 'Analyze LLD' },
  { type: 'option', value: 'analyze-tasks', label: 'Analyze Tasks' },
  { type: 'option', value: 'analyze-implementation', label: 'Analyze Implementation' }
];

/**
 * Helper function to get phase label by value
 */
const getPhaseLabelByValue = (value: string): string | undefined => {
  const option = PHASE_OPTIONS.find(opt => opt.type === 'option' && opt.value === value);
  return option && option.type === 'option' ? option.label : undefined;
};

interface ProjectConfigFormProps {
  initialData?: CreateProjectData;
  onSubmit?: (data: CreateProjectData) => void;
  onChange?: (data: CreateProjectData) => void;
  className?: string;
  // Project management props
  projects: ProjectData[];
  currentProjectId: string | null;
  loading?: boolean;
  multiProjectError?: string | null;
  onProjectSwitch: (projectId: string) => void;
  onProjectCreate: () => void;
  onProjectDelete: (projectId: string) => void;
  onProjectNameUpdate: () => void;
}

/**
 * Form for configuring project parameters
 */
export const ProjectConfigForm: React.FC<ProjectConfigFormProps> = ({
  initialData,
  onSubmit,
  onChange,
  className,
  projects,
  currentProjectId,
  loading = false,
  multiProjectError = null,
  onProjectSwitch,
  onProjectCreate,
  onProjectDelete,
  onProjectNameUpdate
}) => {
  // Helper function to generate task file name from slice
  const generateTaskFileName = (slice: string): string => {
    if (!slice) return '';

    // Extract number prefix and suffix from formats like:
    // "031-slice.hero-section" -> "031-tasks.hero-section"
    // "050-arch.something" -> "050-tasks.something"
    // "200-feature.auth" -> "200-tasks.auth"
    const match = slice.match(/^(\d+)-[^.]+\.(.+)$/);
    if (match) {
      const [, number, suffix] = match;
      return `${number}-tasks.${suffix}`;
    }

    // Fallback for simple replacement if no number prefix found
    return slice.replace(/^([^-]+)-/, '$1-tasks-');
  };

  // Get current project to check if monorepo features are enabled
  const currentProject = projects.find(p => p.id === currentProjectId);
  const monorepoFeaturesEnabled = currentProject?.isMonorepoEnabled ?? false;

  const [formData, setFormData] = useState<CreateProjectData>({
    name: initialData?.name || '',
    template: initialData?.template || '',
    slice: initialData?.slice || '',
    taskFile: initialData?.taskFile || generateTaskFileName(initialData?.slice || ''),
    instruction: initialData?.instruction || 'implementation',
    developmentPhase: initialData?.developmentPhase,
    workType: initialData?.workType || 'continue',
    projectDate: initialData?.projectDate || new Date().toISOString().split('T')[0],
    isMonorepo: initialData?.isMonorepo || false,
    isMonorepoEnabled: initialData?.isMonorepoEnabled,
    customData: {
      recentEvents: initialData?.customData?.recentEvents || '',
      additionalNotes: initialData?.customData?.additionalNotes || '',
      monorepoNote: initialData?.customData?.monorepoNote || '',
      availableTools: initialData?.customData?.availableTools || ''
    }
  });

  // Get global settings to control monorepo UI visibility

  useEffect(() => {
    if (initialData) {
      setFormData(prev => {
        // Only update if the data actually changed
        if (prev.name !== initialData.name ||
            prev.isMonorepo !== initialData.isMonorepo ||
            prev.template !== initialData.template ||
            prev.slice !== initialData.slice) {
          return {
            name: initialData.name || '',
            template: initialData.template || '',
            slice: initialData.slice || '',
            taskFile: initialData.taskFile || generateTaskFileName(initialData.slice || ''),
            instruction: initialData.instruction || 'implementation',
            developmentPhase: initialData.developmentPhase,
            workType: initialData.workType || 'continue',
            projectDate: initialData.projectDate || new Date().toISOString().split('T')[0],
            isMonorepo: initialData.isMonorepo || false,
            isMonorepoEnabled: initialData.isMonorepoEnabled,
            customData: {
              recentEvents: initialData.customData?.recentEvents || '',
              additionalNotes: initialData.customData?.additionalNotes || '',
              monorepoNote: initialData.customData?.monorepoNote || '',
              availableTools: initialData.customData?.availableTools || ''
            }
          };
        }
        return prev;
      });
    }
  }, [initialData]);

  // Call onChange when form data changes  
  useEffect(() => {
    onChange?.(formData);
  }, [formData, onChange]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.(formData);
  };

  const handleInputChange = (field: keyof CreateProjectData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCustomDataChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      customData: {
        ...prev.customData,
        [field]: value
      }
    }));
  };

  // Handler for slice changes - auto-update taskFile in real-time
  // But preserve manual edits: only update if taskFile matches what we would have generated
  const handleSliceChange = (newSlice: string) => {
    setFormData(prev => {
      const newTaskFile = generateTaskFileName(newSlice);
      const oldExpectedTaskFile = generateTaskFileName(prev.slice);

      // Only auto-update if current taskFile is what we would have generated
      // This preserves manual edits (like adding -x9) while still providing auto-fill
      const shouldAutoUpdate = prev.taskFile === oldExpectedTaskFile || !prev.taskFile;

      return {
        ...prev,
        slice: newSlice,
        taskFile: shouldAutoUpdate ? newTaskFile : prev.taskFile
      };
    });
  };

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      <div className="space-y-4">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-neutral-11 mb-2">
              Project
            </label>
            <ProjectSelector
              projects={projects}
              currentProjectId={currentProjectId}
              loading={loading}
              error={multiProjectError}
              disabled={loading}
              onProjectSwitch={onProjectSwitch}
              onProjectCreate={onProjectCreate}
              onProjectDelete={onProjectDelete}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-11 mb-2">
              Project Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              onBlur={onProjectNameUpdate}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onProjectNameUpdate();
                }
              }}
              className="w-full px-3 py-2 border border-accent-7 rounded-md bg-neutral-1 text-neutral-12 focus:outline-none focus:ring-2 focus:ring-accent-8 focus:border-transparent"
              placeholder="Enter project name..."
              disabled={loading}
            />
          </div>
        </div>

        <div>
          <label htmlFor="projectDate" className="block text-sm font-medium text-neutral-11 mb-2">
            Project Date
          </label>
          <input
            id="projectDate"
            name="projectDate"
            type="date"
            value={formData.projectDate || new Date().toISOString().split('T')[0]}
            onChange={(e) => handleInputChange('projectDate', e.target.value)}
            className="w-full px-3 py-2 border border-accent-7 rounded-md bg-neutral-1 text-neutral-12 focus:outline-none focus:ring-2 focus:ring-accent-8 focus:border-transparent [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-50"
          />
        </div>

        <div>
          <label htmlFor="slice" className="block text-sm font-medium text-neutral-11 mb-2">
            Current Slice
          </label>
          <input
            id="slice"
            type="text"
            value={formData.slice}
            onChange={(e) => handleSliceChange(e.target.value)}
            className="w-full px-3 py-2 border border-accent-7 rounded-md bg-neutral-1 text-neutral-12 focus:outline-none focus:ring-2 focus:ring-accent-8 focus:border-transparent"
            placeholder="foundation, auth, ui-components..."
          />
        </div>

        <div>
          <label htmlFor="task-file" className="block text-sm font-medium text-neutral-11 mb-2">
            Task File
          </label>
          <input
            id="task-file"
            type="text"
            value={formData.taskFile || ''}
            onChange={(e) => handleInputChange('taskFile', e.target.value)}
            className="w-full px-3 py-2 border border-accent-7 rounded-md bg-neutral-1 text-neutral-12 focus:outline-none focus:ring-2 focus:ring-accent-8 focus:border-transparent"
            placeholder="031-tasks.hero-section"
          />
        </div>

        <div>
          <label htmlFor="work-type" className="block text-sm font-medium text-neutral-11 mb-2">
            Work Type
          </label>
          <Select
            value={formData.workType || 'continue'}
            onValueChange={(value) => handleInputChange('workType', value as 'start' | 'continue')}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select work type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="start">Start - Beginning new work</SelectItem>
              <SelectItem value="continue">Continue - Resuming existing work</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 3. Available Tools */}
        <div className="space-y-2">
          <label htmlFor="available-tools" className="block text-sm font-medium text-neutral-12">
            Available Tools
          </label>
          <textarea
            id="available-tools"
            value={formData.customData?.availableTools || ''}
            onChange={(e) => handleCustomDataChange('availableTools', e.target.value)}
            placeholder="List available tools (e.g., context7, Radix)"
            className="w-full px-3 py-2 text-sm border border-accent-7 rounded-md bg-neutral-1 text-neutral-12 placeholder-neutral-9 focus:outline-none focus:ring-2 focus:ring-accent-8 focus:border-transparent resize-y min-h-[2.5rem]"
            rows={1}
          />
        </div>

        {/* 4. Development Phase (see PHASE_OPTIONS at top of file for configuration) */}
        <div>
          <label htmlFor="instruction" className="block text-sm font-medium text-neutral-11 mb-2">
            Development Phase
          </label>
          <Select
            value={formData.instruction || 'implementation'}
            onValueChange={(value) => {
              // Update both instruction key and human-readable developmentPhase label
              handleInputChange('instruction', value);
              const phaseLabel = getPhaseLabelByValue(value);
              if (phaseLabel) {
                handleInputChange('developmentPhase', phaseLabel);
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select development phase..." />
            </SelectTrigger>
            <SelectContent>
              {PHASE_OPTIONS.map((option, index) => {
                if (option.type === 'divider') {
                  return <div key={`divider-${index}`} className="border-t border-neutral-6 my-1 mx-2" />;
                }
                return (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* 5. Repository structure - Only show when monorepo features are enabled */}
        {monorepoFeaturesEnabled && (
          <div className="space-y-3 pt-2" >
            <Checkbox
              id="is-monorepo"
              checked={formData.isMonorepo}
              onCheckedChange={(checked) => handleInputChange('isMonorepo', checked)}
              label="Monorepo project"
              uiVariant="accent"
              className='ml-[calc(var(--radius)*0.25)]'
            />

            <div className='pt-2'>
              <label htmlFor="template" className={`block text-sm font-medium mb-2 ${formData.isMonorepo ? 'text-neutral-11' : 'text-neutral-8'}`}>
                Template
              </label>
              <input
                id="template"
                type="text"
                value={formData.template}
                onChange={(e) => handleInputChange('template', e.target.value)}
                disabled={!formData.isMonorepo}
                className={`w-full px-3 py-2 border border-accent-7 rounded-md bg-neutral-1 text-neutral-12 focus:outline-none focus:ring-2 focus:ring-accent-8 focus:border-transparent ${!formData.isMonorepo ? 'opacity-60' : ''}`}
                placeholder={formData.isMonorepo ? "templates/react" : "Enable monorepo to set template"}
              />
            </div>

            <div>
              <label htmlFor="monorepo-note" className={`block text-sm font-medium mb-2 ${formData.isMonorepo ? 'text-neutral-11' : 'text-neutral-8'}`}>
                Monorepo Structure (optional)
              </label>
              <textarea
                id="monorepo-note"
                value={formData.customData?.monorepoNote || ''}
                onChange={(e) => handleInputChange('customData', {
                  ...formData.customData,
                  monorepoNote: e.target.value
                })}
                disabled={!formData.isMonorepo}
                className={`w-full px-3 py-2 border border-accent-7 rounded-md bg-neutral-1 text-neutral-12 focus:outline-none focus:ring-2 focus:ring-accent-8 focus:border-transparent resize-vertical transition-colors ${!formData.isMonorepo ? 'opacity-60' : ''}`}
                placeholder={formData.isMonorepo ? "Package structure, workspace organization..." : "Enable monorepo for structure notes"}
                rows={6}
                maxLength={32000}
              />
              <div className="flex justify-end mt-1">
                <span className="text-xs text-neutral-9">
                  {(formData.customData?.monorepoNote || '').length}/32000 characters
                </span>
              </div>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="recent-events" className="block text-sm font-medium text-neutral-11 mb-2">
            Project State
          </label>
          <textarea
            id="recent-events"
            value={formData.customData?.recentEvents || ''}
            onChange={(e) => handleInputChange('customData', {
              ...formData.customData,
              recentEvents: e.target.value
            })}
            className="w-full px-3 py-2 border border-accent-7 rounded-md bg-neutral-1 text-neutral-12 focus:outline-none focus:ring-2 focus:ring-accent-8 focus:border-transparent resize-vertical transition-colors"
            placeholder="• Recent changes, bug fixes, features added..."
            rows={6}
            maxLength={32000}
            aria-describedby="recent-events-help"
          />
          <div className="flex justify-end mt-1">
            <span id="recent-events-help" className="text-xs text-neutral-9">
              {(formData.customData?.recentEvents || '').length}/32000 characters
            </span>
          </div>
        </div>

        {/* 6. Additional notes */}
        <div>
          <label htmlFor="additional-notes" className="block text-sm font-medium text-neutral-11 mb-2">
            Additional Instructions
          </label>
          <textarea
            id="additional-notes"
            value={formData.customData?.additionalNotes || ''}
            onChange={(e) => handleInputChange('customData', {
              ...formData.customData,
              additionalNotes: e.target.value
            })}
            className="w-full px-3 py-2 border border-accent-3 rounded-md bg-neutral-1 text-neutral-12 focus:outline-none focus:ring-2 focus:ring-accent-8 focus:border-transparent resize-vertical transition-colors"
            placeholder="Any additional instructions or specific focus areas..."
            rows={5}
            maxLength={32000}
            aria-describedby="additional-notes-help"
          />
          <div className="flex justify-end mt-1">
            <span id="additional-notes-help" className="text-xs text-neutral-9">
              {(formData.customData?.additionalNotes || '').length}/32000 characters
            </span>
          </div>
        </div>
      </div>

    </form>
  );
};