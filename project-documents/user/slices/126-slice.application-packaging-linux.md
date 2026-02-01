---
item: application-packaging-linux
project: context-forge-pro
type: slice
dependencies: [125-application-packaging]
projectState: deferred
status: deferred
lastUpdated: 2026-01-18
---

# Slice Design: Application Packaging (Linux)

## Overview

**User Value:** Users can install and run Context Forge Pro as a native desktop application on Linux distributions without requiring development environment setup.

**Business Value:** Extends distribution reach to Linux users with professional packaging for major distributions.

**Technical Scope:** Configure Linux Electron packaging with electron-builder for AppImage, deb, rpm, and tar.xz formats. Includes free GPG signing for package authenticity.

**Status:** DEFERRED - Focus on macOS distribution first (slice 125).

## Success Criteria

### Primary Success Criteria
- [ ] **AppImage Distribution**: Portable format requiring no installation
- [ ] **Debian/Ubuntu**: .deb packages for apt-based distributions
- [ ] **Red Hat/Fedora**: .rpm packages for yum/dnf-based distributions
- [ ] **Archive**: .tar.xz for manual installation
- [ ] **GPG Signing**: All packages signed for verification

### Secondary Success Criteria
- [ ] **CI/CD Pipeline**: Automated Linux builds on GitHub Actions
- [ ] **Desktop Integration**: Proper .desktop files and MIME types

## Technical Architecture

### Linux Packaging Details

- **AppImage**: Portable, universal format requiring no installation
- **Debian/Ubuntu**: .deb packages for apt-based distributions
- **Red Hat/Fedora**: .rpm packages for yum/dnf-based distributions
- **Archive**: .tar.xz for manual installation and other distributions
- **No Snap**: Explicitly avoiding snap packages per project requirements

### GPG Signing (Free)

- Generate GPG key pair for package signing
- Publish public key to keyservers (keys.openpgp.org, keyserver.ubuntu.com)
- Configure electron-builder for automatic GPG signing
- Document verification process for users

## Implementation Plan

### Phase 1: Linux Package Targets (Effort: 2/5)

**electron-builder Configuration:**
```json
{
  "build": {
    "linux": {
      "target": [
        { "target": "tar.xz", "arch": ["x64"] },
        { "target": "AppImage", "arch": ["x64"] },
        { "target": "deb", "arch": ["x64"] },
        { "target": "rpm", "arch": ["x64"] }
      ],
      "category": "Development"
    }
  }
}
```

### Phase 2: GPG Key Setup (Effort: 1/5)

- Generate dedicated GPG key for Context Forge Pro releases
- Publish to major keyservers
- Integrate signing into build process
- Document public key fingerprint

### Phase 3: Build Scripts and CI/CD (Effort: 2/5)

- Add `package:linux` script
- Configure GitHub Actions Linux runner
- Artifact collection and release upload

## Installation Flow

```
User Downloads Package
    ↓
Platform-Specific Installation
    ├── AppImage: chmod +x, direct execution
    ├── deb: dpkg -i package.deb
    ├── rpm: rpm -i package.rpm
    └── tar.xz: extract, run binary
    ↓
Optional: Verify GPG signature
    ↓
Normal Application Usage
```

## Related Slices

- **125-slice.application-packaging.md**: macOS packaging (primary)
- **127-slice.application-packaging.windows.md**: Windows packaging (deferred)

## Notes

**Deferred Rationale:**
- macOS-first strategy aligns with Anthropic's approach
- Linux packaging can proceed independently once macOS is stable
- GPG signing is free and adds immediate value when implemented

**Future Considerations:**
- ARM64 Linux support
- Package manager distribution (AUR, PPA, etc.)
