#!/usr/bin/env node
/**
 * Tracking viewer — Ink-based TUI
 * Navigate days with ← → arrow keys, q to quit.
 */

import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import React, { useState, useCallback } from 'react';
import { render, Box, Text, useInput } from 'ink';

const CSV_FILE = join(homedir(), '.claude', 'tracking', 'sessions.csv');

// ─── CSV parsing ────────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const values = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      values.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  values.push(cur);
  return values;
}

function loadSessions() {
  if (!existsSync(CSV_FILE)) return [];

  const content = readFileSync(CSV_FILE, 'utf8');
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const records = lines.slice(1)
    .filter(l => l.trim())
    .map(l => {
      const vals = parseCSVLine(l);
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
    });

  // Group by session_id, pair starts with ends in order
  const bySession = {};
  for (const r of records) {
    const id = r.session_id;
    if (!bySession[id]) bySession[id] = { starts: [], ends: [] };
    if (r.event_type === 'start') bySession[id].starts.push(r);
    else if (r.event_type === 'end') bySession[id].ends.push(r);
  }

  const sessions = [];
  for (const { starts, ends } of Object.values(bySession)) {
    starts.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    ends.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    for (let i = 0; i < starts.length; i++) {
      const s = starts[i];
      const e = ends[i];
      const durationSec = e
        ? Math.round((new Date(e.timestamp) - new Date(s.timestamp)) / 1000)
        : null;
      sessions.push({
        date: s.date,
        project: s.project,
        prompt: s.prompt,
        source: s.source || 'claude-code',
        startTime: s.timestamp,
        endTime: e?.timestamp ?? null,
        durationSec,
      });
    }
  }

  sessions.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return sessions;
}

// ─── Formatting ─────────────────────────────────────────────────────────────

function formatDuration(sec) {
  if (sec == null) return null;
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

const rule = () => '─'.repeat(Math.min(process.stdout.columns || 80, 120));

// ─── Components ─────────────────────────────────────────────────────────────

function Header({ label, hasPrev, hasNext }) {
  return (
    <Box flexDirection="row" gap={1}>
      <Text color={hasPrev ? 'cyan' : 'gray'}>◀</Text>
      <Text bold color="white">{label}</Text>
      <Text color={hasNext ? 'cyan' : 'gray'}>▶</Text>
    </Box>
  );
}

const SOURCE_LABELS = {
  'claude-code': { label: 'claude', color: 'gray' },
  'cursor':      { label: 'cursor', color: 'blue' },
};

// col widths (chars): time=5 src=2 project=20 dur=8, gaps of 1 between = 35 + 3 = 38
const W = { time: 5, src: 6, project: 20, dur: 8 };

function SessionRow({ session }) {
  const cols = process.stdout.columns || 100;
  const promptWidth = Math.max(8, cols - W.time - W.src - W.project - W.dur - 4);

  const time = formatTime(session.startTime);
  const src = SOURCE_LABELS[session.source] ?? { label: (session.source ?? '??').slice(0, 2), color: 'gray' };
  const dur = session.endTime ? formatDuration(session.durationSec) : null;
  const durColor = dur != null ? 'yellow' : 'magenta';

  const raw = (session.prompt ?? '').trim().replace(/\s+/g, ' ');
  const prompt = raw.length > promptWidth ? raw.substring(0, promptWidth - 1) + '…' : raw;

  return (
    <Box flexDirection="row" width={cols}>
      <Box width={W.time + 1} flexShrink={0}><Text color="gray" wrap="truncate">{time}</Text></Box>
      <Box width={W.src + 1} flexShrink={0}><Text color={src.color} wrap="truncate">{src.label}</Text></Box>
      <Box width={W.project + 1} flexShrink={0}><Text color="green" bold wrap="truncate">{session.project}</Text></Box>
      <Box width={W.dur + 1} flexShrink={0}><Text color={durColor} wrap="truncate">{dur ?? 'active'}</Text></Box>
      <Text dimColor wrap="truncate">{prompt}</Text>
    </Box>
  );
}

function Summary({ sessions }) {
  const completed = sessions.filter(s => s.durationSec != null);
  const totalSec = completed.reduce((acc, s) => acc + s.durationSec, 0);
  const active = sessions.length - completed.length;

  return (
    <Box gap={2}>
      <Text color="gray">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</Text>
      {totalSec > 0 && <Text color="gray">total <Text color="cyan">{formatDuration(totalSec)}</Text></Text>}
      {active > 0 && <Text color="magenta">{active} active</Text>}
    </Box>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

function App() {
  const getToday = () => new Date().toISOString().slice(0, 10);

  const load = useCallback(() => {
    const s = loadSessions();
    const d = [...new Set(s.map(x => x.date))].sort();
    const today = getToday();
    const ti = d.indexOf(today);
    return { sessions: s, dates: d, idx: ti >= 0 ? ti : d.length - 1 };
  }, []);

  const [{ sessions, dates, idx }, setState] = useState(load);
  const setIdx = fn => setState(prev => ({ ...prev, idx: fn(prev.idx) }));

  const reload = useCallback(() => setState(load()), [load]);

  useInput((input, key) => {
    if (key.leftArrow) setIdx(i => Math.max(0, i - 1));
    if (key.rightArrow) setIdx(i => Math.min(dates.length - 1, i + 1));
    if (input === 'r') reload();
    if (input === 'q' || (key.ctrl && input === 'c')) process.exit(0);
  });

  if (dates.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Session Tracker</Text>
        <Text dimColor>No sessions yet · CSV: {CSV_FILE}</Text>
      </Box>
    );
  }

  const currentDate = dates[idx];
  const daySessions = sessions.filter(s => s.date === currentDate);

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Header label={formatDateLabel(currentDate)} hasPrev={idx > 0} hasNext={idx < dates.length - 1} />
        {daySessions.length > 0 && <Summary sessions={daySessions} />}
      </Box>
      <Text color="gray">{rule()}</Text>
      {daySessions.length === 0
        ? <Text dimColor>no sessions</Text>
        : daySessions.map((s, i) => <SessionRow key={i} session={s} />)
      }
      <Text color="gray">{rule()}</Text>
      <Text dimColor>← → days · r reload · q quit</Text>
    </Box>
  );
}

// ─── Entry ───────────────────────────────────────────────────────────────────

render(<App />);
