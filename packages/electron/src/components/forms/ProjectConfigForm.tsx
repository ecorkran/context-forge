import React, { useState, useEffect } from 'react';
import { cn } from '../../lib/ui-core/utils/cn';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../lib/ui-core/components/form/select';
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
 * - value="implementation" matches "##### Implementation (Phase 6)"
 * - value="task-breakdown" matches "##### Task Breakdown (Phase 5)"
 * - value="concept" matches "##### Concept (Phase 1)"
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
  { type: 'option', value: 'architecture', label: 'Phase 2: Architecture' },
  { type: 'option', value: 'slice-planning', label: 'Phase 3: Slice Planning' },
  { type: 'option', value: 'slice-design', label: 'Phase 4: Slice Design' },
  { type: 'option', value: 'task-breakdown', label: 'Phase 5: Task Breakdown' },
  { type: 'option', value: 'implementation', label: 'Phase 6: Implementation' },
  { type: 'option', value: 'integration', label: 'Phase 7: Integration' },
  { type: 'divider' },
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
  // Normalize YYYYMMDD → YYYY-MM-DD for HTML date input compatibility
  const normalizeDateForInput = (date: string | undefined): string => {
    if (!date) return new Date().toISOString().split('T')[0];
    if (/^\d{8}$/.test(date)) {
      return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    }
    return date;
  };

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

  const [formData, setFormData] = useState<CreateProjectData>({
    name: initialData?.name || '',
    template: initialData?.template || '',
    fileSlice: initialData?.fileSlice || '',
    fileTasks: initialData?.fileTasks || generateTaskFileName(initialData?.fileSlice || ''),
    instruction: initialData?.instruction || 'implementation',
    developmentPhase: initialData?.developmentPhase,
    workType: initialData?.workType || 'continue',
    dateProject: normalizeDateForInput(initialData?.dateProject),
    customData: {
      recentEvents: initialData?.customData?.recentEvents || '',
      additionalNotes: initialData?.customData?.additionalNotes || '',
      availableTools: initialData?.customData?.availableTools || ''
    }
  });

  useEffect(() => {
    if (initialData) {
      setFormData(prev => {
        // Only update if the data actually changed
        if (prev.name !== initialData.name ||
            prev.template !== initialData.template ||
            prev.fileSlice !== initialData.fileSlice) {
          return {
            name: initialData.name || '',
            template: initialData.template || '',
            fileSlice: initialData.fileSlice || '',
            fileTasks: initialData.fileTasks || generateTaskFileName(initialData.fileSlice || ''),
            instruction: initialData.instruction || 'implementation',
            developmentPhase: initialData.developmentPhase,
            workType: initialData.workType || 'continue',
            dateProject: initialData.dateProject || new Date().toISOString().split('T')[0],
            customData: {
              recentEvents: initialData.customData?.recentEvents || '',
              additionalNotes: initialData.customData?.additionalNotes || '',
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
      const oldExpectedTaskFile = generateTaskFileName(prev.fileSlice);

      // Only auto-update if current fileTasks is what we would have generated
      // This preserves manual edits (like adding -x9) while still providing auto-fill
      const shouldAutoUpdate = prev.fileTasks === oldExpectedTaskFile || !prev.fileTasks;

      return {
        ...prev,
        fileSlice: newSlice,
        fileTasks: shouldAutoUpdate ? newTaskFile : prev.fileTasks
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
          <label htmlFor="dateProject" className="block text-sm font-medium text-neutral-11 mb-2">
            Project Date
          </label>
          <input
            id="dateProject"
            name="dateProject"
            type="date"
            value={normalizeDateForInput(formData.dateProject)}
            onChange={(e) => handleInputChange('dateProject', e.target.value)}
            className="w-full px-3 py-2 border border-accent-7 rounded-md bg-neutral-1 text-neutral-12 focus:outline-none focus:ring-2 focus:ring-accent-8 focus:border-transparent [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-50"
          />
        </div>

        <div>
          <label htmlFor="fileSlice" className="block text-sm font-medium text-neutral-11 mb-2">
            Current Slice
          </label>
          <input
            id="fileSlice"
            type="text"
            value={formData.fileSlice}
            onChange={(e) => handleSliceChange(e.target.value)}
            className="w-full px-3 py-2 border border-accent-7 rounded-md bg-neutral-1 text-neutral-12 focus:outline-none focus:ring-2 focus:ring-accent-8 focus:border-transparent"
            placeholder="foundation, auth, ui-components..."
          />
        </div>

        <div>
          <label htmlFor="fileTasks" className="block text-sm font-medium text-neutral-11 mb-2">
            Task File
          </label>
          <input
            id="fileTasks"
            type="text"
            value={formData.fileTasks || ''}
            onChange={(e) => handleInputChange('fileTasks', e.target.value)}
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

        <div>
          <label htmlFor="template" className="block text-sm font-medium text-neutral-11 mb-2">
            Template
          </label>
          <input
            id="template"
            type="text"
            value={formData.template}
            onChange={(e) => handleInputChange('template', e.target.value)}
            className="w-full px-3 py-2 border border-accent-7 rounded-md bg-neutral-1 text-neutral-12 focus:outline-none focus:ring-2 focus:ring-accent-8 focus:border-transparent"
            placeholder="templates/react"
          />
        </div>

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