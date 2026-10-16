import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  formatDisplayPath,
  validateRelativePath,
  resolveSafePath,
  getIgnoreFile,
  getMinifyFile,
  getMinifyFileDescription,
} from '../handlers/utils.js';
import { promises as fs } from 'fs';
import path from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';

// Creating symlinks on Windows needs extra privileges
const describePosix = process.platform === 'win32' ? describe.skip : describe;

describe('formatDisplayPath', () => {
  it('should remove leading ./ from paths', () => {
    expect(formatDisplayPath('./src/index.ts')).toBe('src/index.ts');
    expect(formatDisplayPath('./file.txt')).toBe('file.txt');
    expect(formatDisplayPath('./deeply/nested/path.js')).toBe('deeply/nested/path.js');
  });

  it('should return paths without ./ unchanged', () => {
    expect(formatDisplayPath('src/index.ts')).toBe('src/index.ts');
    expect(formatDisplayPath('file.txt')).toBe('file.txt');
    expect(formatDisplayPath('deeply/nested/path.js')).toBe('deeply/nested/path.js');
  });

  it('should handle root directory references', () => {
    expect(formatDisplayPath('')).toBe('(root)');
    expect(formatDisplayPath('.')).toBe('(root)');
    expect(formatDisplayPath('./')).toBe('(root)');
  });

  it('should handle edge cases', () => {
    // Path that starts with . but not ./
    expect(formatDisplayPath('.hidden-file')).toBe('.hidden-file');
    expect(formatDisplayPath('.config/settings.json')).toBe('.config/settings.json');

    // Path with ./ in the middle
    expect(formatDisplayPath('src/./utils.ts')).toBe('src/./utils.ts');
  });
});

describe('validateRelativePath', () => {
  it('should accept valid relative paths', () => {
    expect(() => validateRelativePath('./src/index.ts')).not.toThrow();
    expect(() => validateRelativePath('src/index.ts')).not.toThrow();
    expect(() => validateRelativePath('file.txt')).not.toThrow();
    expect(() => validateRelativePath('')).not.toThrow();
    expect(() => validateRelativePath('.')).not.toThrow();
    expect(() => validateRelativePath('./')).not.toThrow();
  });

  it('should accept SvelteKit route patterns', () => {
    // These should all be valid - they contain dots but no actual parent references
    expect(() => validateRelativePath('src/routes/mcp/[...rest]/+server.ts')).not.toThrow();
    expect(() => validateRelativePath('./src/routes/[id]/+page.svelte')).not.toThrow();
    expect(() => validateRelativePath('src/routes/[slug]/+layout.ts')).not.toThrow();
    expect(() => validateRelativePath('src/routes/(app)/[...catchall]/+page.svelte')).not.toThrow();
    expect(() => validateRelativePath('src/routes/[id]/edit/+page.server.ts')).not.toThrow();
    expect(() => validateRelativePath('components/[...props].svelte')).not.toThrow();
  });

  it('should accept paths with dots in filenames', () => {
    expect(() => validateRelativePath('file.name.with.dots.txt')).not.toThrow();
    expect(() => validateRelativePath('src/my.config.js')).not.toThrow();
    expect(() => validateRelativePath('.env.local')).not.toThrow();
    expect(() => validateRelativePath('.eslint...rc.js')).not.toThrow();
    expect(() => validateRelativePath('folder.with.dots/file.txt')).not.toThrow();
  });

  it('should reject actual parent directory references', () => {
    expect(() => validateRelativePath('../outside.txt')).toThrow(
      'Path cannot contain parent directory references'
    );
    expect(() => validateRelativePath('./src/../outside.txt')).toThrow(
      'Path cannot contain parent directory references'
    );
    expect(() => validateRelativePath('src/../../outside.txt')).toThrow(
      'Path cannot contain parent directory references'
    );
    expect(() => validateRelativePath('../')).toThrow(
      'Path cannot contain parent directory references'
    );
    expect(() => validateRelativePath('src/../')).toThrow(
      'Path cannot contain parent directory references'
    );
  });

  it('should reject paths that would escape the sandbox after normalization', () => {
    expect(() => validateRelativePath('src/subdir/../../../outside.txt')).toThrow(
      'Path cannot contain parent directory references'
    );
    expect(() => validateRelativePath('./folder/../..')).toThrow(
      'Path cannot contain parent directory references'
    );
  });

  it('should handle complex paths with mixed valid and invalid patterns', () => {
    // Valid: dots in filenames, not parent references
    expect(() => validateRelativePath('src/routes/[...rest]/+page.svelte')).not.toThrow();

    // Invalid: actual parent reference mixed with SvelteKit syntax
    expect(() => validateRelativePath('src/routes/../[...rest]/+page.svelte')).toThrow(
      'Path cannot contain parent directory references'
    );
  });
});

describe('resolveSafePath', () => {
  let rootDir: string;
  let outsideDir: string;

  beforeEach(async () => {
    // Resolve symlinks in the temp dir itself (e.g. /var -> /private/var on macOS)
    rootDir = await fs.realpath(await mkdtemp(path.join(tmpdir(), 'coco-test-root-')));
    outsideDir = await fs.realpath(await mkdtemp(path.join(tmpdir(), 'coco-test-outside-')));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await rm(outsideDir, { recursive: true, force: true });
  });

  it('should resolve existing and not-yet-existing paths inside the root', async () => {
    await fs.mkdir(path.join(rootDir, 'src'));

    expect(await resolveSafePath('./src', rootDir)).toBe(path.join(rootDir, 'src'));
    expect(await resolveSafePath('src/new/file.ts', rootDir)).toBe(
      path.join(rootDir, 'src', 'new', 'file.ts')
    );
    expect(await resolveSafePath('', rootDir)).toBe(rootDir);
  });

  it('should reject parent directory references', async () => {
    await expect(resolveSafePath('../outside.txt', rootDir)).rejects.toThrow(
      'Path cannot contain parent directory references'
    );
  });

  describePosix('symlinks', () => {
    it('should reject a symlinked directory that leads outside the root', async () => {
      await fs.symlink(outsideDir, path.join(rootDir, 'escape'));

      await expect(resolveSafePath('escape', rootDir)).rejects.toThrow(
        'Path leads outside the root directory through a symlink'
      );
      await expect(resolveSafePath('escape/new-file.txt', rootDir)).rejects.toThrow(
        'Path leads outside the root directory through a symlink'
      );
    });

    it('should reject a symlinked file that leads outside the root', async () => {
      await fs.writeFile(path.join(outsideDir, 'secret.txt'), 'secret');
      await fs.symlink(path.join(outsideDir, 'secret.txt'), path.join(rootDir, 'secret.txt'));

      await expect(resolveSafePath('secret.txt', rootDir)).rejects.toThrow(
        'Path leads outside the root directory through a symlink'
      );
    });

    it('should resolve a symlink that stays inside the root to its target', async () => {
      await fs.mkdir(path.join(rootDir, 'real'));
      await fs.symlink(path.join(rootDir, 'real'), path.join(rootDir, 'alias'));

      expect(await resolveSafePath('alias/file.ts', rootDir)).toBe(
        path.join(rootDir, 'real', 'file.ts')
      );
    });

    it('should return the link itself when not following the final symlink', async () => {
      await fs.symlink(outsideDir, path.join(rootDir, 'escape'));

      expect(await resolveSafePath('escape', rootDir, { followFinalSymlink: false })).toBe(
        path.join(rootDir, 'escape')
      );
      // Symlinks before the last segment are still checked
      await expect(
        resolveSafePath('escape/file.txt', rootDir, { followFinalSymlink: false })
      ).rejects.toThrow('Path leads outside the root directory through a symlink');
    });

    it('should reject a path through a broken symlink', async () => {
      await fs.symlink(path.join(outsideDir, 'missing'), path.join(rootDir, 'dangling'));

      await expect(resolveSafePath('dangling/file.txt', rootDir)).rejects.toThrow(
        'Path goes through a broken symlink'
      );
    });

    it('should accept a root directory that is itself reached through a symlink', async () => {
      const linkedRoot = path.join(outsideDir, 'linked-root');
      await fs.symlink(rootDir, linkedRoot);

      expect(await resolveSafePath('file.txt', linkedRoot)).toBe(path.join(rootDir, 'file.txt'));
    });
  });
});

describe('getIgnoreFile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'coco-test-ignore-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should return .cocoignore when it exists', async () => {
    const cocoignorePath = path.join(tempDir, '.cocoignore');
    await fs.writeFile(cocoignorePath, 'test\n*.log');

    const result = await getIgnoreFile(tempDir);
    expect(result).toBe('.cocoignore');
  });

  it('should return undefined when .cocoignore does not exist', async () => {
    const result = await getIgnoreFile(tempDir);
    expect(result).toBeUndefined();
  });
});

describe('getMinifyFile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'coco-test-minify-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should return .cocominify when it exists', async () => {
    const cocominifyPath = path.join(tempDir, '.cocominify');
    await fs.writeFile(cocominifyPath, '*.min.js\ndist/*');

    const result = await getMinifyFile(tempDir);
    expect(result).toBe('.cocominify');
  });

  it('should return undefined when .cocominify does not exist', async () => {
    const result = await getMinifyFile(tempDir);
    expect(result).toBeUndefined();
  });
});

describe('getMinifyFileDescription', () => {
  let originalMode: string | undefined;

  beforeEach(() => {
    originalMode = process.env.CONTEXT_CODER_MODE;
  });

  afterEach(() => {
    if (originalMode !== undefined) {
      process.env.CONTEXT_CODER_MODE = originalMode;
    } else {
      delete process.env.CONTEXT_CODER_MODE;
    }
  });

  it('should return correct minify description with read_file instruction', () => {
    const metadata = {
      displayPath: 'src/large-file.js',
      filePath: '/full/path/to/src/large-file.js',
      extension: 'js',
      fileType: 'JavaScript',
    };

    const result = getMinifyFileDescription(metadata);

    expect(result).toContain('# src/large-file.js');
    expect(result).toContain('This file has been minified to save tokens');
    expect(result).toContain(
      'You can use the read_file tool to read the actual content if necessary'
    );
    expect(result).toContain('The file exists at the above location');
  });

  it('should not mention read_file in mini mode, which has no such tool', () => {
    process.env.CONTEXT_CODER_MODE = 'mini';
    const metadata = {
      displayPath: 'src/large-file.js',
      filePath: '/full/path/to/src/large-file.js',
      extension: 'js',
      fileType: 'JavaScript',
    };

    const result = getMinifyFileDescription(metadata);

    expect(result).toContain('This file has been minified to save tokens');
    expect(result).not.toContain('read_file');
    expect(result).toContain('your own file tools');
  });

  it('should handle different file paths correctly', () => {
    const metadata = {
      displayPath: 'dist/bundle.min.css',
      filePath: '/project/dist/bundle.min.css',
      extension: 'css',
      fileType: 'CSS',
    };

    const result = getMinifyFileDescription(metadata);

    expect(result).toContain('# dist/bundle.min.css');
    expect(result).toMatch(/^# dist\/bundle\.min\.css\n\n/);
  });
});
