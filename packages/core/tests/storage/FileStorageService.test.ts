import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FileStorageService } from '../../src/storage/FileStorageService.js';

describe('FileStorageService', () => {
  let tempDir: string;
  let service: FileStorageService;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cf-storage-test-'));
    service = new FileStorageService(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('write + read round-trip', () => {
    it('should write JSON data and read it back', async () => {
      const data = JSON.stringify({ key: 'value', num: 42 });

      await service.write('test.json', data);
      const result = await service.read('test.json');

      expect(result.data).toBe(data);
      expect(result.recovered).toBeUndefined();
    });
  });

  describe('atomic write', () => {
    it('should not leave .tmp file after successful write', async () => {
      await service.write('test.json', JSON.stringify({ ok: true }));

      expect(existsSync(join(tempDir, 'test.json.tmp'))).toBe(false);
      expect(existsSync(join(tempDir, 'test.json'))).toBe(true);
    });
  });

  describe('backup on write', () => {
    it('should create .backup file after writing over existing data', async () => {
      await service.write('test.json', JSON.stringify({ version: 1 }));
      await service.write('test.json', JSON.stringify({ version: 2 }));

      expect(existsSync(join(tempDir, 'test.json.backup'))).toBe(true);
      const backup = await readFile(
        join(tempDir, 'test.json.backup'),
        'utf-8'
      );
      expect(JSON.parse(backup)).toEqual({ version: 1 });
    });
  });

  describe('recovery from corrupted main file', () => {
    it('should recover from backup and set recovered flag', async () => {
      // Write valid data (creates main + backup on next write)
      await service.write('test.json', JSON.stringify({ data: 'original' }));
      await service.write('test.json', JSON.stringify({ data: 'updated' }));

      // Corrupt main file
      await writeFile(join(tempDir, 'test.json'), 'NOT VALID JSON');

      // Read should recover from backup
      const result = await service.read('test.json');

      expect(result.recovered).toBe(true);
      expect(result.message).toContain('backup');
      expect(JSON.parse(result.data)).toEqual({ data: 'original' });
    });
  });

  describe('filename validation', () => {
    const invalidNames = ['../etc/passwd', 'foo/bar.json', 'foo\\bar.json'];

    for (const name of invalidNames) {
      it(`should reject filename with path-traversal: "${name}" (read)`, async () => {
        await expect(service.read(name)).rejects.toThrow('Invalid filename');
      });

      it(`should reject filename with path-traversal: "${name}" (write)`, async () => {
        await expect(service.write(name, '{}')).rejects.toThrow(
          'Invalid filename'
        );
      });

      it(`should reject filename with path-traversal: "${name}" (createBackup)`, async () => {
        await expect(service.createBackup(name)).rejects.toThrow(
          'Invalid filename'
        );
      });

      it(`should reject filename with path-traversal: "${name}" (exists)`, async () => {
        await expect(service.exists(name)).rejects.toThrow('Invalid filename');
      });
    }
  });

  describe('read non-existent file', () => {
    it('should throw on file not found', async () => {
      await expect(service.read('missing.json')).rejects.toThrow();
    });
  });

  describe('write creates directory if missing', () => {
    it('should create the storage directory on first write', async () => {
      const nestedDir = join(tempDir, 'nested-storage');
      const nestedService = new FileStorageService(nestedDir);

      await nestedService.write('test.json', JSON.stringify({ ok: true }));

      expect(existsSync(join(nestedDir, 'test.json'))).toBe(true);
    });
  });

  describe('exists', () => {
    it('should return false for non-existent file', async () => {
      expect(await service.exists('nope.json')).toBe(false);
    });

    it('should return true for existing file', async () => {
      await service.write('test.json', JSON.stringify({}));
      expect(await service.exists('test.json')).toBe(true);
    });
  });

  describe('createBackup', () => {
    it('should copy main file to .backup', async () => {
      await service.write('test.json', JSON.stringify({ v: 1 }));
      await service.createBackup('test.json');

      const backup = await readFile(
        join(tempDir, 'test.json.backup'),
        'utf-8'
      );
      expect(JSON.parse(backup)).toEqual({ v: 1 });
    });

    it('should not throw if main file does not exist', async () => {
      await expect(
        service.createBackup('missing.json')
      ).resolves.toBeUndefined();
    });
  });
});
