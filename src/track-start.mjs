#!/usr/bin/env node
/**
 * Claude Code hook: UserPromptSubmit
 * Appends a "start" record to the tracking CSV.
 * Receives JSON on stdin from Claude Code.
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { basename } from 'path';
import { homedir } from 'os';
import { join } from 'path';

const TRACKING_DIR = join(homedir(), '.claude', 'tracking');
const CSV_FILE = join(TRACKING_DIR, 'sessions.csv');
const CSV_HEADER = 'session_id,event_type,timestamp,date,project,prompt,source\n';

function csvQuote(str) {
  const s = String(str ?? '')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .substring(0, 300);
  return `"${s.replace(/"/g, '""')}"`;
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const sessionId = data.session_id ?? '';
    if (!sessionId) process.exit(0); // skip unidentifiable sessions
    const cwd = data.cwd ?? process.cwd();
    const prompt = data.prompt ?? '';
    const source = data.source ?? 'claude-code';
    const project = basename(cwd);

    const now = new Date();
    const timestamp = now.toISOString();
    const date = timestamp.slice(0, 10);

    if (!existsSync(TRACKING_DIR)) {
      mkdirSync(TRACKING_DIR, { recursive: true });
    }
    if (!existsSync(CSV_FILE)) {
      writeFileSync(CSV_FILE, CSV_HEADER);
    }

    const row = [
      csvQuote(sessionId),
      csvQuote('start'),
      csvQuote(timestamp),
      csvQuote(date),
      csvQuote(project),
      csvQuote(prompt),
      csvQuote(source),
    ].join(',') + '\n';

    appendFileSync(CSV_FILE, row);
  } catch {
    // Never block Claude on tracking errors
  }
  process.exit(0);
});
