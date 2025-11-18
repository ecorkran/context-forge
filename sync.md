# Free/Pro Repository Synchronization

**Last Updated:** 2025-11-17
**Status:** Initial setup
**Project:** context-forge

---

## What is Shared vs Pro-Only

### Shared (Sync Pro → Free)
- Core application functionality
- Basic context builder features
- Project management (single project)
- File system operations
- Template system
- Basic export formats (text, markdown)
- UI components (shared)
- Public documentation
- Examples and demos

### Pro-Only (Never Sync to Free)
- **Cloud sync** - Multi-device synchronization
- **Premium formats** - Advanced prompt system customization
- **Orchestration** - Advanced automation features
- License validation
- Pro-specific UI components
- Pro-specific services
- Advanced integrations

---

## Directory Structure

### Current Pro Repository Structure
```
context-forge-pro/
├── src/
│   ├── components/          ← SHARED (currently all shared)
│   │   ├── display/
│   │   ├── editor/
│   │   ├── icons/
│   │   ├── navigation/
│   │   └── ui/
│   ├── content/             ← SHARED
│   ├── hooks/               ← SHARED (currently all shared)
│   ├── lib/                 ← SHARED (currently all shared)
│   ├── main/                ← SHARED (Electron main process)
│   ├── pages/               ← SHARED (currently all shared)
│   ├── preload/             ← SHARED
│   ├── renderer/            ← SHARED
│   ├── services/            ← SHARED (currently all shared)
│   ├── test/                ← SHARED
│   ├── App.tsx              ← SHARED
│   ├── index.css            ← SHARED
│   └── vite-env.d.ts        ← SHARED
├── project-documents/       ← PRO-ONLY (development docs)
├── public/                  ← SHARED
├── dist/                    ← EXCLUDED (build artifacts)
├── node_modules/            ← EXCLUDED
└── README.md                ← SHARED (will need pro/free variants)
```

### Planned Pro-Only Additions
```
context-forge-pro/
├── src/
│   ├── features/
│   │   ├── cloud-sync/      ← PRO-ONLY: Cloud synchronization
│   │   ├── orchestration/   ← PRO-ONLY: Advanced automation
│   │   └── premium-formats/ ← PRO-ONLY: Custom prompt systems
│   ├── services/
│   │   ├── licensing/       ← PRO-ONLY: License validation
│   │   └── pro/             ← PRO-ONLY: Pro-specific services
│   └── components/
│       └── pro/             ← PRO-ONLY: Pro-specific UI components
```

### Free Repository Structure
```
context-forge/
├── src/
│   ├── components/          ← Synced from Pro
│   ├── content/             ← Synced from Pro
│   ├── hooks/               ← Synced from Pro
│   ├── lib/                 ← Synced from Pro
│   ├── main/                ← Synced from Pro
│   ├── pages/               ← Synced from Pro
│   ├── preload/             ← Synced from Pro
│   ├── renderer/            ← Synced from Pro
│   ├── services/            ← Synced from Pro (shared only)
│   ├── test/                ← Synced from Pro
│   ├── App.tsx              ← Synced from Pro
│   ├── index.css            ← Synced from Pro
│   └── vite-env.d.ts        ← Synced from Pro
├── public/                  ← Synced from Pro
└── README.md                ← Synced from Pro (free variant)
```

---

## Project-Specific Boundaries

### Shared Directories (Sync to Free)
- `src/` - All current code (100% shared until pro features added)
- `public/` - Public assets
- `electron/` - Electron configuration (if exists)
- Root config files: `package.json`, `tsconfig.json`, `vite.config.ts`, etc.

### Pro-Only Directories (Never Sync to Free)
- `src/features/cloud-sync/` - Cloud synchronization (not yet created)
- `src/features/orchestration/` - Advanced automation (not yet created)
- `src/features/premium-formats/` - Custom prompt systems (not yet created)
- `src/services/licensing/` - License validation (not yet created)
- `src/services/pro/` - Pro-specific services (not yet created)
- `src/components/pro/` - Pro-specific UI components (not yet created)
- `project-documents/` - Internal development documentation

### Excluded (Never Sync)
- `node_modules/`
- `dist/`
- `.git/`
- Build artifacts
- `.env` and environment-specific files

---

## Sync Strategy

### When to Sync
- After completing shared feature development
- After bug fixes in shared code
- Before releasing new free version
- On-demand (no automatic schedule)

### How to Sync
1. Run sync script from Pro repository: `./scripts/sync-to-free.sh`
2. Review changes in Free repository
3. Test Free repository build
4. Commit and push Free repository

### Safety Checks
- Always sync from Pro → Free (never reverse)
- Verify no pro-only code in synced directories
- Test Free build after sync
- Review git diff before committing Free

---

## Current Status

**Phase:** Initial setup
**Code Status:** 100% shared code (imported from original free repo)
**Pro Features:** Not yet implemented
**Sync Status:** Script not yet created

**Next Steps:**
1. ✅ Define boundaries (this document)
2. ⏳ Create sync script
3. ⏳ Create directory structure for pro-only features
4. ⏳ Test sync with dry run
5. ⏳ Implement first pro-only feature

---

## Notes

- Current codebase is 100% shared (all code came from free repo)
- No pro-only features exist yet
- Sync script will use rsync for selective file copying
- Pro repository is source of truth for all development
- Free repository receives periodic syncs of shared code only
