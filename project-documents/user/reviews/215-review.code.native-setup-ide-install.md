---
docType: review
layer: project
reviewType: code
slice: native-setup-ide-install
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: [testing.md, typescript.md]
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/215-slice.native-setup-ide-install.md
aiModel: deepseek/deepseek-v4.1-flash
aiProfile: openrouter
status: complete
dateCreated: 20261013
dateUpdated: 20261013
reviewedSha: 291dabe40105c2fa894674815d5d75c96912e2f1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 33
diffTruncated: true
turns: 20
promptTokens: 2308825
cachedTokens: 2008064
completionTokens: 77914
reasoningTokens: 74410
durationSeconds: 242.8
squadronVersion: 0.21.6
findings:
  - id: F001
    severity: concern
    category: security
    summary: "Manifest prune deletes by manifest path with no containment check"
    location: "packages/cli/src/ideInstall/manifest.ts:188"
  - id: F002
    severity: note
    category: error-handling
    summary: "Dry run's `finally` can mask the install's real error"
    location: "packages/cli/src/ideInstall/dryRun.ts:122"
  - id: F003
    severity: note
    category: maintainability
    summary: "Marker/install-path lists are duplicated between the installer and the test harness"
    location: "packages/cli/tests/ideInstall/harness.ts:28"
  - id: F004
    severity: note
    category: correctness
    summary: "`import.meta.url` path is used without decoding"
    location: "packages/cli/tests/ideInstall/harness.ts:14"
  - id: F005
    severity: pass
    category: testing
    summary: "Error boundary and coverage of the new installer"
    location: "packages/cli/src/ideInstall/installer.ts:68"
---

# Review: code — slice 215

**Verdict:** CONCERNS
**Model:** deepseek/deepseek-v4.1-flash
**Diff:** truncated: 256000 of 432693 characters reached the model

## Findings

### [CONCERN] Manifest prune deletes by manifest path with no containment check

`InstallManifest.finish()` takes `rel` from the previous manifest file and does:

```ts
const file = path.join(this.targetRoot, rel);
if (rel === '' || !isFile(file)) continue;
if (oldLines.includes(`${cksumField(fs.readFileSync(file))} ${rel}`)) {
  fs.rmSync(file);
```

The deleted `pruneStaleFiles` in `worktreePropagation.ts` (removed in this diff) had two guards that are now gone: `escapesLexically(relPath)` (rejecting absolute paths, drive letters, and `..` segments) and an `isWithin(worktreeReal, fs.realpathSync(path.dirname(absPath)))` check for a symlinked install directory pointing outside the checkout. I grepped `packages/cli/src/ideInstall/` for `escapesLexically`, `isWithin`, `realpathSync`, and `isAbsolute`: zero hits. `.context-forge/<target>.manifest` is a committed, user-editable file in every project, so a `..`-bearing or absolute path field now deletes the checksum-matching file wherever it points.

The bash `scripts/setup-ide` has the same flaw (`rm "$TARGET_ROOT/$rel"`), so this is a faithful port — but cf had hardened it, and the slice's stated invariant ("everything it writes stays byte-identical") does not cover deleting the guard. Either restore the containment checks or record the removal as an accepted regression; silently dropping them is the outcome to avoid. Note the manifest is also read from worktrees that may have been written by an older/different tool.

### [NOTE] Dry run's `finally` can mask the install's real error

```ts
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}
```

The doc comment says "a failed removal propagates," which is accurate but is the problem: if `install(...)` throws a `TypeError` (a genuine bug that `installIde` rethrows), and the sandbox removal then fails with `EACCES`/`EBUSY`, the cleanup error replaces the original and the diagnosis is lost. Since `installIde` catches filesystem errors and converts them to exit 1, this can also downgrade a real bug into a reported "filesystem failure". Consider catching and reporting the removal failure to stderr instead of letting it escape.

### [NOTE] Marker/install-path lists are duplicated between the installer and the test harness

`INSTALL_PATHS` exists three times: `dryRun.ts:20`, `harness.ts:28`, and the bash `setup-ide`'s `INSTALL_PATHS`. The two TypeScript copies already differ in spelling (`MANIFEST_DIR` interpolation vs. the literal `.context-forge`). A target that starts writing a new top-level path must be added in all three or the dry-run diff and the snapshots silently stop covering it. At minimum, `harness.ts` should import `DRY_RUN_SKIP_PATH`/`MANIFEST_DIR` from the modules it mirrors rather than restating the literals.

### [NOTE] `import.meta.url` path is used without decoding

```ts
const HERE = path.dirname(new URL(import.meta.url).pathname);
```

`.pathname` is percent-encoded, so a checkout path containing a space or non-ASCII character yields a bogus `FIXTURE_GUIDE`, and `makeGuide`/`REPO_ROOT` resolve to nothing. `fileURLToPath(new URL(import.meta.url))` (already the pattern in `tests/commands/installManifest.test.ts`, which this diff deletes) is the correct form. Test-only, but it fails in a way that looks like a fixture problem.

### [PASS] Error boundary and coverage of the new installer

`installIde` distinguishes `InstallAbort` (exit 1), Node filesystem errors (reported on stderr, exit 1), and everything else (propagates), and `tests/ideInstall/installer.test.ts` exercises all three, including the rethrow of a `TypeError`. The command layer's tests were correctly narrowed to what cf passes the installer and does with `exitCode`, while the installer's own behavior is covered by the snapshot suite — that is the right split, and the ownership/managed-section suites are the kind of "protect the user's files" tests the change deserves (e.g. `tests/ideInstall/ownership.test.ts`, `managedSection.test.ts`, including the non-UTF-8 and no-final-newline cases).

### Run Digest

- Response length: 4894 chars
- Response is newline-free: no
- Tool calls made: 33
- Tool calls failed: 0
- Stop reason: stop
- Output budget: 384000 tokens
- System prompt: custom
- Settings sources: n/a (non-SDK)
- Reasoning characters: 289604
- Effort: backend default
- Turns: 20
- Tokens — prompt / cached / completion / reasoning: 2308825 / 2008064 / 77914 / 74410
- Duration: 242.8 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 5
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 5
- Finding-shaped matches — surviving validation: 5
