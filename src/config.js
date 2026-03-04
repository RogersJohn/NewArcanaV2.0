/**
 * Configuration loader for New Arcana (Node.js only — uses fs).
 * Re-exports pure config functions from config-core.js.
 */

import { readFileSync } from 'fs';
export { getDefaultConfig, mergeConfig, deepMerge } from './config-core.js';
import { mergeConfig } from './config-core.js';

/**
 * Load a config file from disk and merge with defaults.
 * @param {string} filePath - Path to JSON config file
 * @returns {object} Merged config
 */
export function loadConfig(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const userConfig = JSON.parse(raw);
  return mergeConfig(userConfig);
}
