import { ExecuteCommandArgsSchema } from '../schemas.js';
import type { HandlerContext, HandlerResponse, ToolInput } from '../types.js';
import { spawn } from 'child_process';
import logger from '../logger.js';

export async function handleExecuteCommand(
  args: ToolInput,
  context: HandlerContext
): Promise<HandlerResponse> {
  const parsed = ExecuteCommandArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for execute_command: ${parsed.error}`);
  }

  logger.info(`⚡ execute_command handler started: ${parsed.data.command}`);

  // Parse the command string into command and args
  const commandParts = parsed.data.command.trim().split(/\s+/);
  const command = commandParts[0];
  const commandArgs = commandParts.slice(1);

  // Merge environment variables
  const env = {
    ...process.env,
    ...parsed.data.env,
  };

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const errorChunks: Buffer[] = [];

    // Spawn the child process
    const child = spawn(command, commandArgs, {
      cwd: context.absoluteRootDir,
      env,
      shell: false, // Use false for security - prevents shell injection
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
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
      clearTimeout(timeoutId);

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

      const result: HandlerResponse = {
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
      clearTimeout(timeoutId);
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
