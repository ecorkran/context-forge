import type { Command } from 'commander';

/** -j, --json — Output as JSON */
export function withJsonOption(cmd: Command): Command {
  return cmd.option('-j, --json', 'Output as JSON');
}

/** -p, --project <id> — Project ID or name (overrides default) */
export function withProjectOption(cmd: Command): Command {
  return cmd.option('-p, --project <id>', 'Project ID or name (overrides default)');
}

/** -y, --yes — Skip confirmation prompt */
export function withYesOption(cmd: Command): Command {
  return cmd.option('-y, --yes', 'Skip confirmation prompt');
}

/** -f, --fix — Apply non-destructive corrections (when available) */
export function withFixOption(cmd: Command): Command {
  return cmd.option('-f, --fix', 'Apply non-destructive corrections (when available)');
}

/** -a, --all — Show items from all worktrees */
export function withAllOption(cmd: Command): Command {
  return cmd.option('-a, --all', 'Show items from all worktrees');
}

/** -r, --raw — Output raw content without formatting */
export function withRawOption(cmd: Command): Command {
  return cmd.option('-r, --raw', 'Output raw content without formatting');
}

/** --project-level — Force operation at project level (skip worktree routing) */
export function withProjectLevelOption(cmd: Command): Command {
  return cmd.option('--project-level', 'Force operation at project level (skip worktree routing)');
}
