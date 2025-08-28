import { spawn } from 'child_process';
import logger from '../logger.js';

export async function isGitAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('git', ['--version'], {
      shell: false,
      stdio: 'pipe',
    });

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      resolve(false);
    }, 5000);

    child.on('exit', (code) => {
      clearTimeout(timeoutId);
      resolve(code === 0);
    });

    child.on('error', () => {
      clearTimeout(timeoutId);
      resolve(false);
    });
  });
}

export async function isInsideGitRepository(cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      shell: false,
      stdio: 'pipe',
    });

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      resolve(false);
    }, 5000);

    child.on('exit', (code) => {
      clearTimeout(timeoutId);
      resolve(code === 0);
    });

    child.on('error', () => {
      clearTimeout(timeoutId);
      resolve(false);
    });
  });
}

export async function gitMove(source: string, destination: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const errorChunks: Buffer[] = [];

    const child = spawn('git', ['mv', source, destination], {
      cwd,
      shell: false,
      stdio: 'pipe',
    });

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
      reject(new Error('Git mv command timed out'));
    }, 5000);

    child.stdout.on('data', (data) => {
      chunks.push(data);
    });

    child.stderr.on('data', (data) => {
      errorChunks.push(data);
    });

    child.on('exit', (code) => {
      clearTimeout(timeoutId);

      const stdout = Buffer.concat(chunks).toString('utf8');
      const stderr = Buffer.concat(errorChunks).toString('utf8');

      if (code === 0) {
        logger.debug(`🎯 git mv successful: ${source} -> ${destination}`);
        resolve();
      } else {
        const error = stderr || stdout || `Git mv failed with exit code ${code}`;
        logger.debug(`❌ git mv failed: ${error}`);
        reject(new Error(`Git mv failed: ${error}`));
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      logger.debug(`❌ git mv error: ${error.message}`);
      reject(new Error(`Git mv error: ${error.message}`));
    });
  });
}
