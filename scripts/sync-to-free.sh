#!/bin/bash
# Sync shared code from context-forge-pro → context-forge (free)
# Usage: ./scripts/sync-to-free.sh

set -e  # Exit on error

# ========================================
# CONFIGURATION - CUSTOMIZED FOR CONTEXT-FORGE
# ========================================

# Repository paths
PRO_DIR="/Users/manta/source/repos/manta/context-forge-pro"
FREE_DIR="/Users/manta/source/repos/manta/context-forge"

# Shared directories to sync (relative to repo root)
# NOTE: Currently ALL source is shared. This will change when pro features are added.
SHARED_DIRS=(
  "src/components"
  "src/content"
  "src/hooks"
  "src/lib"
  "src/main"
  "src/pages"
  "src/preload"
  "src/renderer"
  "src/services"
  "src/test"
  "public"
)

# Individual files to sync
SHARED_FILES=(
  "src/App.tsx"
  "src/index.css"
  "src/vite-env.d.ts"
)

# Pro-only patterns to exclude (rsync patterns)
# NOTE: Patterns are relative to the synced directory, not repo root
EXCLUDE_PATTERNS=(
  # Pro-only subdirectories (exclude from parent dirs being synced)
  "pro"
  "pro/"
  "cloud-sync"
  "cloud-sync/"
  "orchestration"
  "orchestration/"
  "premium-formats"
  "premium-formats/"
  "licensing"
  "licensing/"
  # File patterns
  "*.pro.ts"
  "*.pro.tsx"
  "*.premium.ts"
  "*.premium.tsx"
)

# Config files to compare and sync individually
CONFIG_FILES=(
  "package.json"
  "tsconfig.json"
  "tsconfig.node.json"
  "vite.config.ts"
  "electron.vite.config.ts"
  ".eslintrc.cjs"
  ".prettierrc.yaml"
  ".gitignore"
)

# Pro-only keywords to search for (validation)
PRO_KEYWORDS=(
  "cloud-sync"
  "orchestration"
  "premium-format"
  "license-check"
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
echo -e "${BLUE}  Context Forge: Pro → Free Sync${NC}"
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
    print_warning "Pro is not on main branch (current: $(git branch --show-current))"
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

if [ "$(git branch --show-current)" != "main" ]; then
    print_error "Free must be on main branch (current: $(git branch --show-current))"
fi
print_success "Free repo is ready"

# Build Pro to verify
print_step "Step 1: Build Pro to verify it works"
cd "$PRO_DIR"
pnpm build > /dev/null 2>&1 || print_error "Pro build failed - fix before syncing"
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
        mkdir -p "$FREE_DIR/$dir"
        rsync -av --delete "${EXCLUDE_ARGS[@]}" "$PRO_DIR/$dir/" "$FREE_DIR/$dir/"
    else
        print_warning "Directory not found in Pro: $dir"
    fi
done

# Sync individual files
print_step "Step 3b: Sync individual shared files"
for file in "${SHARED_FILES[@]}"; do
    if [ -f "$PRO_DIR/$file" ]; then
        echo "  Syncing $file..."
        cp "$PRO_DIR/$file" "$FREE_DIR/$file"
    else
        print_warning "File not found in Pro: $file"
    fi
done

git add .
if [ -n "$(git diff --cached --stat)" ]; then
    git commit -m "sync: update shared code from pro ($SYNC_DATE)"
    print_success "Shared code synced and committed"
else
    print_warning "No changes in shared code"
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
    # Only check actual code files (.ts, .tsx, .js, .jsx), exclude README.md and other docs
    if grep -r "$keyword" src/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null | grep -v node_modules | grep -v ".git" | grep -v "README.md"; then
        print_error "Pro-only keyword '$keyword' detected in Free code!"
        LEAKED=1
    fi
done

[ $LEAKED -eq 0 ] && print_success "No pro-only code detected"

# Build Free
print_step "Step 6: Build Free to verify"
cd "$FREE_DIR"
if ! pnpm build > /dev/null 2>&1; then
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
echo "Detailed diff:"
git diff main..$SYNC_BRANCH --stat
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
