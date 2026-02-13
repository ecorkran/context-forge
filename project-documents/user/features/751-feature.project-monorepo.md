---
layer: project
phase: feature
phaseName: project-monorepo
guideRole: primary
audience: [human, ai]
description: Convert monorepo support from global+per-project to per-project only
status: not-started
dateUpdated: 2025-09-25
---

# Feature: Per-Project Monorepo Support

## Overview

Remove global monorepo setting. Use only per-project `isMonorepo` field to control monorepo UI and prompt generation. Gear icon accesses project-specific monorepo setting, not global setting.

## Current State

- Global `AppSettings.monorepoModeEnabled` controls UI visibility
- Per-project `ProjectData.isMonorepo` controls project behavior
- Both must be true for monorepo features to work
- Gear icon opens global settings dialog

## Target State

- Only `ProjectData.isMonorepo` controls everything
- Gear icon opens project-specific monorepo toggle
- UI shows monorepo controls when current project has `isMonorepo: true`
- Prompts generate monorepo content when `data.isMonorepo` is true
- No global setting dependency

## Technical Changes

1. **UI Controls**: Change condition from `isMonorepoModeEnabled` to `formData.isMonorepo`
2. **Prompt Generation**: Remove `appSettingsService.isMonorepoModeEnabled()` checks
3. **Settings Dialog**: Replace global toggle with per-project toggle
4. **Remove**: Global settings service, AppSettings interface, useAppSettings hook

## Success Criteria

- Monorepo controls appear only when current project `isMonorepo: true`
- Project switching automatically shows/hides monorepo controls
- Output preview updates based on states of monorepo controls
- Prompts include monorepo content based only on project setting
- Gear icon toggles monorepo setting for current project
- No global setting remains