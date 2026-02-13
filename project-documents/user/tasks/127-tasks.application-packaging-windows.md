---
slice: application-packaging-windows
project: context-forge-pro
phase: tasks
phaseName: tasks
guideRole: primary
audience: [human, ai]
description: Task breakdown for Windows application packaging and distribution
status: deferred
dateCreated: 20260131
dateUpdated: 20260207
dependencies: [125-application-packaging]
lldReference: 127-slice.application-packaging-windows.md
projectState: deferred
---

# Tasks: Application Packaging (Windows)

**Status:** DEFERRED - Focus on macOS distribution first (slice 125).

## Context Summary

Package Context Forge Pro as NSIS installer for Windows 10/11. Start with unsigned builds, add Authenticode signing when certificate acquired.

**Target State:** Professional Windows installer with code signing.

**Key Technologies:** electron-builder, NSIS

## Phase 1: Unsigned Windows Build

### Task 1.1: Configure Windows Build
**Effort:** 2/5

- [ ] **Update package.json for Windows**
  - Add NSIS target for x64
  - Configure installer options
  - **Success:** Windows build configuration ready

- [ ] **Test unsigned build**
  - Build NSIS installer
  - Test installation on Windows VM
  - Document SmartScreen warnings
  - **Success:** Installer works despite security warnings

## Phase 2: Code Signing (Future)

### Task 2.1: Certificate Setup
**Effort:** 3/5

- [ ] **Acquire code signing certificate**
  - Purchase Authenticode certificate (~$200-400/year)
  - Install certificate
  - **Success:** Certificate ready for signing

- [ ] **Configure signing**
  - Configure electron-builder for Authenticode
  - Test signed builds
  - **Success:** Signed installer passes SmartScreen

## Phase 3: Build Scripts and Documentation

### Task 3.1: Package Scripts
**Effort:** 1/5

- [ ] **Add package:win script**
  - Create npm script for Windows builds
  - Add verification steps
  - **Success:** Consistent Windows build process

### Task 3.2: Documentation
**Effort:** 1/5

- [ ] **Document installation**
  - Installation steps
  - SmartScreen bypass for unsigned builds
  - **Success:** Clear installation docs

## Notes

**Deferred Rationale:**
- macOS-first strategy
- Windows packaging independent of macOS work
- Code signing has ongoing cost

**Related Task Files:**
- 125-tasks.application-packaging.md (primary - macOS)
- 126-tasks.application-packaging-linux.md (deferred)
