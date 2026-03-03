import React, { useState, useCallback, useEffect } from 'react';
import { SplitPaneLayout } from './layout/SplitPaneLayout';
import { ProjectConfigForm } from './forms/ProjectConfigForm';
import { ContextOutput } from './display/ContextOutput';
import { SettingsButton } from './settings/SettingsButton';
import { projectApi, appStateApi } from '../services/api';
import type { CreateProjectData, ProjectData } from '@context-forge/core';
import { useContextGeneration } from '../hooks/useContextGeneration';

/** Default form values for a new project */
const DEFAULT_FORM_DATA: CreateProjectData = {
  name: '',
  template: '',
  fileSlice: '',
  fileTasks: '',
  instruction: 'implementation',
  workType: 'continue',
  isMonorepo: false,
  customData: {
    recentEvents: '',
    additionalNotes: '',
  },
};

/**
 * Main application component — thin UI client over the domain IPC API.
 * All project persistence and context generation run in the main process.
 */
export const ContextBuilderApp: React.FC = () => {
  const [formData, setFormData] = useState<CreateProjectData>(DEFAULT_FORM_DATA);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(false);
  const [multiProjectError, setMultiProjectError] = useState<string | null>(null);

  // Context generation is now a single IPC call to the main process
  const { contextString, isLoading: isGenerating, error, regenerate } = useContextGeneration(currentProjectId);

  // ── Session Initialization ────────────────────────────────────────────────────
  useEffect(() => {
    const loadLastSession = async () => {
      try {
        const allProjects = await projectApi.list();
        setProjects(allProjects);

        if (allProjects.length === 0) {
          // First launch — create a default project
          const newProject = await projectApi.create({
            name: 'New Project',
            template: '',
            fileSlice: '',
            fileTasks: '',
            instruction: 'implementation',
            workType: 'continue',
            isMonorepo: false,
            customData: {},
          });
          setProjects([newProject]);
          setCurrentProjectId(newProject.id);
          setFormData(projectToFormData(newProject));
          await appStateApi.update({ lastActiveProjectId: newProject.id });

          if (window.electronAPI?.updateWindowTitle) {
            window.electronAPI.updateWindowTitle(newProject.name);
          }
        } else {
          // Restore last active project from app state
          const appState = await appStateApi.get().catch(() => null);
          const lastId = appState?.lastActiveProjectId;
          const activeProject =
            (lastId && allProjects.find((p) => p.id === lastId)) ?? allProjects[0];

          setCurrentProjectId(activeProject.id);
          setFormData(projectToFormData(activeProject));

          if (window.electronAPI?.updateWindowTitle) {
            window.electronAPI.updateWindowTitle(activeProject.name);
          }
        }
      } catch (e) {
        console.error('Failed to load session:', e);
      }
    };

    loadLastSession();
  }, []);

  // ── Auto-save on form changes, then regenerate context ───────────────────────
  useEffect(() => {
    if (!currentProjectId) return;

    const timeoutId = setTimeout(async () => {
      try {
        await projectApi.update(currentProjectId, {
          name: formData.name,
          template: formData.template,
          fileSlice: formData.fileSlice,
          fileTasks: formData.fileTasks,
          instruction: formData.instruction,
          developmentPhase: formData.developmentPhase,
          workType: formData.workType,
          dateProject: formData.dateProject,
          isMonorepo: formData.isMonorepo,
          isMonorepoEnabled: formData.isMonorepoEnabled,
          projectPath: formData.projectPath,
          customData: formData.customData,
        });
        await appStateApi.update({ lastActiveProjectId: currentProjectId });
        regenerate();
      } catch (e) {
        console.error('Auto-save failed:', e);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData, currentProjectId, regenerate]);

  // ── Event Handlers ────────────────────────────────────────────────────────────
  const handleFormChange = useCallback((data: CreateProjectData) => {
    setFormData((prev) => ({ ...prev, ...data }));
  }, []);

  const updateProjectName = useCallback(() => {
    if (currentProjectId) {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === currentProjectId ? { ...p, name: formData.name } : p,
        ),
      );
    }
  }, [currentProjectId, formData.name]);

  const handleCreateProject = useCallback(async () => {
    console.log('Project auto-saved via IPC persistence layer');
  }, []);

  const handleProjectSwitch = useCallback(
    async (projectId: string) => {
      if (projectId === currentProjectId) return;

      setLoading(true);
      setMultiProjectError(null);

      try {
        const project = await projectApi.get(projectId);
        if (!project) throw new Error('Project not found after switch');

        setCurrentProjectId(projectId);
        setFormData(projectToFormData(project));
        await appStateApi.update({ lastActiveProjectId: projectId });

        if (window.electronAPI?.updateWindowTitle) {
          window.electronAPI.updateWindowTitle(project.name);
        }
      } catch (e) {
        console.error('Failed to switch project:', e);
        setMultiProjectError(
          `Failed to switch project: ${e instanceof Error ? e.message : String(e)}`,
        );
      } finally {
        setLoading(false);
      }
    },
    [currentProjectId],
  );

  const handleNewProjectCreate = useCallback(async () => {
    setLoading(true);
    setMultiProjectError(null);

    try {
      const newProject = await projectApi.create({
        name: generateProjectName(projects),
        template: formData.template || '',
        fileSlice: formData.fileSlice || '',
        fileTasks: formData.fileTasks || '',
        instruction: 'implementation',
        workType: 'continue',
        isMonorepo: false,
        dateProject: new Date().toISOString().split('T')[0],
        customData: { recentEvents: '', additionalNotes: '', monorepoNote: '', availableTools: '' },
      });

      const updatedProjects = await projectApi.list();
      setProjects(updatedProjects);
      setCurrentProjectId(newProject.id);
      setFormData(projectToFormData(newProject));
      await appStateApi.update({ lastActiveProjectId: newProject.id });

      if (window.electronAPI?.updateWindowTitle) {
        window.electronAPI.updateWindowTitle(newProject.name);
      }
    } catch (e) {
      console.error('Failed to create project:', e);
      setMultiProjectError(
        `Failed to create project: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setLoading(false);
    }
  }, [formData.template, formData.fileSlice, formData.fileTasks, projects]);

  const handleProjectDelete = useCallback(
    async (projectId: string) => {
      if (projects.length <= 1) return;

      const confirmDelete = window.confirm(
        'Are you sure you want to delete this project? This action cannot be undone.',
      );
      if (!confirmDelete) return;

      setLoading(true);
      setMultiProjectError(null);

      try {
        await projectApi.delete(projectId);
        const updatedProjects = await projectApi.list();
        setProjects(updatedProjects);

        if (projectId === currentProjectId && updatedProjects.length > 0) {
          const next = updatedProjects[0];
          setCurrentProjectId(next.id);
          setFormData(projectToFormData(next));
          await appStateApi.update({ lastActiveProjectId: next.id });
        }
      } catch (e) {
        console.error('Failed to delete project:', e);
        setMultiProjectError(
          `Failed to delete project: ${e instanceof Error ? e.message : String(e)}`,
        );
      } finally {
        setLoading(false);
      }
    },
    [projects.length, currentProjectId],
  );

  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null;

  const handleProjectUpdate = useCallback(
    async (updates: Partial<ProjectData>) => {
      if (!currentProject) return;
      const updatedFormData = { ...formData, ...updates };
      setFormData(updatedFormData);
      setProjects((prev) =>
        prev.map((p) => (p.id === currentProjectId ? { ...p, ...updates } : p)),
      );
      handleFormChange(updatedFormData);
    },
    [currentProject, formData, handleFormChange, currentProjectId],
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  const leftPanelContent = (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-neutral-12 ml-[calc(var(--radius)*0.25)]">
            Project Configuration
          </h2>
          <SettingsButton
            className="mr-[calc(var(--radius)*0.25)]"
            currentProject={currentProject}
            onProjectUpdate={handleProjectUpdate}
          />
        </div>
        <ProjectConfigForm
          initialData={formData}
          onChange={handleFormChange}
          onSubmit={handleCreateProject}
          projects={projects}
          currentProjectId={currentProjectId}
          loading={loading}
          multiProjectError={multiProjectError}
          onProjectSwitch={handleProjectSwitch}
          onProjectCreate={handleNewProjectCreate}
          onProjectDelete={handleProjectDelete}
          onProjectNameUpdate={updateProjectName}
        />
      </div>
    </div>
  );

  const isNoProjectPath = error?.includes('has no projectPath configured') ?? false;
  const errorMessage = isNoProjectPath
    ? 'No project directory set — select a project path to generate context'
    : error ? `Error: ${error}` : null;

  const rightPanelContent = (
    <div className="flex flex-col h-full space-y-4">
      {errorMessage && (
        <div
          className="flex-shrink-0 p-3 bg-red-50 border border-red-200 rounded-md"
          role="alert"
          aria-live="assertive"
        >
          <p className="text-sm text-red-700 flex items-center">
            <svg
              className="mr-2 h-4 w-4 text-red-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {errorMessage}
          </p>
        </div>
      )}

      <div className="flex-grow relative min-h-0">
        <ContextOutput
          context={contextString}
          title="Generated Context for Claude Code"
          className="h-full"
        />
        {isGenerating && (
          <div className="absolute top-2 right-2 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs flex items-center">
            <svg
              className="animate-spin -ml-1 mr-1 h-3 w-3"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Updating...
          </div>
        )}
      </div>
    </div>
  );

  return <SplitPaneLayout leftContent={leftPanelContent} rightContent={rightPanelContent} />;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function projectToFormData(project: ProjectData): CreateProjectData {
  return {
    name: project.name,
    template: project.template,
    fileSlice: project.fileSlice,
    fileTasks: project.fileTasks || '',
    instruction: project.instruction,
    developmentPhase: project.developmentPhase,
    workType: project.workType,
    dateProject: project.dateProject,
    isMonorepo: project.isMonorepo,
    isMonorepoEnabled: project.isMonorepoEnabled,
    projectPath: project.projectPath,
    customData: {
      recentEvents: project.customData?.recentEvents || '',
      additionalNotes: project.customData?.additionalNotes || '',
      monorepoNote: project.customData?.monorepoNote || '',
      availableTools: project.customData?.availableTools || '',
    },
  };
}

function generateProjectName(existingProjects: ProjectData[]): string {
  const baseName = 'New Project';
  const existingNames = existingProjects.map((p) => p.name);
  if (!existingNames.includes(baseName)) return baseName;
  let counter = 2;
  while (existingNames.includes(`${baseName} ${counter}`)) counter++;
  return `${baseName} ${counter}`;
}
