import { ExecuteCommandArgsSchema } from '../schemas.js';
import { HandlerContext, HandlerResponse } from '../types.js';
import { CappedOutput } from '../lib/capped-output.js';
import { COMMAND_OUTPUT_HEAD_BYTES, COMMAND_OUTPUT_TAIL_BYTES } from '../constants.js';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import logger from '../logger.js';

const isWindows = process.platform === 'win32';

// Commands that are still running, so they can be killed when the server shuts down.
// On POSIX they run in their own process group (`detached: true`), which means a Ctrl-C
// or SIGHUP sent to the server's group no longer reaches them on its own.
const runningCommands = new Set<ChildProcess>();

// Kill the command together with everything it spawned. The command runs through a
// shell, so killing only the direct child would leave grandchildren (e.g. `sleep`)
// alive and holding stdout open, which keeps 'close' from ever firing.
// `sync` waits for taskkill on Windows; use it when the process is about to exit.
function killProcessTree(child: ChildProcess, signal: NodeJS.Signals, sync = false): void {
  if (child.pid === undefined) {
    return;
  }

  const killDirectChild = () => {
    try {
      child.kill(signal);
    } catch {
      // Ignore - process already exited
    }
  };

  if (isWindows) {
    // taskkill /T kills the whole tree; there are no POSIX signals to forward.
    // Fall back to killing the direct child if taskkill is missing or fails.
    const taskkillArgs = ['/pid', String(child.pid), '/T', '/F'];
    if (sync) {
      const result = spawnSync('taskkill', taskkillArgs, { stdio: 'ignore', windowsHide: true });
      if (result.error || result.status !== 0) {
        killDirectChild();
      }
      return;
    }

    let fellBack = false;
    const fallback = () => {
      if (!fellBack) {
        fellBack = true;
        killDirectChild();
      }
    };
    const taskkill = spawn('taskkill', taskkillArgs, { stdio: 'ignore', windowsHide: true });
    taskkill.on('error', fallback);
    taskkill.on('exit', (code) => {
      if (code !== 0) {
        fallback();
      }
    });
    return;
  }

  try {
    // Negative pid targets the process group created by `detached: true`
    process.kill(-child.pid, signal);
  } catch {
    // Group already gone or not signalable - fall back to the direct child
    killDirectChild();
  }
}

/**
 * Kill every command started by execute_command that is still running, including the
 * processes they started. Call this when the server shuts down so commands are not
 * left running as orphans. Safe to call more than once.
 */
export function killAllRunningCommands(): void {
  for (const child of runningCommands) {
    killProcessTree(child, 'SIGKILL', true);
  }
  runningCommands.clear();
}

/** Number of execute_command commands that are currently running. */
export function getRunningCommandCount(): number {
  return runningCommands.size;
}

export async function handleExecuteCommand(
  args: unknown,
  context: HandlerContext
): Promise<HandlerResponse> {
  const parsed = ExecuteCommandArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for execute_command: ${parsed.error}`);
  }

  logger.info(`⚡ execute_command handler started: ${parsed.data.command}`);

  // Merge environment variables
  const env = {
    ...process.env,
    ...parsed.data.env,
  };

  return new Promise((resolve) => {
    // Keep the start and end of each stream; the middle of a huge output is dropped
    const stdoutOutput = new CappedOutput(COMMAND_OUTPUT_HEAD_BYTES, COMMAND_OUTPUT_TAIL_BYTES);
    const stderrOutput = new CappedOutput(COMMAND_OUTPUT_HEAD_BYTES, COMMAND_OUTPUT_TAIL_BYTES);

    let finished = false;
    let timedOut = false;
    let killTimeoutId: NodeJS.Timeout | undefined;

    // Run the command line through the system shell (/bin/sh on POSIX, cmd.exe on Windows)
    // so quoting, pipes, &&, redirects, globs and $VAR expansion behave as callers expect.
    // This tool exists to run arbitrary caller-supplied commands, so the shell adds no new
    // capability - path restrictions do not apply here either way.
    // On POSIX, `detached: true` puts the shell in its own process group so the timeout can
    // kill it together with any processes it started.
    const child = spawn(parsed.data.command, {
      cwd: context.absoluteRootDir,
      env,
      shell: true,
      detached: !isWindows,
      // No stdin: a command that reads input gets end-of-file instead of waiting for the timeout
      stdio: ['ignore', 'pipe', 'pipe'],
      // Don't open a console window for the command on Windows
      windowsHide: true,
    });
    runningCommands.add(child);

    // Set up timeout
    const timeoutId = setTimeout(() => {
      timedOut = true;
      killProcessTree(child, 'SIGTERM');
      killTimeoutId = setTimeout(() => {
        if (!finished) {
          killProcessTree(child, 'SIGKILL');
        }
      }, 5000); // Give 5 seconds for graceful shutdown
    }, parsed.data.timeout);

    child.stdout.on('data', (data: Buffer) => {
      stdoutOutput.push(data);
    });

    child.stderr.on('data', (data: Buffer) => {
      stderrOutput.push(data);
    });

    // Handle process exit
    child.on('close', (code, signal) => {
      finished = true;
      runningCommands.delete(child);
      clearTimeout(timeoutId);
      clearTimeout(killTimeoutId);

      const stdout = stdoutOutput.toString();
      const stderr = stderrOutput.toString();

      let output = '';

      if (stdout) {
        output += `=== stdout ===\n${stdout}\n`;
      }

      if (stderr) {
        output += `=== stderr ===\n${stderr}\n`;
      }

      output += `=== exit code: ${code ?? 'null'} ===`;

      if (signal) {
        output += `\n=== killed by signal: ${signal} ===`;
      }

      // The shell's own exit code can be 0 even after a timeout (e.g. a background job
      // kept stdout open after the shell exited), so report the timeout explicitly.
      if (timedOut) {
        output += `\n=== timed out after ${parsed.data.timeout}ms ===`;
      }

      const isError = code !== 0 || timedOut;
      const result = {
        content: [{ type: 'text', text: output.trim() }],
        isError,
      };

      if (timedOut) {
        logger.error(
          `⏱️ execute_command handler timed out after ${parsed.data.timeout}ms: ${parsed.data.command}`
        );
      } else if (code !== 0) {
        logger.error(
          `⏱️ execute_command handler finished with error: ${parsed.data.command} (exit code: ${code})`
        );
      } else {
        logger.info(
          `⏱️ execute_command handler finished: ${parsed.data.command} (exit code: ${code})`
        );
      }
      resolve(result);
    });

    // Handle spawn errors
    child.on('error', (error) => {
      finished = true;
      runningCommands.delete(child);
      clearTimeout(timeoutId);
      clearTimeout(killTimeoutId);
      logger.error(
        `⏱️ execute_command handler finished with spawn error: ${parsed.data.command} (${error.message})`
      );
      resolve({
        content: [{ type: 'text', text: `Failed to execute command: ${error.message}` }],
        isError: true,
      });
    });
  });
}
