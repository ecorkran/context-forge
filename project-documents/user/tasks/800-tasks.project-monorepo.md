---
feature: project-monorepo
project: context-builder
lld: user/features/751-feature.project-monorepo.md
dependencies: []
projectState: Monorepo support currently uses dual global+per-project settings causing workflow friction
lastUpdated: 2025-09-25
status: complete
---

## Context Summary
- Working on project-monorepo feature
- Converting from global+per-project to per-project-only monorepo support
- Current project state: Global AppSettings.monorepoModeEnabled + ProjectData.isMonorepo dual dependency
- This feature eliminates global dependency and uses only ProjectData.isMonorepo
- What this feature delivers: Per-project monorepo control with no global setting
- Next planned: UI/prompt consistency improvements (Issues #6, #7)

## Task 1: Update UI Controls in ProjectConfigForm

### 1.1 Replace Global Setting Check with Project Setting
- [x] **Locate current monorepo UI conditional logic**
  - Find `{isMonorepoModeEnabled && (` condition in ProjectConfigForm.tsx
  - Identify monorepo controls section (Repository structure)
  - Document current line numbers and conditional structure
  - **Success:** Current conditional logic identified and documented

- [x] **Update conditional logic to use project setting**
  - Replace `{isMonorepoModeEnabled && (` with `{formData.isMonorepo && (`
  - Remove `useAppSettings` import from ProjectConfigForm.tsx
  - Remove `isMonorepoModeEnabled` destructuring from useAppSettings hook
  - **Success:** Monorepo controls appear only when current project has `isMonorepo: true`

- [x] **Verify UI behavior**
  - Build project successfully with no TypeScript errors
  - Test that monorepo controls show/hide based on project `isMonorepo` checkbox
  - Test project switching shows correct monorepo UI state per project
  - **Success:** UI controls respond only to per-project setting

## Task 2: Update Prompt Generation in ContextTemplateEngine

### 2.1 Remove Global Setting Dependency from Monorepo Sections
- [x] **Update monorepo section conditional logic**
  - Change `data.isMonorepo && appSettingsService.isMonorepoModeEnabled()` to `data.isMonorepo`
  - Update both section creation and condition function
  - Remove appSettingsService import from ContextTemplateEngine.ts
  - **Success:** Monorepo sections generate based only on project `isMonorepo` field

- [x] **Update filterMonorepoContent method**
  - Change filterMonorepoContent condition to check only project setting
  - Remove appSettingsService dependency from filtering logic
  - Update method to operate on project data only
  - **Success:** Prompt filtering uses only project setting

- [x] **Verify prompt generation**
  - Build project successfully with no TypeScript errors
  - Test that prompts include monorepo content when project `isMonorepo: true`
  - Test that prompts exclude monorepo content when project `isMonorepo: false`
  - **Success:** Prompt generation responds only to per-project setting

## Task 3: Convert Settings Dialog to Per-Project

### 3.1 Update SettingsDialog Component
- [x] **Replace global toggle with project toggle**
  - Change SettingsDialog to receive current project data as props
  - Replace `monorepoModeEnabled` toggle with `isMonorepo` toggle
  - Update toggle to modify project setting instead of global setting
  - Update dialog title and help text to reflect per-project behavior
  - **Success:** Settings dialog controls project `isMonorepo` setting

- [x] **Remove global settings dependencies**
  - Remove `useAppSettings` import from SettingsDialog
  - Remove global settings state management
  - Remove global settings clearing logic
  - Update component props interface to receive project data
  - **Success:** SettingsDialog operates independently of global settings

### 3.2 Update SettingsButton Integration
- [x] **Update SettingsButton to pass project data**
  - Modify SettingsButton to receive current project data
  - Add project update handler to SettingsButton props
  - Pass project data and update handler to SettingsDialog
  - Remove global settings integration from SettingsButton
  - **Success:** Settings button operates on current project data

- [x] **Update parent component integration**
  - Update ContextBuilderApp to pass project data to SettingsButton
  - Add project update handler that updates current project
  - Ensure project updates trigger form refresh and output preview update
  - **Success:** Gear icon toggles monorepo setting for current project

## Task 4: Clean Up Global Settings Infrastructure

### 4.1 Remove Global Settings Service Components
- [x] **Remove AppSettingsService and types**
  - Delete `src/services/settings/AppSettingsService.ts`
  - Delete `src/services/settings/types/AppSettings.ts`
  - Remove services/settings directory if empty
  - **Success:** Global settings service files removed

- [x] **Remove useAppSettings hook**
  - Delete `src/hooks/useAppSettings.ts`
  - Remove any remaining imports of useAppSettings from other files
  - **Success:** Global settings hook removed

- [x] **Remove remaining global settings references**
  - Search codebase for any remaining `isMonorepoModeEnabled` references
  - Remove any remaining `appSettingsService` imports
  - Clean up any unused imports or dependencies
  - **Success:** No global settings references remain in codebase

### 4.2 Final Build and Integration Test
- [x] **Verify complete functionality**
  - Build project successfully with no TypeScript errors or warnings
  - Test project creation with monorepo setting
  - Test project switching between monorepo and non-monorepo projects
  - Test that UI shows/hides monorepo controls based on current project
  - Test that gear icon opens settings for current project only
  - Test that output preview updates when monorepo setting changes
  - **Success:** All functionality works with per-project settings only