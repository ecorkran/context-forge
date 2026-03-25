import type { Command } from 'commander';

interface CatalogArg {
  name: string;
  required: boolean;
  description: string;
}

interface CatalogOption {
  flag: string;
  description: string;
}

interface CatalogCommand {
  name: string;
  description: string;
  args: CatalogArg[];
  options: CatalogOption[];
  subcommands: CatalogCommand[];
}

export interface CommandCatalog {
  version: string;
  commands: CatalogCommand[];
}

function buildCommandEntry(cmd: Command): CatalogCommand {
  // Filter out default help option and version option
  const options: CatalogOption[] = cmd.options
    .filter((o: { flags: string }) => !o.flags.includes('--help') && !o.flags.includes('--version'))
    .map((o: { flags: string; description: string }) => ({
      flag: o.flags,
      description: o.description,
    }));

  const args: CatalogArg[] = (cmd.registeredArguments ?? []).map(
    (a: { name: () => string; required: boolean; description: string }) => ({
      name: a.name(),
      required: a.required,
      description: a.description,
    }),
  );

  const subcommands: CatalogCommand[] = cmd.commands
    .filter((sub: Command) => sub.name() !== 'help')
    .map((sub: Command) => buildCommandEntry(sub));

  return {
    name: cmd.name(),
    description: cmd.description(),
    args,
    options,
    subcommands,
  };
}

/** Walk the Commander tree and produce a machine-readable command catalog. */
export function buildCommandCatalog(program: Command, version: string): CommandCatalog {
  const commands = program.commands
    .filter((cmd: Command) => cmd.name() !== 'help')
    .map((cmd: Command) => buildCommandEntry(cmd));

  return { version, commands };
}
