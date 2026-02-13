---
item: application-packaging-windows
project: context-forge-pro
type: slice
dependencies: [125-application-packaging]
projectState: deferred
status: deferred
dateCreated: 20260131
dateUpdated: 20260207
---

# Slice Design: Application Packaging (Windows)

## Overview

**User Value:** Users can install and run Context Forge Pro as a native desktop application on Windows 10/11 without requiring development environment setup.

**Business Value:** Extends distribution reach to Windows users with professional NSIS installer experience.

**Technical Scope:** Configure Windows Electron packaging with electron-builder for NSIS installer format. Includes code signing when certificates are available.

**Status:** DEFERRED - Focus on macOS distribution first (slice 125).

## Success Criteria

### Primary Success Criteria
- [ ] **NSIS Installer**: Modern installer UI for Windows 10/11
- [ ] **Unsigned Build**: Working installer despite SmartScreen warnings
- [ ] **Start Menu Integration**: Shortcuts and uninstaller

### Secondary Success Criteria
- [ ] **Code Signing**: Authenticode certificate integration
- [ ] **CI/CD Pipeline**: Automated Windows builds on GitHub Actions

## Technical Architecture

### Windows Packaging Details

- **Format**: NSIS installer with modern UI
- **Architecture**: x64 builds for Windows 10/11
- **Initial Release**: Unsigned builds with documented SmartScreen workaround
- **Future**: Authenticode signing when certificate acquired

## Implementation Plan

### Phase 1: Unsigned Windows Build (Effort: 2/5)

**electron-builder Configuration:**
```json
{
  "build": {
    "win": {
      "target": [
        { "target": "nsis", "arch": ["x64"] }
      ]
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true
    }
  }
}
```

### Phase 2: Code Signing (Future - Effort: 3/5)

**When certificate acquired:**
- Configure electron-builder for Authenticode signing
- Test signed builds pass SmartScreen
- Integrate into CI/CD pipeline

## Installation Flow

```
User Downloads Installer
    ↓
Run NSIS Installer
    ├── Unsigned: Accept SmartScreen warning
    └── Signed (future): Normal installation
    ↓
Install to Program Files
    ↓
Start Menu Shortcuts Created
    ↓
Normal Application Usage
```

## Related Slices

- **125-slice.application-packaging.md**: macOS packaging (primary)
- **126-slice.application-packaging-linux.md**: Linux packaging (deferred)

## Notes

**Deferred Rationale:**
- macOS-first strategy aligns with Anthropic's approach
- Windows packaging can proceed independently once macOS is stable
- Code signing certificate costs ~$200-400/year

**Future Considerations:**
- MSI packages for enterprise deployment
- Portable ZIP version
- Windows ARM support
