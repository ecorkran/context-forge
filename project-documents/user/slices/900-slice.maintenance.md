---
layer: project
phase: maintenance
phaseName: maintenance
guideRole: primary
audience: [human, ai]
description: Maintenance slice for Context Forge ongoing issues and improvements
status: in-progress
dateCreated: 20250916
dateUpdated: 20260307
---

# Maintenance Slice: Context Forge

## Overview

This slice addresses ongoing maintenance tasks, bug fixes, and improvements across the Context Forge monorepo.

## Issues

### 1. TIPropertyValueIsValid macOS Error

**Priority:** P2 (Non-critical system warning)
**Status:** Postponed Indefinitely

**Description:**
Electron app shows macOS-specific console warnings related to text input handling (`_TIPropertyValueIsValid called with 16 on nil context!`). Cosmetic only — no functional impact. Common across Electron apps on macOS when non-English input methods are active.

### 2. Cross-Slice Integration Test Fixtures

**Priority:** P3 (Quality)
**Status:** Open

**Description:**
Most integration testing from the original (168) slice plan entry has been delivered incrementally — unit tests in each slice, MCP integration tests (25 tests in `mcpIntegration.test.ts`), READMEs updated, version bumps done. What remains is cross-slice scenario coverage: fixture projects representing realistic multi-state scenarios (mid-plan project, project with inconsistencies, project with no methodology artifacts). These would exercise interactions like workflow_status reflecting introspection results or consistency findings aligning with workflow_next recommendations.

**Location:** `packages/mcp-server/tests/integration/` and `packages/core/tests/fixtures/`

### 3. Guide Install Should Create User Directories

**Priority:** P2 (Developer experience)
**Status:** Open

**Description:**
`cf guides install` (and `guide_install` MCP tool) sets up `project-documents/ai-project-guide/` but does not create the user artifact directories. After installing guides, users must manually create these before they can start working.

**Expected:** Guide install should also create:
- `project-documents/user/`
- `project-documents/user/architecture/`
- `project-documents/user/slices/`
- `project-documents/user/tasks/`
- `project-documents/user/project-guides/`

**Location:** `packages/core/src/guides/GuideManager.ts` — add `mkdirSync` calls after successful `strategy.install()` in the `install()` method.
