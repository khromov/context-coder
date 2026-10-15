import { ExecuteCommandArgsSchema } from '../schemas.js';
import { HandlerContext, HandlerResponse } from '../types.js';
import { spawn, ChildProcess } from 'child_process';
import logger from '../logger.js';

const isWindows = process.platform === 'win32';

// Kill the command together with everything it spawned. The command runs through a
// shell, so killing only the direct child would leave grandchildren (e.g. `sleep`)
// alive and holding stdout open, which keeps 'close' from ever firing.
function killProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) {
    return;
  }

  if (isWindows) {
    // taskkill /T kills the whole tree; there are no POSIX signals to forward
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).on(
      'error',
      () => child.kill(signal)
    );
    return;
  }

  try {
    // Negative pid targets the process group created by `detached: true`
    process.kill(-child.pid, signal);
  } catch {
    // Group already gone or not signalable - fall back to the direct child
    try {
      child.kill(signal);
    } catch {
      // Ignore - process already exited
    }
  }
}

export async function handleExecuteCommand(
  args: any,
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
    const chunks: Buffer[] = [];
    const errorChunks: Buffer[] = [];

    let finished = false;
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
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      killProcessTree(child, 'SIGTERM');
      killTimeoutId = setTimeout(() => {
        if (!finished) {
          killProcessTree(child, 'SIGKILL');
        }
      }, 5000); // Give 5 seconds for graceful shutdown
    }, parsed.data.timeout);

    // Collect stdout
    child.stdout.on('data', (data) => {
      chunks.push(data);
    });

    // Collect stderr
    child.stderr.on('data', (data) => {
      errorChunks.push(data);
    });

    // Handle process exit
    child.on('close', (code, signal) => {
      finished = true;
      clearTimeout(timeoutId);
      clearTimeout(killTimeoutId);

      const stdout = Buffer.concat(chunks).toString('utf-8');
      const stderr = Buffer.concat(errorChunks).toString('utf-8');

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

      const result = {
        content: [{ type: 'text', text: output.trim() }],
        isError: code !== 0,
      };

      if (code !== 0) {
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
