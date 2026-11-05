import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

export async function launchTestBrowser() {
  const options = { headless: true, args: ['--use-gl=swiftshader'] };
  const configuredPath = process.env.CRAFTAIB_CHROMIUM_PATH?.trim();
  if (configuredPath) {
    if (!existsSync(configuredPath)) throw new Error(`CRAFTAIB_CHROMIUM_PATH does not exist: ${configuredPath}`);
    return chromium.launch({ ...options, executablePath: configuredPath });
  }

  try {
    // Playwright resolves its platform-specific headless shell, including --only-shell installs.
    return await chromium.launch(options);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Executable doesn't exist")) throw error;
    const executablePath = cachedBrowserPath();
    if (!executablePath) throw new Error('Chromium is missing. Run npm run setup:browser or set CRAFTAIB_CHROMIUM_PATH.', { cause: error });
    return chromium.launch({ ...options, executablePath });
  }
}

function cachedBrowserPath() {
  const candidates = [chromium.executablePath()];
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const cache = join(process.env.LOCALAPPDATA, 'ms-playwright');
    if (existsSync(cache)) {
      for (const version of readdirSync(cache).filter((name) => name.startsWith('chromium_headless_shell-')).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
        candidates.push(join(cache, version, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'));
      }
    }
  }
  return candidates.find((path) => path && existsSync(path));
}

export const previewUrl = process.env.CRAFTAIB_PREVIEW_URL || 'http://127.0.0.1:4183/';
