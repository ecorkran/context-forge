---
slice: application-packaging-linux
project: context-forge-pro
phase: tasks
phaseName: tasks
guideRole: primary
audience: [human, ai]
description: Task breakdown for Linux application packaging and distribution
status: deferred
dateUpdated: 2026-02-07
dependencies: [125-application-packaging]
lldReference: 126-slice.application-packaging-linux.md
projectState: deferred
---

# Tasks: Application Packaging (Linux)

**Status:** DEFERRED - Focus on macOS distribution first (slice 125).

## Context Summary

Package Context Forge Pro for Linux distributions. Priority: tar.xz → AppImage → deb → rpm. Includes free GPG signing for package authenticity.

**Target State:** Professional Linux packages with GPG signatures for major distributions.

**Key Technologies:** electron-builder, GPG

## Phase 1: Linux Package Targets

### Task 1.1: Configure Linux Build Targets
**Effort:** 2/5

- [ ] **Update package.json for Linux targets**
  - Add tar.xz, AppImage, deb, rpm targets
  - Set category to "Development"
  - Configure desktop entry specifications
  - **Success:** Linux build targets configured

- [ ] **Test Linux packaging**
  - Build all Linux formats
  - Verify each package type installs correctly
  - **Success:** All Linux packages build and install

## Phase 2: GPG Signing

### Task 2.1: GPG Key Setup
**Effort:** 1/5

- [ ] **Generate GPG key**
  - Create key pair for Context Forge Pro releases
  - Set appropriate expiration (2-4 years)
  - Generate revocation certificate
  - **Success:** GPG key pair created

- [ ] **Publish public key**
  - Upload to keys.openpgp.org
  - Upload to keyserver.ubuntu.com
  - Document fingerprint
  - **Success:** Public key available for verification

### Task 2.2: Configure Package Signing
**Effort:** 1/5

- [ ] **Integrate GPG signing**
  - Configure electron-builder for GPG signing
  - Test signature verification
  - **Success:** Linux packages are signed

## Phase 3: Build Scripts and Documentation

### Task 3.1: Package Scripts
**Effort:** 1/5

- [ ] **Add package:linux script**
  - Create npm script for Linux builds
  - Add verification steps
  - **Success:** Consistent Linux build process

### Task 3.2: Documentation
**Effort:** 1/5

- [ ] **Document installation**
  - AppImage usage instructions
  - deb/rpm installation commands
  - Signature verification steps
  - **Success:** Clear installation docs for all formats

## Notes

**Deferred Rationale:**
- macOS-first strategy
- Linux packaging independent of macOS work
- Can proceed once macOS builds stable

**Related Task Files:**
- 125-tasks.application-packaging.md (primary - macOS)
- 127-tasks.application-packaging-windows.md (deferred)
