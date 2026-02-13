---
docType: guide
layer: project
description: Template for setting up Free/Pro tier synchronization in non-monorepo projects
dateCreated: 20251118
dateUpdated: 20251118
---

# Free/Pro Repository Sync Guide (Simple Project Template)

**Purpose:** Template for setting up Free/Pro tier synchronization in non-monorepo projects
**Audience:** AI agents managing project development
**Based on:** manta-templates-pro sync methodology (tested and verified)

---

## Overview

This guide helps you set up a **two-repository system** where:
- **Pro repo (private)** = Source of truth for all development
- **Free repo (public)** = Receives selective syncs of shared features

**Benefits:**
- Develop everything in one place (Pro)
- Selectively share features with Free
- Keep pro-only features private
- On-demand syncing (no fixed schedule)

---

## Step 1: Define Project Boundaries

Before implementing sync, clearly define what is shared vs pro-only.

### 1.1 Create Boundary Documentation

Create `sync.md` in your Pro repo root with these sections:

```markdown
# Free/Pro Repository Synchronization

**Last Updated:** [DATE]
**Status:** Initial setup
**Project:** [PROJECT-NAME]

---

## What is Shared vs Pro-Only

### Shared (Sync Pro → Free)
- Core functionality
- Basic features
- Shared utilities
- Public documentation
- Examples and demos

### Pro-Only (Never Sync to Free)
- Premium features
- Advanced integrations
- Pro-specific utilities
- Commercial features
- License validation

---

## Directory Structure

### Pro Repository Structure
```
[project-name]-pro/
├── src/
│   ├── core/              ← SHARED: Core functionality
│   ├── features/
│   │   ├── basic/         ← SHARED: Basic features
│   │   └── premium/       ← PRO-ONLY: Premium features
│   ├── integrations/
│   │   └── pro/           ← PRO-ONLY: Pro integrations
│   └── utils/
│       ├── common/        ← SHARED: Common utilities
│       └── pro/           ← PRO-ONLY: Pro utilities
├── docs/                  ← SHARED: Documentation
├── examples/              ← SHARED: Examples
└── scripts/
    └── sync-to-free.sh    ← Sync automation
```

### Free Repository Structure
```
[project-name]/
├── src/
│   ├── core/              ← Synced from Pro
│   ├── features/
│   │   └── basic/         ← Synced from Pro
│   └── utils/
│       └── common/        ← Synced from Pro
├── docs/                  ← Synced from Pro
└── examples/              ← Synced from Pro
```
```

### 1.2 Identify Your Specific Boundaries

**Fill in this template based on your project:**

```markdown
## Project-Specific Boundaries

### Shared Directories (Sync to Free)
- [ ] `src/core/` - Core functionality
- [ ] `src/features/basic/` - Basic features
- [ ] `src/utils/common/` - Common utilities
- [ ] `docs/` - Documentation
- [ ] `examples/` - Examples
- [ ] [ADD YOUR SHARED DIRS]

### Pro-Only Directories (Never Sync)
- [ ] `src/features/premium/` - Premium features
- [ ] `src/integrations/pro/` - Pro integrations
- [ ] `src/utils/pro/` - Pro utilities
- [ ] [ADD YOUR PRO-ONLY DIRS]

### Pro-Only Files (Never Sync)
- [ ] `src/config/license.ts` - License validation
- [ ] `src/services/payment.ts` - Payment processing
- [ ] [ADD YOUR PRO-ONLY FILES]

### Pro-Only Dependencies (package.json)
- [ ] stripe
- [ ] lemonsqueezy
- [ ] [ADD YOUR PRO-ONLY DEPS]
```

---

## Step 2: Audit Current State

Before setting up sync, audit both repositories to understand their current state.

### 2.1 Audit Pro Repository

**Task:** Verify pro-only code is properly isolated

```bash
# In Pro repo
cd /path/to/[project-name]-pro

# Create audit document
mkdir -p project-artifacts/audits
```

Create `project-artifacts/audits/001-audit.pro-free-sync.md`:

```markdown
# Pro/Free Sync Audit - Initial Assessment

**Date:** [DATE]
**Project:** [PROJECT-NAME]

---

## Audit Checklist

### Pro-Only Code Isolation
- [ ] Pro-only code is in dedicated directories
- [ ] No pro-only code mixed with shared code
- [ ] Pro-only dependencies clearly identified
- [ ] Pro-only config files identified

### Shared Code Review
- [ ] Shared code has no pro-only imports
- [ ] Shared code builds independently
- [ ] No hardcoded pro-only URLs or keys
- [ ] No pro-only feature flags in shared code

### Search Results

**Search for pro-only keywords in shared directories:**
```bash
# Example: Search for payment-related code
grep -r "stripe\|payment\|premium" src/core/ src/features/basic/

# Example: Search for license validation
grep -r "license\|validation" src/core/ src/features/basic/

# Add your project-specific searches
```

**Results:**
- [Document what you found]
- [Note any violations of boundaries]
- [List files that need reorganization]

### Recommendations
- [List any changes needed before sync]
- [Note directories that should be reorganized]
- [Identify dependencies to remove from shared code]

---

**Status:** [CLEAN / NEEDS WORK]
```

**Execute the audit:**
1. Run searches for pro-only keywords in shared directories
2. Document findings in the audit file
3. If violations found, reorganize code before proceeding
4. Mark audit status as CLEAN when ready

### 2.2 Compare Pro and Free Repositories

**Task:** Understand current differences

```bash
# List all source files in Pro
find src/ -type f -name "*.ts" -o -name "*.tsx" -o -name "*.js" > /tmp/pro-files.txt

# In Free repo
cd /path/to/[project-name]
find src/ -type f -name "*.ts" -o -name "*.tsx" -o -name "*.js" > /tmp/free-files.txt

# Compare
diff /tmp/pro-files.txt /tmp/free-files.txt
```

**Document findings:**
- Files in Pro but not in Free (might be pro-only or need syncing)
- Files in Free but not in Pro (outdated? should be removed?)
- Files in both (might be different versions)

---

## Step 3: Create Sync Automation Script

Create `scripts/sync-to-free.sh` in Pro repo:

```bash
#!/bin/bash
# Sync shared code from Pro → Free
# Usage: ./scripts/sync-to-free.sh

set -e  # Exit on error

# ========================================
# CONFIGURATION - CUSTOMIZE FOR YOUR PROJECT
# ========================================

# Repository paths
PRO_DIR="/path/to/[project-name]-pro"
FREE_DIR="/path/to/[project-name]"

# Shared directories to sync (relative to repo root)
SHARED_DIRS=(
  "src/core"
  "src/features/basic"
  "src/utils/common"
  "docs"
  "examples"
)

# Pro-only patterns to exclude (rsync patterns)
EXCLUDE_PATTERNS=(
  "src/features/premium"
  "src/integrations/pro"
  "src/utils/pro"
  "*.pro.ts"
  "*.premium.ts"
)

# Files to compare and sync individually
CONFIG_FILES=(
  ".eslintrc.json"
  "tsconfig.json"
  ".prettierrc"
)

# Pro-only keywords to search for (validation)
PRO_KEYWORDS=(
  "stripe"
  "premium"
  "license"
  "pro-only"
)

# ========================================
# SCRIPT BEGINS - NO CUSTOMIZATION NEEDED BELOW
# ========================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SYNC_DATE=$(date +%Y-%m-%d)
SYNC_BRANCH="sync/from-pro-${SYNC_DATE}"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Pro → Free Sync Script${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

print_step() { echo -e "\n${BLUE}▶ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; exit 1; }

# Pre-flight checks
print_step "Pre-flight checks"

[ -d "$PRO_DIR" ] || print_error "Pro repo not found at $PRO_DIR"
[ -d "$FREE_DIR" ] || print_error "Free repo not found at $FREE_DIR"
print_success "Repositories found"

cd "$PRO_DIR"
[ "$(pwd)" = "$PRO_DIR" ] || print_error "Failed to cd to Pro repo"

if [ -n "$(git status --porcelain)" ]; then
    print_warning "Pro repo has uncommitted changes"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
fi

if [ "$(git branch --show-current)" != "main" ]; then
    print_warning "Pro is not on main branch"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
fi
print_success "Pro repo is ready"

cd "$FREE_DIR"
if [ -n "$(git status --porcelain)" ]; then
    print_warning "Free repo has uncommitted changes"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
fi

[ "$(git branch --show-current)" = "main" ] || print_error "Free must be on main branch"
print_success "Free repo is ready"

# Build Pro to verify
print_step "Step 1: Build Pro to verify it works"
cd "$PRO_DIR"
npm run build > /dev/null 2>&1 || print_error "Pro build failed - fix before syncing"
print_success "Pro builds successfully"

# Create sync branch in Free
print_step "Step 2: Create sync branch in Free"
cd "$FREE_DIR"
git checkout main
git pull origin main

if git show-ref --verify --quiet "refs/heads/$SYNC_BRANCH"; then
    print_warning "Sync branch already exists, deleting it"
    git branch -D "$SYNC_BRANCH"
fi

git checkout -b "$SYNC_BRANCH"
git commit --allow-empty -m "chore: baseline before sync from pro"
print_success "Sync branch created: $SYNC_BRANCH"

# Sync shared directories
print_step "Step 3: Sync shared directories from Pro → Free"

# Build rsync exclude arguments
EXCLUDE_ARGS=()
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    EXCLUDE_ARGS+=(--exclude="$pattern")
done

for dir in "${SHARED_DIRS[@]}"; do
    if [ -d "$PRO_DIR/$dir" ]; then
        echo "  Syncing $dir..."
        rsync -av --delete "${EXCLUDE_ARGS[@]}" "$PRO_DIR/$dir/" "$FREE_DIR/$dir/"
    else
        print_warning "Directory not found in Pro: $dir"
    fi
done

git add .
if [ -n "$(git diff --cached --stat)" ]; then
    git commit -m "sync: update shared directories from pro ($SYNC_DATE)"
    print_success "Shared directories synced and committed"
else
    print_warning "No changes in shared directories"
fi

# Sync config files
print_step "Step 4: Sync config files"
for file in "${CONFIG_FILES[@]}"; do
    if [ -f "$PRO_DIR/$file" ]; then
        if ! diff "$PRO_DIR/$file" "$FREE_DIR/$file" > /dev/null 2>&1; then
            cp "$PRO_DIR/$file" "$FREE_DIR/$file"
            git add "$file"
            echo "  Updated $file"
        fi
    fi
done

if [ -n "$(git diff --cached --stat)" ]; then
    git commit -m "sync: update config files from pro"
    print_success "Config files synced"
else
    print_success "Config files already identical"
fi

# Verify no pro-only code in Free
print_step "Step 5: Verify no pro-only code leaked to Free"
cd "$FREE_DIR"

LEAKED=0
for keyword in "${PRO_KEYWORDS[@]}"; do
    if grep -r "$keyword" "${SHARED_DIRS[@]}" 2>/dev/null | grep -v node_modules; then
        print_error "Pro-only keyword '$keyword' detected in Free!"
        LEAKED=1
    fi
done

[ $LEAKED -eq 0 ] && print_success "No pro-only code detected"

# Build Free
print_step "Step 6: Build Free to verify"
cd "$FREE_DIR"
if ! npm run build > /dev/null 2>&1; then
    print_error "Free build failed! Fix before merging"
fi
print_success "Free builds successfully"

# Show summary and merge
print_step "Step 7: Review and merge"
cd "$FREE_DIR"
echo ""
echo "Sync complete! Here's what changed:"
git log main..$SYNC_BRANCH --oneline
echo ""
read -p "Merge to main? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    git checkout main
    git merge "$SYNC_BRANCH" --no-edit
    git branch -d "$SYNC_BRANCH"
    print_success "Merged to main and deleted sync branch"
    echo ""
    echo -e "${YELLOW}Don't forget to push!${NC}"
    echo "  cd $FREE_DIR"
    echo "  git push origin main"
else
    print_warning "Sync branch not merged: $SYNC_BRANCH"
    echo "To merge later:"
    echo "  cd $FREE_DIR"
    echo "  git checkout main"
    echo "  git merge $SYNC_BRANCH"
    echo "  git branch -d $SYNC_BRANCH"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Sync Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
```

**Make it executable:**
```bash
chmod +x scripts/sync-to-free.sh
```

### 3.1 Customize the Script

**IMPORTANT:** Edit the CONFIGURATION section at the top of the script:

1. **Update repository paths:**
   ```bash
   PRO_DIR="/path/to/your-project-pro"
   FREE_DIR="/path/to/your-project"
   ```

2. **Define shared directories:**
   ```bash
   SHARED_DIRS=(
     "src/core"              # Add your actual shared dirs
     "src/features/basic"
     # Add more...
   )
   ```

3. **Define exclusion patterns:**
   ```bash
   EXCLUDE_PATTERNS=(
     "src/features/premium"  # Add your pro-only patterns
     "*.pro.ts"
     # Add more...
   )
   ```

4. **Define config files to sync:**
   ```bash
   CONFIG_FILES=(
     ".eslintrc.json"        # Add your config files
     "tsconfig.json"
     # Add more...
   )
   ```

5. **Define pro-only keywords for validation:**
   ```bash
   PRO_KEYWORDS=(
     "stripe"                # Add keywords that shouldn't appear in Free
     "premium"
     # Add more...
   )
   ```

---

## Step 4: Perform Initial Sync

### 4.1 Pre-Sync Checklist

Before running the first sync:

- [ ] Audit completed (Step 2)
- [ ] Boundaries documented (Step 1)
- [ ] Pro-only code isolated in correct directories
- [ ] Script customized with correct paths and patterns
- [ ] Both repos committed and on main branch
- [ ] Both repos build successfully

### 4.2 Run Initial Sync

```bash
cd /path/to/[project-name]-pro
./scripts/sync-to-free.sh
```

The script will:
1. Verify both repos are ready
2. Build Pro to ensure it works
3. Create sync branch in Free
4. Sync shared directories
5. Sync config files
6. Verify no pro-only code leaked
7. Build Free to verify
8. Prompt for merge

### 4.3 Verify Sync Results

After sync completes:

**In Free repo, verify:**
```bash
cd /path/to/[project-name]

# Check that shared dirs exist
ls -la src/core
ls -la src/features/basic

# Verify pro-only dirs DON'T exist
ls -la src/features/premium   # Should not exist
ls -la src/integrations/pro   # Should not exist

# Build Free
npm run build

# Run tests if applicable
npm test
```

**Check for pro-only code:**
```bash
# Search for pro keywords
grep -r "stripe\|premium\|license" src/

# Should return NO results in shared directories
```

### 4.4 Document Sync Results

Create `project-artifacts/audits/001-sync-results.md`:

```markdown
# Initial Sync Results

**Date:** [DATE]
**Sync Branch:** sync/from-pro-[DATE]

---

## What Was Synced

### Directories Synced
- [ ] src/core
- [ ] src/features/basic
- [ ] [List what was synced]

### Files Changed
- [Number] files changed
- [Number] insertions
- [Number] deletions

### Config Files Synced
- [ ] .eslintrc.json
- [ ] [List config files]

---

## Verification

### Build Status
- [ ] Pro builds successfully
- [ ] Free builds successfully

### Pro-Only Code Check
- [ ] No pro-only keywords found in Free
- [ ] No pro-only directories in Free
- [ ] No pro-only dependencies in Free package.json

### Manual Testing
- [ ] [Test 1]
- [ ] [Test 2]
- [ ] [Add your tests]

---

## Issues Found
[List any issues encountered]

## Resolutions
[How issues were resolved]

---

**Status:** [SUCCESS / NEEDS WORK]
```

---

## Step 5: Establish Development Workflow

### 5.1 Daily Development Workflow

**All development happens in Pro:**

```bash
# Work in Pro repo
cd /path/to/[project-name]-pro

# Develop shared feature in shared directory
vim src/core/new-feature.ts

# Or develop pro-only feature in pro directory
vim src/features/premium/advanced-feature.ts

# Test
npm run build
npm test

# Commit
git add .
git commit -m "feat: add new feature"
git push origin main
```

**Sync to Free when ready:**
```bash
# After shared changes, sync to Free
./scripts/sync-to-free.sh
```

### 5.2 When to Sync

Sync from Pro → Free:
- ✅ After bug fixes in shared code
- ✅ After adding new shared features
- ✅ Before releases
- ✅ When Free users report issues in shared code
- ✅ On-demand when needed

**Don't sync:**
- ❌ Pro-only features (they won't sync anyway)
- ❌ Every single commit (batch related changes)
- ❌ Work-in-progress features (wait until stable)

### 5.3 Handling Bug Fixes

**Bug in shared code:**
1. Fix in Pro (`src/core/` or other shared dir)
2. Test in Pro
3. Commit to Pro
4. **Sync to Free immediately** - don't wait
5. Verify fix works in Free

**Bug in pro-only code:**
1. Fix in Pro (`src/features/premium/` etc)
2. Test in Pro
3. Commit to Pro
4. **Don't sync** - pro-only code never goes to Free

---

## Step 6: Update Project Documentation

### 6.1 Update README.md

Add this section to Pro repo README:

```markdown
## 🔄 Free/Pro Repository Sync

This repository ([project-name]-pro) is the **source of truth** for all development. Changes are selectively synced to the public [project-name] (Free) repository.

### Development Workflow

**All development happens in Pro:**
1. **Shared code** → Develop in `src/core/`, `src/features/basic/`, etc. (syncs to Free)
2. **Pro-only code** → Develop in `src/features/premium/`, `src/integrations/pro/`, etc. (stays in Pro only)
3. **Sync to Free** → On-demand, when desired

**Quick workflow:**
```bash
# Work in Pro repo
cd /path/to/[project-name]-pro

# Develop shared feature
vim src/core/new-feature.ts

# Test it
npm run build
npm test

# Commit
git add .
git commit -m "feat: add new feature"

# Sync to Free (when ready)
./scripts/sync-to-free.sh
```

**What syncs to Free:**
- ✅ Core functionality (`src/core/`)
- ✅ Basic features (`src/features/basic/`)
- ✅ Common utilities (`src/utils/common/`)
- ✅ Documentation
- ✅ Examples

**What stays Pro-only:**
- ❌ Premium features (`src/features/premium/`)
- ❌ Pro integrations (`src/integrations/pro/`)
- ❌ Pro utilities (`src/utils/pro/`)
- ❌ Pro-only dependencies

### Automation

Run the sync script whenever you want to update Free:
```bash
./scripts/sync-to-free.sh
```

**Documentation:**
- Full sync process: [sync.md](sync.md)
- Audit reports: `project-artifacts/audits/`
- Automation script: `scripts/sync-to-free.sh`
```

### 6.2 Create sync.md (Complete Version)

Expand the initial `sync.md` from Step 1 with full details:

```markdown
# Free/Pro Repository Synchronization

**Last Updated:** [DATE]
**Status:** Active - Tested and verified working
**Project:** [PROJECT-NAME]

---

## Overview

This document defines how to keep `[project-name]` (Free) and `[project-name]-pro` (Pro) repositories synchronized.

**Key Principles:**
1. **Pro is source of truth** - All development happens in Pro first
2. **Separate repos maintained** - Free and Pro remain physically separate
3. **On-demand syncing** - No fixed schedule, sync when needed
4. **Selective sharing** - Only shared features sync to Free

---

## Repository Architecture

### [project-name]-pro (Pro) - Source of Truth

```
[project-name]-pro/
├── src/
│   ├── core/              ← SHARED: Core functionality
│   ├── features/
│   │   ├── basic/         ← SHARED: Basic features
│   │   └── premium/       ← PRO-ONLY: Premium features
│   ├── integrations/
│   │   └── pro/           ← PRO-ONLY: Pro integrations
│   └── utils/
│       ├── common/        ← SHARED: Common utilities
│       └── pro/           ← PRO-ONLY: Pro utilities
├── docs/                  ← SHARED: Documentation
├── examples/              ← SHARED: Examples
└── scripts/
    └── sync-to-free.sh    ← Sync automation
```

### [project-name] (Free) - Synced Subset

```
[project-name]/
├── src/
│   ├── core/              ← Synced from Pro
│   ├── features/
│   │   └── basic/         ← Synced from Pro
│   └── utils/
│       └── common/        ← Synced from Pro
├── docs/                  ← Synced from Pro
└── examples/              ← Synced from Pro
```

---

## What is Shared vs Pro-Only

### Shared (Sync Pro → Free)

**Always Shared:**
- ✅ `src/core/` - Core functionality
- ✅ `src/features/basic/` - Basic features
- ✅ `src/utils/common/` - Common utilities
- ✅ `docs/` - Documentation
- ✅ `examples/` - Examples
- ✅ Config files (eslint, prettier, tsconfig)

**Critical Rule:** Shared directories must NEVER contain pro-only code.

### Pro-Only (Never Sync to Free)

**Pro-only directories:**
- ❌ `src/features/premium/` - Premium features
- ❌ `src/integrations/pro/` - Pro integrations
- ❌ `src/utils/pro/` - Pro utilities

**Pro-only files:**
- ❌ `src/config/license.ts` - License validation
- ❌ `src/services/payment.ts` - Payment processing
- ❌ [Add your pro-only files]

**Pro-only dependencies:**
- ❌ stripe
- ❌ lemonsqueezy
- ❌ [Add your pro-only deps]

---

## Development Workflow

### Developing Shared Features

**Process:**
1. Develop in Pro shared directories (`src/core/`, `src/features/basic/`, etc.)
2. Test in Pro
3. Commit to Pro
4. Sync to Free (immediately for bug fixes, batched for features)

**Example:**
```bash
# In Pro repo
cd /path/to/[project-name]-pro

# Develop shared feature
vim src/core/new-feature.ts

# Test
npm run build
npm test

# Commit
git add src/core/
git commit -m "feat: add new feature to core"

# Sync to Free
./scripts/sync-to-free.sh
```

### Developing Pro-Only Features

**Process:**
1. Develop in Pro pro-only directories (`src/features/premium/`, etc.)
2. Test in Pro
3. Commit to Pro only
4. Never sync to Free

**Example:**
```bash
# In Pro repo
cd /path/to/[project-name]-pro

# Develop pro feature
vim src/features/premium/advanced-feature.ts

# Test
npm run build
npm test

# Commit (Pro only)
git add src/features/premium/
git commit -m "feat: add advanced pro feature"
# Do NOT sync to Free
```

### Fixing Bugs in Shared Code

**Process:**
1. Fix in Pro shared directory
2. Test in Pro
3. Commit to Pro
4. **Sync to Free immediately** (don't wait)
5. Verify fix works in Free

**Example:**
```bash
# In Pro repo
vim src/core/buggy-feature.ts

# Test
npm run build
npm test

# Commit
git add src/core/
git commit -m "fix: resolve bug in core feature"

# Sync immediately
./scripts/sync-to-free.sh
```

---

## Sync Process: Pro → Free

### When to Sync

- ✅ After bug fixes in shared code (immediate)
- ✅ After adding new shared features
- ✅ Before major releases
- ✅ When Free needs specific updates
- ✅ On-demand when desired

### Step-by-Step Sync

```bash
# In Pro repo
cd /path/to/[project-name]-pro

# Run sync script
./scripts/sync-to-free.sh

# Script will:
# 1. Verify both repos are ready
# 2. Build Pro to ensure it works
# 3. Create sync branch in Free
# 4. Sync shared directories
# 5. Sync config files
# 6. Verify no pro-only code leaked
# 7. Build Free to verify
# 8. Interactive merge to main
```

### Manual Verification After Sync

After sync completes, verify:

```bash
# In Free repo
cd /path/to/[project-name]

# Verify no pro-only dirs
ls src/features/premium     # Should not exist
ls src/integrations/pro     # Should not exist

# Search for pro keywords
grep -r "stripe\|premium\|license" src/
# Should return NO results

# Build Free
npm run build

# Test Free
npm test
```

---

## Verification & Safety

### Pre-Sync Checklist

Before starting sync:
- [ ] Pro builds successfully
- [ ] Pro tests pass
- [ ] No uncommitted changes in Pro
- [ ] No uncommitted changes in Free
- [ ] Both repos on main branch

### Post-Sync Checklist

After sync, before merging:
- [ ] No pro-only code in Free
- [ ] No pro-only directories in Free
- [ ] Free builds successfully
- [ ] Free tests pass
- [ ] No broken imports in Free
- [ ] No pro-only dependencies in Free package.json

### Audit Commands

**Check for pro-only code in Free:**
```bash
# In Free repo
cd /path/to/[project-name]

# These should return no results:
grep -r "stripe" src/
grep -r "premium" src/
grep -r "license" src/

# These directories should not exist:
ls src/features/premium     # Should fail
ls src/integrations/pro     # Should fail
```

---

## Troubleshooting

### Issue: Build fails in Free after sync

**Symptoms:** Free builds in Pro but fails in Free after sync

**Possible causes:**
1. Pro-only imports in shared code
2. Pro-only dependencies in shared code
3. Missing files not synced

**Solution:**
```bash
# In Free, check for pro-only imports
grep -r "from.*premium\|from.*pro/" src/core/ src/features/basic/

# Check package.json for pro-only deps
cat package.json | grep -E "stripe|lemonsqueezy|premium"

# If found, fix in Pro and re-sync
```

### Issue: Pro-only code appears in Free

**Symptoms:** Pro-only keywords found in Free after sync

**Cause:** Pro-only code in shared directories

**Solution:**
```bash
# In Pro, move pro-only code to pro-only directory
mv src/core/premium-feature.ts src/features/premium/

# Update imports
# Re-sync
./scripts/sync-to-free.sh
```

### Issue: Sync script fails with "not found" errors

**Symptoms:** Script can't find directories

**Cause:** Misconfigured paths in script

**Solution:**
```bash
# Edit sync script, verify paths
vim scripts/sync-to-free.sh

# Update PRO_DIR and FREE_DIR
PRO_DIR="/correct/path/to/project-pro"
FREE_DIR="/correct/path/to/project"
```

---

## Future Considerations

### Option: Feature Flags

If separate repo syncing becomes too painful:
- Move to single repo with feature flags
- Use build-time or runtime flags for pro features
- Eliminates sync problem entirely
- Adds complexity to build system

**Decision:** Not implementing now. Revisit if sync problems persist.

---

## Documentation Files

- **This file:** `sync.md` - Complete sync process
- **Audit:** `project-artifacts/audits/001-audit.pro-free-sync.md`
- **Script:** `scripts/sync-to-free.sh`
- **README:** Updated with workflow summary

---

**Status:** ✅ ACTIVE
**Last Verified:** [DATE]
```

---

## Step 7: Test the Complete Workflow

### 7.1 Create Test Feature

Test the entire workflow with a simple feature:

```bash
# In Pro repo
cd /path/to/[project-name]-pro

# Create test feature in shared directory
cat > src/core/test-feature.ts << 'EOF'
/**
 * Test feature for verifying Free/Pro sync
 * This should appear in both Pro and Free
 */
export function testFeature(): string {
  return "Sync test successful!";
}
EOF

# Build and test
npm run build
npm test

# Commit
git add src/core/test-feature.ts
git commit -m "test: add sync test feature"
```

### 7.2 Sync to Free

```bash
# Still in Pro repo
./scripts/sync-to-free.sh

# Follow prompts
# Merge when prompted
```

### 7.3 Verify in Free

```bash
# In Free repo
cd /path/to/[project-name]

# Verify file exists
cat src/core/test-feature.ts

# Verify it builds
npm run build

# Verify it works
node -e "console.log(require('./dist/core/test-feature').testFeature())"
# Should output: "Sync test successful!"
```

### 7.4 Test Pro-Only Isolation

```bash
# In Pro repo
cd /path/to/[project-name]-pro

# Create pro-only feature
cat > src/features/premium/test-premium.ts << 'EOF'
/**
 * Pro-only test feature
 * This should NEVER appear in Free
 */
export function testPremium(): string {
  return "This is pro-only!";
}
EOF

# Commit
git add src/features/premium/
git commit -m "test: add pro-only test feature"

# Sync to Free
./scripts/sync-to-free.sh
```

**Verify in Free:**
```bash
# In Free repo
cd /path/to/[project-name]

# This should NOT exist
ls src/features/premium/test-premium.ts  # Should fail

# Search for pro-only content
grep -r "testPremium" src/  # Should return nothing
```

### 7.5 Document Test Results

If both tests pass, document in `project-artifacts/audits/002-workflow-test.md`:

```markdown
# Workflow Test Results

**Date:** [DATE]

---

## Test 1: Shared Feature Sync

**Test:** Created `src/core/test-feature.ts` in Pro and synced to Free

**Results:**
- [x] File appears in Free
- [x] Free builds successfully
- [x] Feature works in Free

**Status:** ✅ PASS

---

## Test 2: Pro-Only Isolation

**Test:** Created `src/features/premium/test-premium.ts` in Pro and synced

**Results:**
- [x] File does NOT appear in Free
- [x] No pro-only code detected in Free
- [x] Free builds successfully

**Status:** ✅ PASS

---

**Overall:** ✅ Workflow verified and working
```

---

## Checklist: Complete Setup

Use this checklist to verify setup is complete:

### Documentation
- [ ] `sync.md` created with project-specific boundaries
- [ ] README.md updated with workflow section
- [ ] Audit document created (001-audit.pro-free-sync.md)

### Automation
- [ ] `scripts/sync-to-free.sh` created
- [ ] Script customized with correct paths
- [ ] Script customized with correct shared directories
- [ ] Script customized with correct exclusion patterns
- [ ] Script made executable (`chmod +x`)

### Initial State
- [ ] Pro-only code isolated in pro-only directories
- [ ] Shared code has no pro-only imports
- [ ] Both repos build successfully
- [ ] Initial sync completed successfully

### Testing
- [ ] Test shared feature syncs correctly
- [ ] Test pro-only feature stays in Pro
- [ ] Both tests documented in audit file

### Workflow
- [ ] Development workflow documented
- [ ] Sync process tested and verified
- [ ] Team members (or AI) understand when to sync

---

## AI Agent Quick Reference

**As an AI agent managing this project, here's your quick guide:**

### Daily Work

1. **Always develop in Pro repo**
2. **Shared code** → `src/core/`, `src/features/basic/`, etc.
3. **Pro-only code** → `src/features/premium/`, `src/integrations/pro/`, etc.
4. **After shared changes** → Run `./scripts/sync-to-free.sh`

### Before Syncing

Ask yourself:
- [ ] Did I change shared code?
- [ ] Does Pro build successfully?
- [ ] Did I accidentally put pro-only code in shared directories?

### After Syncing

Verify:
- [ ] Free builds successfully
- [ ] No pro-only code in Free (run grep checks)
- [ ] Sync was merged to Free main branch

### When in Doubt

1. Check `sync.md` for boundaries
2. Run audit commands to verify no pro-only code in shared dirs
3. Build both repos before syncing
4. Let the script's safety checks catch issues

---

## Success Criteria

Your setup is complete and successful when:

- ✅ Pro repo is source of truth
- ✅ Free repo receives selective syncs
- ✅ Pro-only code never appears in Free
- ✅ Shared code syncs automatically
- ✅ Both repos build independently
- ✅ Automation script works reliably
- ✅ Workflow is documented and understood

---

**Template Version:** 1.0
**Based on:** manta-templates-pro sync methodology
**Last Updated:** 2025-11-07
**Status:** Production-ready
