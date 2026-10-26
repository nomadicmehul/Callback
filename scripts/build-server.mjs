#!/usr/bin/env node
// Bundles the Node-side entry points (server, terminal UI, plugin MCP server)
// into dist/ so the published package runs with plain `node` — no tsx, no
// TypeScript at runtime. Dependencies stay external (pdfkit/unpdf ship data
// files next to their own code), only Callback's own source is bundled, and
// the `@shared/*` alias is resolved from tsconfig.json.
import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const dir of ['dist/server', 'dist/tui']) rmSync(path.join(root, dir), { recursive: true, force: true });
rmSync(path.join(root, 'dist/mcp-stdio.mjs'), { force: true });

await build({
  absWorkingDir: root,
  entryPoints: [
    { in: 'src/server/index.ts', out: 'server/index' },
    { in: 'src/tui/index.tsx', out: 'tui/index' },
    { in: 'src/mcp-stdio.ts', out: 'mcp-stdio' },
  ],
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  target: 'node22',
  tsconfig: 'tsconfig.json',
  jsx: 'automatic',
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
});

console.log('  bundled server, tui and mcp-stdio → dist/');
