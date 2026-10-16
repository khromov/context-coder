import { describe, it, expect } from '@jest/globals';
import { resolveShell, getShellInvocation } from '../lib/shell.js';

const exists = () => true;
const missing = () => false;

describe('resolveShell', () => {
  it('should use zsh emulating sh on macOS, where /bin/sh is bash 3.2', () => {
    const shell = resolveShell({ platform: 'darwin', env: {}, fileExists: exists });

    expect(shell.kind).toBe('zsh-sh');
    expect(shell.label).toContain('zsh emulating sh');
  });

  it('should fall back to /bin/sh on macOS without /bin/zsh', () => {
    const shell = resolveShell({ platform: 'darwin', env: {}, fileExists: missing });

    expect(shell).toEqual({ kind: 'system', label: '/bin/sh' });
  });

  it('should use /bin/sh on Linux and cmd.exe on Windows', () => {
    expect(resolveShell({ platform: 'linux', env: {}, fileExists: exists })).toEqual({
      kind: 'system',
      label: '/bin/sh',
    });
    expect(resolveShell({ platform: 'win32', env: {}, fileExists: exists })).toEqual({
      kind: 'system',
      label: 'cmd.exe',
    });
  });

  it('should use COCO_SHELL on any platform when it is set', () => {
    for (const platform of ['darwin', 'linux', 'win32'] as const) {
      expect(
        resolveShell({ platform, env: { COCO_SHELL: ' /usr/bin/bash ' }, fileExists: exists })
      ).toEqual({ kind: 'custom', label: '/usr/bin/bash', path: '/usr/bin/bash' });
    }
  });

  it('should ignore an empty COCO_SHELL', () => {
    const shell = resolveShell({
      platform: 'linux',
      env: { COCO_SHELL: '  ' },
      fileExists: exists,
    });

    expect(shell.kind).toBe('system');
  });
});

describe('getShellInvocation', () => {
  it("should leave the system shell to Node's shell option", () => {
    expect(getShellInvocation({ kind: 'system', label: '/bin/sh' }, 'ls -la')).toEqual({
      file: 'ls -la',
      args: [],
      shell: true,
    });
  });

  it('should pass a custom shell to Node as the shell to use', () => {
    const invocation = getShellInvocation(
      { kind: 'custom', label: '/usr/bin/bash', path: '/usr/bin/bash' },
      'ls -la'
    );

    expect(invocation).toEqual({ file: 'ls -la', args: [], shell: '/usr/bin/bash' });
  });

  it('should run zsh in sh emulation, without startup files, with the command last', () => {
    const invocation = getShellInvocation(
      { kind: 'zsh-sh', label: 'zsh', path: '/bin/zsh' },
      'echo hi'
    );

    expect(invocation.file).toBe('/bin/zsh');
    expect(invocation.shell).toBe(false);
    expect(invocation.args).toEqual([
      '--emulate',
      'sh',
      '+o',
      'rcs',
      '+o',
      'ignorebraces',
      '-c',
      'echo hi',
    ]);
  });

  it('should not use single-letter options, which mean something else in sh emulation', () => {
    const invocation = getShellInvocation(
      { kind: 'zsh-sh', label: 'zsh', path: '/bin/zsh' },
      'echo hi'
    );

    // e.g. -f is "no startup files" in zsh but noglob in sh emulation
    expect(invocation.args.slice(0, -2).filter((arg) => /^-[a-z]$/.test(arg))).toEqual([]);
  });
});
