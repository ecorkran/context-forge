---
name: release
description: Cut a context-forge release — confirm npm login, verify cf state, merge the slice, build, bump all four packages in lockstep, update CHANGELOG/DEVLOG, tag, push, publish to npm, and confirm the new version is live. Use when the user says "release", "cut a release", "ship it", or "bump and tag".
---

# Release context-forge

Run from the repo root. Stop and report on any failed command; don't work around it.

## 0. PM prerequisite: npm login

Run `npm whoami`. If it fails (401 / not logged in), stop and ask the PM to run `npm login`. Do not continue until `npm whoami` succeeds.

## 1. Check cf state

Run `cf next`. If it reports something unfinished for the current slice (open review gate, unchecked tasks, failing check), stop and show it. Otherwise continue.

## 2. Merge

Read the target with `cf config get git.integration_branch` (empty means `main`). If the current branch is a slice branch not yet merged into the target, follow the merge steps in CLAUDE.md (Git Rules). If already on the target with the work merged, skip this.

Working tree must be clean before continuing.

## 3. Build

Run `pnpm -r build`. A failure stops the release.

## 4. Pick the version

The four publishable packages release in lockstep at one version: `packages/core`, `packages/cli`, `packages/mcp-server`, `packages/context-forge`. Current version is `version` in `packages/core/package.json`. The repo-root `package.json` is private at `0.0.0` — never touch it.

Read `## [Unreleased]` in CHANGELOG.md. If it is empty, draft entries from `git log vPREV..HEAD --oneline` (user-facing `feat`/`fix` commits, with issue numbers) and add them before continuing.

- Anything under `### Added` → minor bump.
- Otherwise → patch bump.
- Major bump only after the user confirms it explicitly.

State the chosen version in one line and proceed (no confirmation for patch/minor).

## 5. Bump and document

1. Set `version` to X.Y.Z in all four package.json files listed above. Internal deps are `workspace:*` and need no edit.
2. CHANGELOG.md: insert `## [X.Y.Z] - YYYYMMDD` directly under `## [Unreleased]`, so the unreleased entries now sit under the new version and `[Unreleased]` is empty. Entries stay short and user-facing.
3. DEVLOG.md: under today's `## YYYY-MM-DD` heading (create it at the top, below the `---`, if missing), add at the top:
   ```
   ### Release X.Y.Z

   - **Contents:** <slices and fixes included, with issue numbers>

   Tags: @context-forge/core@X.Y.Z, @context-forge/cli@X.Y.Z, @context-forge/mcp@X.Y.Z, @context-forge/context-forge@X.Y.Z
   ```
4. Run `pnpm -r typecheck`, `pnpm -r lint`, and `pnpm -r test`. Any failure stops the release.
5. Commit: `chore: release X.Y.Z`.

## 6. Tag and push

```
git tag -a vX.Y.Z -m "vX.Y.Z"
git push
git push --tags
```

The tag must point at HEAD, or pnpm's git checks block the publish. If a fix lands after tagging, move it with `git tag -f -a vX.Y.Z -m "vX.Y.Z"` and `git push -f origin vX.Y.Z`.

## 7. Publish

1. Run `pnpm -r build` again. `dist/` is gitignored and packed straight from disk, so this must run right before publish — a stale dist has shipped before.
2. Run `pnpm publish -r --access public`. The PM approves each package's publish as npm asks (2FA). If it fails with `EOTP`, nothing was published: ask the PM for an OTP and re-run with `--otp=<code>`, or hand the command to the PM to run.

## 8. Confirm on npm

For each of `@context-forge/core`, `@context-forge/cli`, `@context-forge/mcp`, `@context-forge/context-forge`, run `npm view <name> version`. All four must report X.Y.Z. The registry can lag a minute after publish — retry once or twice before calling it a failure.

Never check `npm view context-forge` — that is an unrelated third-party package.

Report "X.Y.Z live on npm" when all four match.
