---
item: application-packaging
project: context-forge-pro
type: slice
dependencies: [all-core-features]
projectState: MVP complete, ready for distribution
status: not-started
lastUpdated: 2026-02-07
---

# Slice Design: Application Packaging (macOS)

## Overview

**User Value:** Users can install and run Context Forge Pro as a native desktop application on macOS without requiring development environment setup.

**Business Value:** Enables distribution and adoption of Context Forge Pro for macOS users, providing professional installation experience. Linux and Windows support planned as separate slices.

**Technical Scope:** Configure macOS Electron packaging with electron-builder, starting with unsigned builds and adding code signing when organizational certificates are available.

## Success Criteria

### Primary Success Criteria
- [ ] **macOS Distribution**: DMG installer that mounts and installs correctly
- [ ] **Unsigned Build**: Working DMG that installs despite Gatekeeper warnings
- [ ] **Professional Branding**: Custom icons and DMG background
- [ ] **Build Scripts**: Reliable local build process for macOS

### Secondary Success Criteria (Future)
- [ ] **Code Signing**: Apple Developer certificate integration
- [ ] **Notarization**: Automated notarization for Gatekeeper approval
- [ ] **CI/CD Pipeline**: Automated macOS builds on GitHub Actions
- [ ] **Auto-Updates**: Update mechanism for seamless version upgrades

## Technical Architecture

### Build System

**Current State:**
- electron-builder configured with basic macOS (dmg) target
- Application runs well via `pnpm dev`

**Target Architecture:**
```
Build Pipeline (macOS)
├── Source Build (electron-vite)
├── Platform Packaging (electron-builder)
│   └── macOS: DMG (unsigned initially)
├── Asset Management (icons, DMG background)
└── Local Release Builds
```

### macOS Packaging Details

- **Format**: DMG disk image with drag-to-Applications workflow
- **Architecture**: Universal binary (x64 + arm64) for Intel and Apple Silicon
- **Initial Release**: Unsigned builds with documented Gatekeeper workaround
- **Future**: Code signing + notarization when Apple Developer Program enrolled

## Implementation Plan

### Phase 1: Unsigned macOS Build (Effort: 2/5)

**electron-builder Configuration:**
- Verify/update `package.json` build section for macOS targets
- Configure DMG options (window size, background, icon positions)
- Set proper app metadata (productName, description, category)
- Build unsigned DMG and test installation

**Expected Configuration:**
```json
{
  "build": {
    "appId": "com.contextforge.pro",
    "productName": "Context Forge Pro",
    "mac": {
      "target": [
        { "target": "dmg", "arch": ["x64", "arm64"] }
      ],
      "category": "public.app-category.developer-tools"
    },
    "dmg": {
      "title": "Context Forge Pro",
      "icon": "build/icon.icns",
      "background": "build/dmg-background.png",
      "contents": [
        { "x": 130, "y": 220 },
        { "x": 410, "y": 220, "type": "link", "path": "/Applications" }
      ]
    }
  }
}
```

### Phase 2: Asset and Branding (Effort: 2/5)

**Icon Creation:**
- Design/refine application icon (512x512 PNG minimum)
- Generate macOS icns file with multiple resolutions (16,32,64,128,256,512px)
- Create DMG background image for drag-to-Applications interface

**Metadata:**
- Application descriptions and categories
- Proper versioning and build information
- Copyright and license information

### Phase 3: Build Scripts (Effort: 1/5)

**Package Scripts:**
- Add `package:mac` script for macOS builds
- Add build verification (check output exists, basic size validation)
- Add checksum generation for release verification

### Phase 4: Code Signing (Future - Effort: 3/5)

**When Apple Developer Program enrolled:**
- Configure electron-builder for Apple certificate signing
- Set up notarization workflow
- Test signed builds install without Gatekeeper warnings

### Phase 5: CI/CD (Future - Effort: 3/5)

**GitHub Actions:**
- macOS runner for automated builds
- Secure certificate storage in GitHub secrets
- Release artifact upload

## Installation Flow

```
User Downloads DMG
    ↓
Mount DMG (double-click)
    ↓
Drag to Applications folder
    ↓
First Launch
    ├── Unsigned: Right-click → Open → Accept warning
    └── Signed (future): Normal launch
    ↓
Normal Application Usage
```

## Risk Mitigation

### Technical Risks
- **Gatekeeper Warnings**: Document workaround for unsigned builds
- **Universal Binary Size**: Monitor and optimize if needed
- **electron-builder Updates**: Pin versions for reproducible builds

### Distribution Risks
- **User Friction**: Clear documentation for bypassing Gatekeeper
- **Future Signing**: Plan certificate acquisition timeline

## Quality Assurance

### Testing Requirements
- **Installation Testing**: Test on clean macOS systems (Intel + Apple Silicon)
- **Launch Testing**: Verify app launches and functions correctly
- **Update Testing**: Manual update process verification

### Success Metrics
- **Package Size**: < 200MB for DMG
- **Installation Time**: < 30 seconds
- **First Launch Time**: < 3 seconds from icon click to usable interface

## Related Slices

- **126-slice.application-packaging.linux.md**: Linux packaging (deferred)
- **127-slice.application-packaging.windows.md**: Windows packaging (deferred)

## Notes

**Technology Choices:**
- **electron-builder** for comprehensive macOS support
- **Universal binary** to support both Intel and Apple Silicon Macs

**Distribution Strategy:**
- **Primary**: GitHub Releases for direct distribution
- **Initial**: Unsigned builds with clear installation instructions
- **Future**: Signed builds when certificates available

**Code Signing Economics:**
- **Apple Developer Program**: $99/year for macOS distribution
- Deferred until organizational setup complete
