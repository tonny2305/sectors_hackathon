import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

it('ignores env variants while tracking a names-only template', () => {
  const ignored = execFileSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`,
    'check-ignore', '--no-index', '.env', '.env.local', '.env.production', 'preflight_output/filings_raw.json'], { encoding: 'utf8' });
  for (const path of ['.env', '.env.local', '.env.production', 'preflight_output/filings_raw.json']) expect(ignored).toContain(path);
  const example = readFileSync('.env.example', 'utf8').trim().split(/\r?\n/);
  expect(example.every(line => /^[A-Z_]+=\s*$/.test(line))).toBe(true);
});

it('keeps credentials in guarded server modules and out of app code', () => {
  for (const file of ['lib/sectors/client.ts', 'lib/db/store.ts', 'scripts/ingest.ts', 'lib/automation/monitor.ts', 'lib/materiality/engine.ts']) {
    expect(readFileSync(file, 'utf8')).toContain("import 'server-only'");
  }
  const appFiles = readdirSync('app', { recursive: true, withFileTypes: true })
    .filter(dirent => dirent.isFile())
    .map(dirent => join((dirent as unknown as { parentPath?: string; path?: string }).parentPath || 'app', dirent.name));

  for (const file of appFiles) {
    const content = readFileSync(file, 'utf8');
    // Ensure server secrets are never imported or referenced in client components
    if (content.includes("'use client'") || content.includes('"use client"')) {
      expect(content).not.toMatch(/SECTORS_API_KEY|SUPABASE_SERVICE_ROLE_KEY/);
    }
  }
  expect(readFileSync('.env.example', 'utf8')).not.toMatch(/NEXT_PUBLIC_.*(?:SECTORS|SERVICE_ROLE)/);
});

it('blocks importing the data client without the server condition', () => {
  expect(() => execFileSync(process.execPath, ['--input-type=module', '-e', "import './lib/sectors/client.ts'"],
    { stdio: 'pipe', env: { ...process.env, NODE_OPTIONS: '' } })).toThrow();
});
