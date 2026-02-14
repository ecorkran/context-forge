import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { SplitPaneLayout } from './layout/SplitPaneLayout';
import { ProjectConfigForm } from './forms/ProjectConfigForm';
import { ContextOutput } from './display/ContextOutput';
import { SettingsButton } from './settings/SettingsButton';
import { PersistentProjectStore } from '../services/storage/PersistentProjectStore';
import { CreateProjectData, ProjectData } from '../services/storage/types/ProjectData';
import { ProjectManager } from '../services/project/ProjectManager';
import { useContextGeneration } from '../hooks/useContextGeneration';
import { useDebounce } from '../hooks/useDebounce';

/**
 * Main application component that integrates all functionality
 */
export const ContextBuilderApp: React.FC = () => {
  const [formData, setFormData] = useState<CreateProjectData>({
    name: '',
    template: '',
    slice: '',
    taskFile: '',
    instruction: 'implementation',
    workType: 'continue',
    isMonorepo: false,
    customData: {
      recentEvents: '',
      additionalNotes: ''
    }
  });

  // Add persistence state management
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(false);
  const [multiProjectError, setMultiProjectError] = useState<string | null>(null);

  // Create persistent storage service instance
  const persistentStore = useMemo(() => {
    try {
      return new PersistentProjectStore();
    } catch (error) {
      console.error('Failed to initialize persistent storage:', error);
      return null;
    }
  }, []);

  // Create ProjectManager instance
  const projectManager = useMemo(() => {
    if (!persistentStore) return null;
    try {
      return new ProjectManager(persistentStore);
    } catch (error) {
      console.error('Failed to initialize project manager:', error);
      return null;
    }
  }, [persistentStore]);

  // Create a temporary project object for context generation
  const tempProject: ProjectData | null = useMemo(() => {
    // Start generating context when we have project name and slice
    // Template is optional - use default if not provided
    const hasRequiredFields = formData.name && formData.slice;
    
    if (!hasRequiredFields) {
      return null;
    }

    return {
      id: 'temp',
      ...formData,
      template: formData.template || 'default', // Provide default template for non-monorepo
      taskFile: formData.taskFile || '', // Ensure taskFile is always a string
      instruction: formData.instruction || 'implementation',
      workType: formData.workType || 'continue',
      customData: formData.customData || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }, [formData]);

  // Debounce the project data for smoother real-time updates (300ms delay)
  const debouncedProject = useDebounce(tempProject, 300);

  // Use the context generation hook
  const { contextString, isLoading: isGenerating, error } = useContextGeneration(debouncedProject);

  // Load last session on mount (simple, fast)
  useEffect(() => {
    const loadLastSession = async () => {
      if (!projectManager) return;

      try {
        const allProjects = await projectManager.loadAllProjects();
        setProjects(allProjects);
        
        if (allProjects.length === 0) {
          // Create default project for first-time users
          const newProject = await projectManager.createNewProject();
          setProjects([newProject]);
          setCurrentProjectId(newProject.id);
          setFormData({
            name: newProject.name,
            template: newProject.template,
            slice: newProject.slice,
            taskFile: newProject.taskFile || '',
            instruction: newProject.instruction,
            developmentPhase: newProject.developmentPhase,
            workType: newProject.workType,
            projectDate: newProject.projectDate,
            isMonorepo: newProject.isMonorepo,
            isMonorepoEnabled: newProject.isMonorepoEnabled,
            projectPath: newProject.projectPath,
            customData: {
              recentEvents: '',
              additionalNotes: '',
              monorepoNote: '',
              availableTools: ''
            },
          });

          // Update window title for new project
          if (window.electronAPI?.updateWindowTitle) {
            window.electronAPI.updateWindowTitle(newProject.name);
          }
        } else {
          // Restore last active project
          const activeProject = await projectManager.getCurrentProject() || allProjects[0];

          setCurrentProjectId(activeProject.id);
          const restoredFormData = {
            name: activeProject.name,
            template: activeProject.template,
            slice: activeProject.slice,
            taskFile: activeProject.taskFile || '',
            instruction: activeProject.instruction,
            developmentPhase: activeProject.developmentPhase,
            workType: activeProject.workType,
            projectDate: activeProject.projectDate,
            isMonorepo: activeProject.isMonorepo,
            isMonorepoEnabled: activeProject.isMonorepoEnabled,
            projectPath: activeProject.projectPath,
            customData: {
              recentEvents: activeProject.customData?.recentEvents || '',
              additionalNotes: activeProject.customData?.additionalNotes || '',
              monorepoNote: activeProject.customData?.monorepoNote || '',
              availableTools: activeProject.customData?.availableTools || ''
            },
          };
          console.log('ContextBuilderApp: Restoring project data:', restoredFormData);
          setFormData(restoredFormData);
          
          // Update window title for restored project
          if (window.electronAPI?.updateWindowTitle) {
            window.electronAPI.updateWindowTitle(activeProject.name);
          }
        }
      } catch (error) {
        console.error('Failed to load project:', error);
      }
    };

    loadLastSession();
  }, [projectManager]);

  // Simple auto-save on form changes
  useEffect(() => {
    if (!persistentStore || !currentProjectId) return;

    const timeoutId = setTimeout(async () => {
      try {
        await persistentStore.updateProject(currentProjectId, {
          name: formData.name,
          template: formData.template,
          slice: formData.slice,
          taskFile: formData.taskFile,
          instruction: formData.instruction,
          developmentPhase: formData.developmentPhase,
          workType: formData.workType,
          projectDate: formData.projectDate,
          isMonorepo: formData.isMonorepo,
          isMonorepoEnabled: formData.isMonorepoEnabled,
          projectPath: formData.projectPath,
          customData: formData.customData,
        });
        await persistentStore.setLastActiveProject(currentProjectId);
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData, currentProjectId, persistentStore]);

  // Keep refs to latest values so the flush callback is never stale
  const formDataRef = useRef(formData);
  const projectIdRef = useRef(currentProjectId);
  formDataRef.current = formData;
  projectIdRef.current = currentProjectId;

  // Flush pending saves when the app is about to quit
  useEffect(() => {
    if (!persistentStore) return;

    const cleanup = window.electronAPI?.onFlushSave(() => {
      const data = formDataRef.current;
      const id = projectIdRef.current;
      if (!id) return;

      persistentStore.updateProject(id, {
        name: data.name,
        template: data.template,
        slice: data.slice,
        taskFile: data.taskFile,
        instruction: data.instruction,
        developmentPhase: data.developmentPhase,
        workType: data.workType,
        projectDate: data.projectDate,
        isMonorepo: data.isMonorepo,
        isMonorepoEnabled: data.isMonorepoEnabled,
        projectPath: data.projectPath,
        customData: data.customData,
      }).catch((err) => console.error('Flush save failed:', err));
    });

    return cleanup;
  }, [persistentStore]);

  const handleFormChange = useCallback((data: CreateProjectData) => {
    setFormData(prev => ({ ...prev, ...data }));
  }, []);

  // Update project name in the projects list
  const updateProjectName = useCallback(() => {
    if (currentProjectId) {
      setProjects(prev => prev.map(project => 
        project.id === currentProjectId 
          ? { ...project, name: formData.name }
          : project
      ));
    }
  }, [currentProjectId, formData.name]);

  const handleCreateProject = useCallback(async () => {
    // This is now handled by auto-save - keeping for form compatibility
    console.log('Project auto-saved via persistence layer');
  }, []);

  // Project Management Handlers
  const handleProjectSwitch = useCallback(async (projectId: string) => {
    if (!projectManager || projectId === currentProjectId) return;
    
    setLoading(true);
    setMultiProjectError(null);
    
    try {
      const switchedProject = await projectManager.switchToProject(projectId);
      if (!switchedProject) {
        throw new Error('Failed to get project data after switch');
      }
      
      setCurrentProjectId(projectId);
      
      // Update form with switched project data
      setFormData({
        name: switchedProject.name,
        template: switchedProject.template,
        slice: switchedProject.slice,
        taskFile: switchedProject.taskFile || '',
        instruction: switchedProject.instruction,
        developmentPhase: switchedProject.developmentPhase,
        workType: switchedProject.workType,
        projectDate: switchedProject.projectDate,
        isMonorepo: switchedProject.isMonorepo,
        isMonorepoEnabled: switchedProject.isMonorepoEnabled,
        projectPath: switchedProject.projectPath,
        customData: {
          recentEvents: switchedProject.customData?.recentEvents || '',
          additionalNotes: switchedProject.customData?.additionalNotes || '',
          monorepoNote: switchedProject.customData?.monorepoNote || '',
          availableTools: switchedProject.customData?.availableTools || ''
        },
      });
      
      // Update window title with project name
      if (window.electronAPI?.updateWindowTitle) {
        window.electronAPI.updateWindowTitle(switchedProject.name);
      }
      
      console.log('ContextBuilderApp: Switched to project:', switchedProject.name, 'Template:', switchedProject.template, 'Monorepo:', switchedProject.isMonorepo);
    } catch (error) {
      console.error('Failed to switch project:', error);
      setMultiProjectError(`Failed to switch project: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }, [projectManager, currentProjectId]);

  const handleNewProjectCreate = useCallback(async () => {
    if (!projectManager) return;
    
    setLoading(true);
    setMultiProjectError(null);
    
    try {
      const newProject = await projectManager.createNewProject();
      const updatedProjects = await projectManager.loadAllProjects();
      setProjects(updatedProjects);
      setCurrentProjectId(newProject.id);
      
      // Populate new project with current form template/slice for immediate preview
      const newFormData = {
        name: newProject.name,
        template: formData.template || '',  // Inherit from current project
        slice: formData.slice || '',        // Inherit from current project
        taskFile: formData.taskFile || '',  // Inherit from current project
        instruction: newProject.instruction,
        developmentPhase: formData.developmentPhase || '',  // Inherit from current project
        workType: formData.workType || newProject.workType,  // Inherit from current project
        projectDate: new Date().toISOString().split('T')[0],  // Set to today's date (YYYY-MM-DD)
        isMonorepo: newProject.isMonorepo,
        isMonorepoEnabled: newProject.isMonorepoEnabled,
        customData: {
          recentEvents: '',
          additionalNotes: '',
          monorepoNote: '',
          availableTools: ''
        },
      };
      
      setFormData(newFormData);
      
      // Update window title for new project
      if (window.electronAPI?.updateWindowTitle) {
        window.electronAPI.updateWindowTitle(newProject.name);
      }
      
      // Update the project with inherited values for immediate save
      if (formData.template || formData.slice) {
        setTimeout(async () => {
          try {
            await persistentStore?.updateProject(newProject.id, {
              template: formData.template,
              slice: formData.slice
            });
          } catch (error) {
            console.error('Failed to update new project with inherited values:', error);
          }
        }, 100);
      }
    } catch (error) {
      console.error('Failed to create project:', error);
      setMultiProjectError(`Failed to create project: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }, [projectManager, formData.template, formData.slice]);

  const handleProjectDelete = useCallback(async (projectId: string) => {
    if (!projectManager || projects.length <= 1) return;
    
    const confirmDelete = window.confirm('Are you sure you want to delete this project? This action cannot be undone.');
    if (!confirmDelete) return;
    
    setLoading(true);
    setMultiProjectError(null);
    
    try {
      await projectManager.deleteProject(projectId);
      const updatedProjects = await projectManager.loadAllProjects();
      setProjects(updatedProjects);
      
      // If we deleted the current project, switch to another one
      if (projectId === currentProjectId && updatedProjects.length > 0) {
        const newActiveProject = updatedProjects[0];
        setCurrentProjectId(newActiveProject.id);
        setFormData({
          name: newActiveProject.name,
          template: newActiveProject.template,
          slice: newActiveProject.slice,
          taskFile: newActiveProject.taskFile || '',
          instruction: newActiveProject.instruction,
          developmentPhase: newActiveProject.developmentPhase,
          workType: newActiveProject.workType,
          projectDate: newActiveProject.projectDate,
          isMonorepo: newActiveProject.isMonorepo,
          isMonorepoEnabled: newActiveProject.isMonorepoEnabled,
          projectPath: newActiveProject.projectPath,
          customData: {
            recentEvents: newActiveProject.customData?.recentEvents || '',
            additionalNotes: newActiveProject.customData?.additionalNotes || '',
            monorepoNote: newActiveProject.customData?.monorepoNote || '',
            availableTools: newActiveProject.customData?.availableTools || ''
          },
        });
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
      setMultiProjectError(`Failed to delete project: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }, [projectManager, projects.length, currentProjectId]);

  // Get current project object
  const currentProject = useMemo(() => {
    return currentProjectId ? projects.find(p => p.id === currentProjectId) ?? null : null;
  }, [currentProjectId, projects]);

  // Callback to update project settings
  const handleProjectUpdate = useCallback(async (updates: Partial<ProjectData>) => {
    if (!currentProject) return;

    const updatedFormData = {
      ...formData,
      ...updates
    };

    setFormData(updatedFormData);

    // Update the projects array to reflect the changes immediately
    setProjects(prev => prev.map(project =>
      project.id === currentProjectId
        ? { ...project, ...updates }
        : project
    ));

    // Trigger form change handler to update output preview and persist changes
    handleFormChange(updatedFormData);
  }, [currentProject, formData, handleFormChange, currentProjectId]);

  const leftPanelContent = (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-neutral-12 ml-[calc(var(--radius)*0.25)]">Project Configuration</h2>
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

  const rightPanelContent = (
    <div className="flex flex-col h-full space-y-4">
      {error && (
        <div className="flex-shrink-0 p-3 bg-red-50 border border-red-200 rounded-md" role="alert" aria-live="assertive">
          <p className="text-sm text-red-700 flex items-center">
            <svg className="mr-2 h-4 w-4 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Error: {error}
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
            <svg className="animate-spin -ml-1 mr-1 h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Updating...
          </div>
        )}
      </div>
    </div>
  );

  return (
    <SplitPaneLayout
      leftContent={leftPanelContent}
      rightContent={rightPanelContent}
    />
  );
};