---
slice: application-packaging
project: context-forge-pro
phase: tasks
phaseName: tasks
guideRole: primary
audience: [human, ai]
description: Task breakdown for macOS application packaging and distribution
status: not-started
dateUpdated: 2026-01-18
dependencies: [all-core-features]
lldReference: 125-slice.application-packaging.md
projectState: MVP complete, ready for distribution
---

# Tasks: Application Packaging (macOS)

## Context Summary

Package Context Forge Pro as a distributable macOS DMG installer. Start with unsigned builds to establish the packaging process, then add code signing when Apple Developer Program certificates are available.

**Current State:** Application works in development via `pnpm dev`, basic electron-builder configuration exists.

**Target State:** Professional macOS DMG installer with custom branding that installs and launches correctly.

**Key Technologies:** electron-builder, electron-vite

## Phase 1: Verify Current Build Configuration

### Task 1.1: Audit Existing electron-builder Setup
**Effort:** 1/5

- [ ] **Review current package.json build configuration**
  - Examine existing `build` section in package.json
  - Document current macOS targets and settings
  - Identify any existing icon or asset references
  - **Success:** Clear understanding of current build configuration

- [ ] **Test existing build command**
  - Run current package/build command (likely `pnpm build` or similar)
  - Document what outputs are produced
  - Note any errors or warnings
  - **Success:** Know current build state and any existing issues

### Task 1.2: Verify Development Build Works
**Effort:** 1/5

- [ ] **Confirm application runs correctly**
  - Run `pnpm dev` and verify all features work
  - Test on both Intel and Apple Silicon if available
  - Document any platform-specific issues
  - **Success:** Application confirmed working in development mode

## Phase 2: Configure macOS Packaging

### Task 2.1: Update electron-builder Configuration
**Effort:** 2/5

- [ ] **Configure macOS build targets**
  - Set `mac.target` to DMG with universal architecture (x64 + arm64)
  - Configure `mac.category` as "public.app-category.developer-tools"
  - Set proper `appId` (com.contextforge.pro)
  - Update `productName` to "Context Forge Pro"
  - **Success:** package.json contains correct macOS build configuration

- [ ] **Configure DMG settings**
  - Set DMG window size and title
  - Configure contents array for app icon and Applications link positions
  - Set background image path (placeholder initially)
  - **Success:** DMG configuration ready for build testing

### Task 2.2: Test Unsigned DMG Build
**Effort:** 2/5

- [ ] **Build unsigned macOS DMG**
  - Run macOS package build command
  - Verify DMG file is created in output directory
  - Check file size is reasonable (< 200MB)
  - **Success:** DMG file exists and has reasonable size

- [ ] **Test DMG installation**
  - Mount DMG by double-clicking
  - Verify drag-to-Applications interface appears
  - Drag app to Applications folder
  - **Success:** DMG mounts and shows proper installation interface

- [ ] **Test application launch**
  - Launch app from Applications (right-click → Open for unsigned)
  - Accept Gatekeeper warning
  - Verify application starts and functions correctly
  - Test basic features (create project, generate context, copy)
  - **Success:** Installed app works correctly despite security warnings

## Phase 3: Asset and Branding

### Task 3.1: Application Icon
**Effort:** 2/5

- [ ] **Create or source base icon**
  - Design or obtain 512x512 PNG icon
  - Ensure icon is visually distinct and professional
  - Save source file for future modifications
  - **Success:** High-resolution source icon available

- [ ] **Generate macOS icns file**
  - Create iconset with all required sizes (16,32,64,128,256,512px + @2x variants)
  - Convert to .icns format using iconutil or similar
  - Place in `build/` or `resources/` directory
  - **Success:** icon.icns file contains all required resolutions

- [ ] **Configure icon in build**
  - Update package.json to reference icon.icns
  - Rebuild DMG and verify icon appears
  - Check icon in Finder, Dock, and app switcher
  - **Success:** Custom icon appears throughout macOS interface

### Task 3.2: DMG Background
**Effort:** 1/5

- [ ] **Create DMG background image**
  - Design background with appropriate dimensions (typically 540x380 or similar)
  - Include subtle branding or instructions if desired
  - Save as PNG in build directory
  - **Success:** DMG background image created

- [ ] **Configure DMG background in build**
  - Update dmg.background path in package.json
  - Rebuild DMG and verify background appears
  - Adjust icon positions if needed to match background
  - **Success:** DMG opens with professional branded appearance

### Task 3.3: Application Metadata
**Effort:** 1/5

- [ ] **Update application metadata**
  - Set proper version number in package.json
  - Add description and author fields
  - Configure copyright notice
  - **Success:** App shows correct metadata in Finder "Get Info"

## Phase 4: Build Scripts

### Task 4.1: Package Scripts
**Effort:** 1/5

- [ ] **Add package:mac script**
  - Add npm script for macOS-only builds
  - Ensure script builds production code first, then packages
  - Test script produces expected output
  - **Success:** `pnpm package:mac` produces DMG consistently

- [ ] **Add build verification**
  - Create simple verification that checks DMG exists after build
  - Add file size check (warn if > 200MB)
  - Generate SHA256 checksum for release verification
  - **Success:** Build process includes basic verification

### Task 4.2: Output Organization
**Effort:** 1/5

- [ ] **Configure output directory**
  - Ensure DMG outputs to consistent location (dist/ or release/)
  - Add .gitignore entries for build outputs
  - Document output file naming convention
  - **Success:** Build outputs are organized and gitignored

## Phase 5: Documentation

### Task 5.1: Installation Documentation
**Effort:** 1/5

- [ ] **Document installation process**
  - Write clear steps for mounting DMG
  - Document drag-to-Applications process
  - Explain Gatekeeper warning and how to bypass (right-click → Open)
  - Include screenshots if helpful
  - **Success:** Users can follow docs to install unsigned build

### Task 5.2: Build Documentation
**Effort:** 1/5

- [ ] **Document build process for developers**
  - List prerequisites (Node.js version, pnpm)
  - Document build commands
  - Note any platform-specific requirements
  - **Success:** New developers can build from source

## Phase 6: Code Signing (Future)

### Task 6.1: Apple Developer Setup
**Effort:** 2/5
**Status:** DEFERRED until organizational certificates available

- [ ] **Enroll in Apple Developer Program**
  - Complete enrollment (requires DUNS for organization)
  - Generate Developer ID Application certificate
  - Download and install certificate in Keychain

- [ ] **Configure signing in electron-builder**
  - Set mac.identity to certificate name
  - Configure hardened runtime if needed
  - Test signed build locally

### Task 6.2: Notarization
**Effort:** 2/5
**Status:** DEFERRED until code signing complete

- [ ] **Set up notarization**
  - Create app-specific password for notarization
  - Configure notarize.js or electron-builder notarization
  - Test notarization workflow

- [ ] **Verify signed and notarized build**
  - Build signed DMG
  - Submit for notarization
  - Test installation without Gatekeeper warnings

## Phase 7: CI/CD (Future)

### Task 7.1: GitHub Actions
**Effort:** 2/5
**Status:** DEFERRED until local builds stable

- [ ] **Create macOS build workflow**
  - Set up workflow with macos-latest runner
  - Configure Node.js and pnpm
  - Add caching for dependencies

- [ ] **Configure artifact upload**
  - Upload DMG as build artifact
  - Configure release asset upload on tags

## Notes

**Implementation Priority:**
1. Phase 1-2: Immediate (establish working unsigned build)
2. Phase 3: Quick follow-up (professional appearance)
3. Phase 4-5: Before first release (scripts and docs)
4. Phase 6-7: Future (when certificates available)

**Dependencies:**
- Application must be stable in development mode
- electron-builder and electron-vite configured

**Success Metrics:**
- DMG builds without errors
- Installed app launches and functions correctly
- Professional icon and branding
- Clear installation documentation

**Related Task Files:**
- 126-tasks.application-packaging-linux.md (deferred)
- 127-tasks.application-packaging-windows.md (deferred)
