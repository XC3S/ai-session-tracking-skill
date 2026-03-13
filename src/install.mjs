#!/usr/bin/env node
/**
 * Installs tracking hooks into ~/.claude/settings.json and ~/.cursor/hooks.json
 * Safely merges with existing hooks (preserves peon-ping, etc.)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = join(homedir(), '.claude', 'settings.json');
const CURSOR_HOOKS_FILE = join(homedir(), '.cursor', 'hooks.json');

const TRACK_START = resolve(__dirname, 'track-start.mjs');
const TRACK_END = resolve(__dirname, 'track-end.mjs');
const CURSOR_ADAPTER = resolve(__dirname, 'cursor-adapter.sh');

function hookCommand(script) {
  return {
    type: 'command',
    command: `node ${script}`,
    timeout: 10,
    async: true,
  };
}

const NEW_HOOKS = {
  UserPromptSubmit: {
    matcher: '',
    hooks: [hookCommand(TRACK_START)],
  },
  Stop: {
    matcher: '',
    hooks: [hookCommand(TRACK_END)],
  },
};

// ─── Read existing settings ───────────────────────────────────────────────

let settings = {};
if (existsSync(SETTINGS_FILE)) {
  try {
    settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    console.error('Could not parse settings.json — aborting to avoid data loss.');
    process.exit(1);
  }
}

if (!settings.hooks) settings.hooks = {};

// ─── Check for existing tracking hooks ───────────────────────────────────

function alreadyInstalled(eventName) {
  const entries = settings.hooks[eventName] ?? [];
  return entries.some(entry =>
    (entry.hooks ?? []).some(h => h.command?.includes('track-start') || h.command?.includes('track-end'))
  );
}

let changed = false;

for (const [event, hookEntry] of Object.entries(NEW_HOOKS)) {
  if (alreadyInstalled(event)) {
    console.log(`✓ ${event}: tracking hook already installed`);
    continue;
  }
  if (!settings.hooks[event]) settings.hooks[event] = [];
  settings.hooks[event].push(hookEntry);
  console.log(`+ ${event}: tracking hook added`);
  changed = true;
}

// ─── Write back ──────────────────────────────────────────────────────────

if (changed) {
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n');
  console.log(`\n✅ Claude Code hooks installed. Restart Claude Code for changes to take effect.`);
} else {
  console.log('\nClaude Code hooks already installed.');
}

// ─── Cursor hooks ─────────────────────────────────────────────────────────

let cursor = { version: 1, hooks: {} };
if (existsSync(CURSOR_HOOKS_FILE)) {
  try {
    cursor = JSON.parse(readFileSync(CURSOR_HOOKS_FILE, 'utf8'));
  } catch {
    console.error('Could not parse ~/.cursor/hooks.json — skipping Cursor install.');
    cursor = null;
  }
}

if (cursor) {
  if (!cursor.hooks) cursor.hooks = {};

  const cursorEntries = [
    { event: 'beforeSubmitPrompt', command: `bash "${CURSOR_ADAPTER}" start` },
    { event: 'stop', command: `bash "${CURSOR_ADAPTER}" stop` },
  ];

  let cursorChanged = false;
  for (const { event, command } of cursorEntries) {
    if (!cursor.hooks[event]) cursor.hooks[event] = [];
    const already = cursor.hooks[event].some(h => h.command?.includes('cursor-adapter'));
    if (already) {
      console.log(`✓ Cursor ${event}: tracking hook already installed`);
    } else {
      cursor.hooks[event].push({ command, timeout: 10 });
      console.log(`+ Cursor ${event}: tracking hook added`);
      cursorChanged = true;
    }
  }

  if (cursorChanged) {
    writeFileSync(CURSOR_HOOKS_FILE, JSON.stringify(cursor, null, 2) + '\n');
    console.log(`✅ Cursor hooks installed. Restart Cursor for changes to take effect.`);
  }
}

console.log(`\n   CSV will be written to: ${join(homedir(), '.claude', 'tracking', 'sessions.csv')}`);
console.log(`\n   Run the viewer with:  npm run view  (in this directory)`);
console.log(`   Or globally after:     npm link  →  track`);
