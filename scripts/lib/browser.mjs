import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

export async function launchTestBrowser() {
  const candidates = [process.env.CRAFTAIB_CHROMIUM_PATH, chromium.executablePath()];
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const cache = join(process.env.LOCALAPPDATA, 'ms-playwright');
    if (existsSync(cache)) {
      for (const version of readdirSync(cache).filter((name) => name.startsWith('chromium_headless_shell-')).sort().reverse()) {
        candidates.push(join(cache, version, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'));
      }
    }
  }
  const executablePath = candidates.find((path) => path && existsSync(path));
  if (!executablePath) throw new Error('Chromium is missing. Run npm run setup:browser or set CRAFTAIB_CHROMIUM_PATH.');
  return chromium.launch({ headless: true, executablePath, args: ['--use-gl=swiftshader'] });
}

export const previewUrl = process.env.CRAFTAIB_PREVIEW_URL || 'http://127.0.0.1:4183/';
