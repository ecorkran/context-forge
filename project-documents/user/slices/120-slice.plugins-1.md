---
item: plugins-1
project: context-builder
type: slice
github: 
dependencies: [foundation, basic-context-generation, project-configuration]
projectState: Core features complete, multi-project support and maintenance work done
status: postponed
dateCreated: 20250923
dateUpdated: 20250916
---

# 120-slice.plugins-1.md

## HLD: Plugin System Architecture - Phase 1

### Overview
Implement a hybrid feature flag and plugin architecture to enable controlled functionality release for commercial product development while maintaining open-source base functionality.

### Core Architecture Components

#### 1. Feature Control Layer (Clarified)
**Purpose**: Compile-time feature exclusion with optional runtime control in premium builds  
**Implementation**: Mixed compile-time and runtime approach

```typescript
// config/features.ts
// ⚠️ Runtime flags apply only in premium builds for A/B testing and kill switches
// Free builds use compile-time exclusion; premium modules are never imported in free builds
export const RUNTIME_FEATURES = {
  ADVANCED_CONTEXT_GENERATION: process.env.ENABLE_ADVANCED_CONTEXT === 'true',
  TEAM_COLLABORATION: process.env.ENABLE_TEAM_FEATURES === 'true',
  PREMIUM_TEMPLATES: process.env.ENABLE_PREMIUM === 'true'
} as const;

// Compile-time constants (injected by build system)
declare const __PRO__: boolean;
declare const __ENTERPRISE__: boolean;
declare const __TIER__: 'free' | 'pro' | 'enterprise';
```

#### 2. Typed Plugin API (Fixed)
**Purpose**: Type-safe, secure plugin architecture  
**Implementation**: Strict interfaces with compile-time safety

```typescript
// packages/core/src/lib/plugins/api.ts
export interface HookMap {
  contextPipeline?: (ctx: Context) => Promise<Context>;
  templateSources?: () => Promise<TemplateSource[]>;
  fileOperations?: (req: FileRequest) => Promise<FileResponse>;
}

export type SlotId = 
  | 'PROJECT_CONFIG_PANEL'
  | 'CONTEXT_OUTPUT_ACTIONS' 
  | 'TEMPLATE_SELECTOR_EXTRA'
  | 'MAIN_TOOLBAR';

interface PluginEntrypoints {
  main?: MainInit;
  renderer?: RendererInit;
}

export interface Plugin {
  id: string;
  name: string; 
  version: string;
  enabled: boolean;
  priority: 0 | 10 | 20; // community=0, vendor=10, core=20
  entrypoints: PluginEntrypoints;
  requires?: { 
    core: string; 
    plugins?: Record<string, string> 
  };
  permissions?: {
    fs?: { read: string[]; write?: string[] }; // glob whitelists
    net?: { hosts: string[]; methods?: ('GET'|'POST')[] };
    clipboard?: { read?: boolean; write?: boolean };
  };
}

class PluginRegistry {
  private plugins = new Map<string, Plugin>();
  private slots = new Map<SlotId, Plugin[]>();
  
  async register(plugin: Plugin): Promise<void> {
    this.validatePlugin(plugin);
    this.checkCollisions(plugin);
    await this.initializePlugin(plugin);
    this.registerSlots(plugin);
  }
  
  private checkCollisions(plugin: Plugin): void {
    // Priority-based collision resolution
    // On equal priority + conflicting slot: hard fail with diagnostic
    for (const [slotId, existingPlugins] of this.slots) {
      const conflicts = existingPlugins.filter(p => 
        p.priority === plugin.priority && 
        this.hasSlotConflict(p, plugin, slotId)
      );
      
      if (conflicts.length > 0) {
        throw new Error(
          `Plugin collision: ${plugin.id} conflicts with ${conflicts.map(p => p.id).join(', ')} ` +
          `on slot ${slotId} at priority ${plugin.priority}. Use different priorities.`
        );
      }
    }
  }
}
```

#### 3. Activation System
**Purpose**: License and environment-based feature control  
**Implementation**: Tiered activation levels

- **Free Tier**: Core functionality, basic templates
- **Pro Tier**: Advanced context generation, premium templates
- **Enterprise Tier**: Team collaboration, custom plugins

### Integration Points

#### Component Level
```typescript
// components/FeatureGate.tsx
interface FeatureGateProps {
  feature: FeatureKey;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function FeatureGate({ feature, fallback, children }: FeatureGateProps) {
  return FEATURES[feature] ? children : fallback;
}
```

#### Hook Level
```typescript
// hooks/useFeature.ts
export function useFeature(feature: FeatureKey): boolean {
  return FEATURES[feature];
}
```

### Implementation Strategy

#### Phase 1 Scope (This Slice)
- Feature flag infrastructure
- Basic plugin registry interfaces
- Environment-based activation
- Component-level feature gating

#### Future Phases
- **Phase 2**: UI plugin system
- **Phase 3**: Core functionality plugins
- **Phase 4**: Commercial licensing integration

### Dependencies
- Environment configuration system
- TypeScript strict mode compliance
- React component architecture

### Success Criteria
- Feature flags control component rendering
- Plugin registry accepts basic plugin definitions
- Environment variables control feature activation
- No impact on existing functionality when features disabled

## LLD: Technical Design Decisions

### Architecture Overview

**Design Philosophy**: Open core model with private premium repo (`context-builder-x`) enables immediate commercial feature development while maintaining public community benefits.

**Key Design Decisions:**
1. **Repository Separation**: Public core + private premium repo (`context-builder-x`)
2. **Build-time Integration**: Premium plugins pulled from private repo during pro builds only
3. **Plugin Slot Architecture**: Predefined extension points with Electron IPC integration
4. **Electron Process Boundaries**: Premium plugins respect main/renderer process separation
5. **Zero Code Leakage**: Premium features completely absent from free builds

### Core System Components

#### 1. Feature Control Architecture

**Critical Design Constraint**: Electron apps expose all client-side code, making environment-based feature flags ineffective for commercial control.

**Security Boundary**: **Compile-time exclusion is the only protection**. Runtime flags never protect premium code from extraction; they only control UX inside premium builds.

**Revised Design Choice**: Compilation-time feature exclusion with private repository integration
- **Build-time Variants**: Separate builds for Free/Pro/Enterprise with features excluded at compilation
- **Private Repository**: Premium features in `context-builder-x` private repo, conditionally included
- **Compile-time Gates**: `if (__PRO__)` guards ensure premium code never ships in free builds

**Repository & Build Strategy**:
- **context-builder** (public): Core functionality, plugin architecture, free build
- **context-builder-x** (private): Premium plugins and features, conditionally integrated
- **Free Build**: `pnpm build:free` - only public repo code, zero premium imports
- **Premium Build**: `pnpm build:premium` - includes private repo via build-time integration

**Alternative Approaches Considered**:
- **Environment flags**: Rejected - easily bypassed by users
- **Code obfuscation**: Rejected - adds complexity, still reversible
- **Server-side rendering**: Rejected - defeats local-first design philosophy

**Conflict Resolution**: Build variant > License validation > Feature unavailable

#### 2. Plugin System Design with Electron Integration

**Component Slot Strategy**:
```
UI Extension Points (Renderer Process):
├── PROJECT_CONFIG_PANEL (form field additions)
├── CONTEXT_OUTPUT_ACTIONS (export format options) 
├── TEMPLATE_SELECTOR_EXTRA (custom template sources)
└── MAIN_TOOLBAR (global action buttons)

Service Extension Points (Main Process):
├── FILE_SYSTEM_ACCESS (premium file operations)
├── EXTERNAL_INTEGRATIONS (API connections)
├── CONTEXT_PROCESSING (advanced generation logic)
└── LICENSE_VALIDATION (server communication)
```

**Electron Process Architecture**:
- **Main Process Plugins**: File system access, external APIs, background processing
- **Renderer Process Plugins**: UI components, context display enhancements
- **IPC Communication**: Secure message passing between plugin components
- **Security Boundaries**: Plugins cannot bypass Electron security model

**Plugin Discovery & Integration**:
- **Build-time Discovery**: Premium plugins included only in pro builds by depending on the private repository from the premium build configuration
- **Runtime Registration**: Plugin manifest loading with explicit main/renderer entrypoint initialization
- **IPC Setup**: Automatic main/renderer communication channel establishment with permission enforcement
- **Graceful Degradation**: Plugin failures isolated to prevent app crashes

#### 3. Service Layer Architecture

**FeatureService Responsibilities**:
- Feature flag evaluation with caching
- Runtime feature toggle capability
- License tier enforcement
- Audit trail for feature usage

**PluginRegistry Responsibilities**:
- Plugin discovery and registration
- Component slot management
- Dependency resolution
- Lifecycle event coordination

**Design Pattern**: Static service classes with singleton registry
- **Why**: Global state management with predictable access patterns
- **Alternative**: React Context (rejected for performance)

### Data Flow Design

#### Premium Plugin Integration Flow
```
Development:
pnpm install context-builder-x → Workspace Resolution → Build Integration

Build Process:
pnpm build:free → Public code only → Free distribution
pnpm build:premium → Public + Private repos → Premium distribution

Runtime (Premium):
App Start → Plugin Discovery → Main/Renderer Registration → IPC Setup → Feature Available
```

**Build Strategy**: 
- **pnpm Workspaces**: context-builder-x as conditional workspace dependency
- **Conditional Inclusion**: Premium plugins only included in `build:premium` script
- **Process Distribution**: Plugins register with appropriate Electron process
- **IPC Channels**: Automatic secure communication setup between main/renderer plugin components

#### Plugin Integration Flow
```
App Start → Plugin Discovery → Validation → License Check → Registration → Slot Assignment
                                    ↓
Component Render → Slot Query → Plugin Components → Rendering
```

### UI Integration Strategy

#### Component-Level Gating
**FeatureGate Design**: Declarative feature-based conditional rendering
- **Capability**: Multi-feature requirements (AND/OR logic)
- **Fallback Support**: Graceful degradation with custom fallbacks
- **Performance**: Memoized feature evaluation

#### Hook-Based Integration
**useFeature Design**: Reactive feature flag access
- **Reactivity**: Updates when feature flags change
- **Batching**: Multiple feature queries optimized
- **Caching**: Component-level memoization

### Cross-Slice Integration Points

#### Context Generator Enhancement
**Plugin Hook Design**: Pipeline-based context transformation
- **Execution Order**: Plugin priority system
- **Error Handling**: Individual plugin failures don't break pipeline
- **Performance**: Async with timeout protection

#### Project Configuration Extension
**Dynamic Form Fields**: Plugin-contributed configuration options
- **Validation**: Plugin-provided validators
- **Persistence**: Extended project configuration schema
- **UI Consistency**: Unified styling through design system

### Technical Design Decisions

#### Conflict Resolution
**Feature Availability**: Build variant > License validation > Feature unavailable
**Plugin Conflicts**: First-registered wins with warning logging
**Component Slots**: Priority-based ordering with collision detection

#### Security Model
**Commercial Feature Protection**: Compilation-time exclusion prevents bypass attempts
**License Validation**: Server-side verification with offline grace periods
**Plugin Sandboxing**: Signed manifest + permission allowlists now; sandboxed subprocesses later for third-party marketplace
**Permission Enforcement**: Main process validates all plugin operations against declared allowlists with path normalization and traversal prevention

#### Backwards Compatibility
**Graceful Degradation**: All features default to existing behavior
**Configuration Migration**: Automatic upgrade of existing project configs
**API Stability**: Versioned plugin interfaces with deprecation cycle

### Performance Considerations

#### Bundle Size Impact
**Build Variants**: Premium features completely excluded from free builds
**Plugin System**: Lazy loading prevents unused code inclusion
**Tree Shaking**: Dead code elimination removes unused premium components

#### Runtime Performance
**Feature Evaluation**: < 1ms with caching
**Plugin Discovery**: One-time startup cost
**Component Rendering**: Negligible overhead for feature gates

#### Memory Usage
**Plugin Registry**: < 1MB typical usage
**Feature Cache**: < 100KB for all flags
**Component Slots**: Minimal metadata storage

### Error Handling Strategy

#### Plugin Failure Modes
**Initialization Failure**: Log warning, continue without plugin
**Runtime Failure**: Isolate failure, disable problematic plugin
**Dependency Missing**: Skip dependent plugins, log requirements

#### Feature Flag Failures
**Invalid Configuration**: Fall back to safe defaults
**License Validation Error**: Restrict to free tier features
**Network Issues**: Cache last-known state

### Future Extensibility

#### Phase 2 Considerations
**Dynamic Plugin Loading**: File system plugin discovery
**Third-party Integration**: Marketplace-style plugin distribution
**Advanced Licensing**: Server-side validation and feature metering

#### API Evolution Strategy
**Versioned Interfaces**: Semantic versioning for plugin APIs
**Deprecation Policy**: 2-version backward compatibility
**Migration Tools**: Automated plugin upgrade utilities

### Implementation Constraints

#### Platform Limitations
**Electron Security**: No dynamic code execution in renderer
**Cross-platform**: Plugin system must work on macOS/Windows/Linux
**Offline Operation**: No network dependencies for core functionality

#### Development Constraints
**Type Safety**: Full TypeScript coverage for plugin interfaces
**Testing**: Mockable plugin system for unit tests
**Documentation**: Self-documenting plugin API design

### Risk Mitigation

#### Technical Risks
**Plugin Instability**: Sandbox validation and graceful failure handling
**Performance Regression**: Lazy loading and performance monitoring
**Security Vulnerabilities**: Validation-based trust model

#### Business Risks
**Feature Creep**: Clear phase boundaries and scope limitation
**Commercial Conflict**: Open-source core with commercial extensions
**User Confusion**: Clear tier differentiation and feature discovery

## Implementation Roadmap: Vertical Slice

### **Phase 1: Repository Setup & Build Integration**
**Goal**: End-to-end premium plugin integration working

#### **Step 1: Simplified Repository Setup**
- [ ] Create `context-builder-x` private repo as sibling to main repo
- [ ] Add build scripts (`build-free.js`, `build-premium.js`) to main repo
- [ ] Create Vite plugin in private repo for build integration
- [ ] Test that premium build fails gracefully when private repo absent

#### **Step 2: Build System Integration (Fixed)**
- [ ] Add compile-time constants to Vite configs (`__PRO__`, `__TIER__`)
- [ ] Create tree-shakable conditional imports with `if (__PRO__)` 
- [ ] Verify free builds have zero premium code via bundle analysis
- [ ] Test premium builds can access `@manta/context-builder-x` features

#### **Step 3: Typed Plugin API & Secure IPC (Fixed)**
- [ ] Implement typed plugin registry with strict `Plugin` interface
- [ ] Create `SlotId` enum and `HookMap` interface for type safety
- [ ] Build secure IPC command bus with Zod schema validation
- [ ] Add permission system with per-plugin allowlists
- [ ] Enable `contextIsolation` and disable `nodeIntegration`

#### **Step 4: Vertical Slice Validation (Security-First)**
- [ ] Create working premium plugin in `@manta/context-builder-x` that:
  - [ ] Adds typed UI component to `PROJECT_CONFIG_PANEL` slot
  - [ ] Provides main process service with `fs` permission
  - [ ] Uses secure IPC command bus with Zod validation
  - [ ] Only imports in premium builds via `if (__PRO__)` guards
- [ ] Bundle analysis: Verify zero premium code in free build
- [ ] Security audit: Confirm IPC isolation and permission enforcement

### **Technical Implementation Details**

#### **Simplified Repository Structure** (No NPM Packages):
```
context-builder/ (public repo)
├── src/                        # Core application code
├── scripts/
│   ├── build-free.js          # Free build script
│   └── build-premium.js       # Premium build script (checks for private repo)
├── package.json               # Core dependencies only
└── vite.config.ts             # Build variant selection

context-builder-x/ (private repo - sibling directory)
├── plugins/
│   └── example-premium/
│       ├── manifest.ts         # Typed plugin metadata
│       ├── main/              # Main process components
│       ├── renderer/          # Renderer process components
│       └── ipc/              # Typed IPC schemas
├── build-integration/
│   └── vite-plugin.js         # Vite plugin for integration
└── index.ts                   # Plugin exports
```

**Build Integration**:
```javascript
// scripts/build-premium.js
const fs = require('fs');
const path = require('path');

const privateRepoPath = '../context-builder-x';
if (!fs.existsSync(privateRepoPath)) {
  console.error('Premium build requires context-builder-x repo at ../context-builder-x');
  process.exit(1);
}

// Set environment and run build
process.env.BUILD_VARIANT = 'premium';
process.env.PRIVATE_REPO_PATH = privateRepoPath;
// Run vite build with premium config
```

#### **Fixed Build Integration**:
```typescript
// apps/free/vite.config.ts
export default defineConfig({
  define: {
    __TIER__: JSON.stringify('free'),
    __PRO__: false,
    __ENTERPRISE__: false
  }
});

// apps/premium/vite.config.ts  
export default defineConfig({
  define: {
    __TIER__: JSON.stringify('premium'),
    __PRO__: true,
    __ENTERPRISE__: false
  }
});

// Conditional imports (tree-shakable)
if (__PRO__) {
  const { PremiumPlugins } = await import('@manta/context-builder-x');
  await registerPlugins(PremiumPlugins);
}
```

#### **Secure IPC Command Bus (Fixed)**:
```typescript
// packages/core/src/lib/ipc/channels.ts
import { z } from 'zod';

export const Channels = {
  READ_FILE: 'plugin/fs/readFile',
  WRITE_FILE: 'plugin/fs/writeFile',
  LIST_TEMPLATES: 'plugin/templates/list'
} as const;

export const Schemas = {
  [Channels.READ_FILE]: {
    request: z.object({ path: z.string(), encoding: z.string().optional() }),
    response: z.object({ data: z.string(), error: z.string().optional() })
  },
  [Channels.WRITE_FILE]: {
    request: z.object({ path: z.string(), data: z.string() }),
    response: z.object({ success: z.boolean(), error: z.string().optional() })
  }
};

// preload.ts
contextBridge.exposeInMainWorld('pluginBus', {
  send: async <T extends keyof typeof Channels>(
    channel: T, 
    payload: z.infer<typeof Schemas[T]['request']>
  ): Promise<z.infer<typeof Schemas[T]['response']>> => {
    // Validate request with zod
    const validated = Schemas[channel].request.parse(payload);
    const result = await ipcRenderer.invoke(channel, validated);
    // Validate response with zod
    return Schemas[channel].response.parse(result);
  }
});

// main.ts - permission enforcement
ipcMain.handle(Channels.READ_FILE, async (event, request) => {
  const plugin = getPluginForRenderer(event.sender);
  if (!plugin.permissions?.includes('fs')) {
    throw new Error('Plugin lacks filesystem permission');
  }
  // ... safe file operation
});
```

**Security Model**:
- **Context Isolation**: `contextIsolation: true`, `nodeIntegration: false`
- **CSP Headers**: Strict Content Security Policy
- **Permission System**: Per-plugin allowlists enforced in main process
- **Schema Validation**: All IPC messages validated with Zod
- **Channel Namespacing**: Plugin-specific channel prefixes prevent collisions

### **Success Criteria for Vertical Slice**:
1. **Repository Separation**: Premium repo exists and integrates via pnpm workspaces
2. **Build Isolation**: Free builds contain zero premium code (verified by bundle analysis)
3. **Plugin Functionality**: Premium plugin can access file system and render UI
4. **Electron Compliance**: Plugin respects main/renderer process boundaries
5. **IPC Communication**: Plugin components communicate securely across processes
6. **Development Workflow**: `pnpm dev:premium` enables live development with premium features

## Critical Security Fixes Applied

**Based on colleague feedback, the following "ship-stopper" issues were addressed:**

### ✅ **Fixed: Dynamic package.json Workspace Issue**
- **Problem**: `"workspaces": process.env.BUILD_PREMIUM ? [...]` - env vars don't evaluate in JSON
- **Solution**: Separate static app manifests (`apps/free/package.json` vs `apps/premium/package.json`)

### ✅ **Fixed: Runtime Feature Flags Bypass Tree-Shaking**
- **Problem**: `process.env.ENABLE_*` at runtime prevents dead code elimination
- **Solution**: Compile-time constants via Vite `define: { __PRO__: true }` for guaranteed tree-shaking

### ✅ **Fixed: Loose Plugin API Security Holes**
- **Problem**: `hooks?: Record<string, Function>` provides no type safety or validation
- **Solution**: Strict typed interfaces with `SlotId`, `HookMap`, and permission validation

### ✅ **Fixed: Insecure IPC Communication**
- **Problem**: Default `ipcRenderer.on(...)` vulnerable to injection attacks
- **Solution**: Schema-validated command bus with Zod, per-plugin permission enforcement

### ✅ **Fixed: Code Leakage Risk in Free Builds**
- **Problem**: Runtime toggles could re-introduce premium code paths
- **Solution**: Guaranteed compile-time exclusion via monorepo + private npm package

**Result**: Production-ready architecture that actually prevents premium feature bypass and maintains security isolation.

**Implementation Priority:**
1. Monorepo setup with private npm package (enables secure distribution)
2. Typed plugin API with secure IPC (prevents security vulnerabilities)
3. Compile-time feature exclusion (guarantees code isolation)
4. Vertical slice validation with bundle analysis (proves security works)

## Phase 2 Enhancements (High Value, Low Effort)

### ✅ **Bundle Guardrails in CI**
**Value**: Critical safety net to catch accidental premium code leakage  
**Effort**: Low - simple CI script additions

```yaml
# .github/workflows/build.yml
- name: Validate Free Build Security
  run: |
    pnpm build:free
    
    # Check for premium package references
    if grep -r "@manta/context-builder-x" dist/; then
      echo "❌ Premium package found in free build!"
      exit 1
    fi
    
    # Check for compile-time constants
    if grep -r "__PRO__" dist/; then
      echo "❌ Premium feature flags found in free build!"
      exit 1
    fi
    
    # Bundle analysis
    pnpm rollup-plugin-visualizer --format=json > bundle-analysis.json
    node scripts/validate-bundle.js
```

### ✅ **Typed Feature Gates from Schema**
**Value**: Prevents dead feature flags, ensures consistency  
**Effort**: Low - code generation + lint rule

```typescript
// features.config.json (single source of truth)
{
  "features": {
    "ADVANCED_CONTEXT": { "tier": "pro", "description": "Advanced context generation" },
    "TEAM_COLLABORATION": { "tier": "enterprise", "description": "Team sharing features" },
    "PREMIUM_TEMPLATES": { "tier": "pro", "description": "Premium template library" }
  }
}

// Generated types (build-time)
export type FeatureKey = 'ADVANCED_CONTEXT' | 'TEAM_COLLABORATION' | 'PREMIUM_TEMPLATES';

// ESLint rule: ensure all features are referenced
// "no-unused-feature-flags": "error"
```

### ✅ **Plugin Capabilities Discovery**
**Value**: Elegant UX for missing features, better discoverability  
**Effort**: Low - simple registry extension

```typescript
interface PluginCapability {
  id: string;
  name: string;
  description: string;
  available: boolean;
  requiredTier?: 'pro' | 'enterprise';
  providedBy?: string; // plugin id
}

class PluginRegistry {
  getCapabilities(): PluginCapability[] {
    return [
      {
        id: 'advanced-export',
        name: 'Advanced Export Formats',
        description: 'Export context to PDF, Word, etc.',
        available: this.hasPlugin('export-premium'),
        requiredTier: 'pro',
        providedBy: 'export-premium'
      }
    ];
  }
}

// UI Usage
function ExportButton() {
  const capabilities = usePluginCapabilities();
  const advancedExport = capabilities.find(c => c.id === 'advanced-export');
  
  return (
    <button 
      disabled={!advancedExport?.available}
      title={!advancedExport?.available ? `Requires ${advancedExport?.requiredTier} tier` : undefined}
    >
      Export {advancedExport?.available ? '📄' : '🔒'}
    </button>
  );
}
```

### **Why These Are High-Value Wins:**

1. **Bundle Guardrails**: Automated security validation prevents costly mistakes
2. **Typed Feature Gates**: Developer experience + prevents dead code accumulation  
3. **Capabilities Discovery**: Professional UX that gracefully handles missing features

### **Implementation Order:**
1. **Bundle guardrails** (immediate - prevents security issues)
2. **Capabilities discovery** (user-facing value)
3. **Typed feature gates** (developer experience improvement)