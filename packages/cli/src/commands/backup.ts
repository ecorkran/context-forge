import { Command } from 'commander';
import { getStoragePath, createVersionedBackup } from '@context-forge/core/node';
import { handleError } from '../utils/errors.js';
import { success, dim, label } from '../output/styles.js';

/** Files to include in versioned backup. */
const BACKUP_FILES = ['projects.json'] as const;

export function registerBackupCommand(program: Command): void {
  program
    .command('backup')
    .description('Create a versioned backup of project data (keeps last 10)')
    .action(async () => {
      try {
        const storagePath = getStoragePath();
        console.log(label('Creating versioned backup...'));
        console.log(dim(`  Storage: ${storagePath}`));

        for (const file of BACKUP_FILES) {
          await createVersionedBackup(storagePath, file);
          console.log(success(`  ✓ ${file}`));
        }

        console.log('');
        console.log(success('Backup complete.'));
      } catch (err) {
        handleError(err);
      }
    });
}
