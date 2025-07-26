import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cachedVersion: string | null = null;

/**
 * Get the version from package.json
 * Caches the result for subsequent calls
 */
export async function getVersion(): Promise<string> {
  if (cachedVersion !== null) {
    return cachedVersion;
  }

  let version: string;
  
  try {
    const packageJsonPath = join(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    version = packageJson.version || '1.0.0';
  } catch (error) {
    // If package.json is not found, use a default version
    version = 'UNKNOWN';
  }

  cachedVersion = version;
  return version;
}
