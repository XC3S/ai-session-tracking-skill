#!/usr/bin/env node
/**
 * Claude Code hook: Stop
 * Appends an "end" record to the tracking CSV.
 * Receives JSON on stdin from Claude Code.
 */

import { appendFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const TRACKING_DIR = join(homedir(), '.claude', 'tracking');
const CSV_FILE = join(TRACKING_DIR, 'sessions.csv');

function csvQuote(str) {
  return `"${String(str ?? '').replace(/"/g, '""')}"`;
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    if (!existsSync(CSV_FILE)) process.exit(0);

    const data = JSON.parse(input);
    const sessionId = data.session_id ?? '';
    if (!sessionId) process.exit(0); // skip unidentifiable sessions
    const source = data.source ?? 'claude-code';

    const now = new Date();
    const timestamp = now.toISOString();
    const date = timestamp.slice(0, 10);

    const row = [
      csvQuote(sessionId),
      csvQuote('end'),
      csvQuote(timestamp),
      csvQuote(date),
      csvQuote(''),
      csvQuote(''),
      csvQuote(source),
    ].join(',') + '\n';

    appendFileSync(CSV_FILE, row);
  } catch {
    // Never block Claude on tracking errors
  }
  process.exit(0);
});
