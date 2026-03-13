#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tsx = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
const viewer = join(__dirname, '..', 'src', 'viewer.jsx');

const result = spawnSync(tsx, [viewer], { stdio: 'inherit' });
process.exit(result.status ?? 0);
