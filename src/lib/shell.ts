import { existsSync } from 'fs';

const MACOS_ZSH = '/bin/zsh';

// Run zsh as a POSIX sh: words split and unmatched globs pass through like in sh, while
// [[ ]] and $'...' keep working. Brace expansion is turned back on (sh emulation disables it)
// because macOS's /bin/sh, which this replaces, supports it. `+o rcs` skips the user's startup
// files. Options must be long names: in sh emulation, single letters take their sh meanings
// (e.g. -f is noglob, not "no startup files").
const ZSH_SH_ARGS = ['--emulate', 'sh', '+o', 'rcs', '+o', 'ignorebraces'];

/** The shell execute_command runs command lines with. */
export type ShellChoice =
  /** Node's default: /bin/sh on POSIX, cmd.exe (ComSpec) on Windows */
  | { kind: 'system'; label: string }
  /** A shell set with COCO_SHELL, started the way Node starts shells */
  | { kind: 'custom'; label: string; path: string }
  /** zsh emulating sh, used on macOS */
  | { kind: 'zsh-sh'; label: string; path: string };

export interface ResolveShellOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  fileExists?: (filePath: string) => boolean;
}

/**
 * Pick the shell for execute_command:
 * 1. COCO_SHELL, when set
 * 2. On macOS, zsh emulating sh. macOS's /bin/sh is bash 3.2, which mis-parses quotes in a
 *    here-document inside $(...), so `git commit -m "$(cat <<'EOF' ...)"` fails whenever the
 *    message contains an apostrophe.
 * 3. Otherwise Node's default shell (/bin/sh, or cmd.exe on Windows)
 */
export function resolveShell({
  platform = process.platform,
  env = process.env,
  fileExists = existsSync,
}: ResolveShellOptions = {}): ShellChoice {
  const customShell = env.COCO_SHELL?.trim();
  if (customShell) {
    return { kind: 'custom', label: customShell, path: customShell };
  }

  if (platform === 'darwin' && fileExists(MACOS_ZSH)) {
    return {
      kind: 'zsh-sh',
      label:
        "zsh emulating sh (POSIX sh syntax, plus [[ ]], {a,b} brace expansion and $'...' quoting)",
      path: MACOS_ZSH,
    };
  }

  return { kind: 'system', label: platform === 'win32' ? 'cmd.exe' : '/bin/sh' };
}

/** How to spawn a command line: spawn(file, args, { shell }) */
export interface ShellInvocation {
  file: string;
  args: string[];
  shell: boolean | string;
}

export function getShellInvocation(choice: ShellChoice, command: string): ShellInvocation {
  switch (choice.kind) {
    case 'system':
      return { file: command, args: [], shell: true };
    case 'custom':
      // Node runs a custom shell as `<shell> -c <command>` (`/d /s /c` for cmd.exe)
      return { file: command, args: [], shell: choice.path };
    case 'zsh-sh':
      return { file: choice.path, args: [...ZSH_SH_ARGS, '-c', command], shell: false };
  }
}
