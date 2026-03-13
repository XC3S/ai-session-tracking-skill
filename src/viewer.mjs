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
    })
    .filter(r => r.session_id); // drop empty session_id (duplicate noise from cursor firing cc hooks)

  // Group by session_id+source composite key to avoid collisions across tools
  const bySession = {};
  for (const r of records) {
    const key = `${r.session_id}::${r.source ?? ''}`;
    if (!bySession[key]) bySession[key] = { starts: [], ends: [] };
    if (r.event_type === 'start') bySession[key].starts.push(r);
    else if (r.event_type === 'end') bySession[key].ends.push(r);
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
        source: s.source ?? '',
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
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

const RULE = '─'.repeat(58);

// ─── Components ─────────────────────────────────────────────────────────────

function Header({ label, hasPrev, hasNext }) {
  return (
    <Box flexDirection="row" gap={1} justifyContent="center">
      <Text color={hasPrev ? 'cyan' : 'gray'}>{'◀'}</Text>
      <Text bold color="white"> {label} </Text>
      <Text color={hasNext ? 'cyan' : 'gray'}>{'▶'}</Text>
    </Box>
  );
}

function formatSource(src) {
  if (!src || src === 'claude-code') return 'cc';
  if (src === 'cursor') return 'cur';
  return src.substring(0, 4);
}

function SessionRow({ session }) {
  const time = formatTime(session.startTime);
  const dur = session.endTime
    ? formatDuration(session.durationSec)
    : null;
  const src = formatSource(session.source);
  const prompt = (session.prompt ?? '').trim().replace(/\s+/g, ' ').substring(0, 48);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row" gap={2}>
        <Text color="gray">{time.padEnd(8)}</Text>
        <Text color="cyan">{src.padEnd(4)}</Text>
        <Text color="green" bold>{session.project.substring(0, 22).padEnd(22)}</Text>
        {dur != null
          ? <Text color="yellow">{dur}</Text>
          : <Text color="magenta">active</Text>
        }
      </Box>
      {prompt ? (
        <Box>
          <Text color="gray">{'         '}</Text>
          <Text dimColor>{prompt}{session.prompt.length > 52 ? '…' : ''}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function Summary({ sessions }) {
  const completed = sessions.filter(s => s.durationSec != null);
  const totalSec = completed.reduce((acc, s) => acc + s.durationSec, 0);
  const active = sessions.length - completed.length;

  return (
    <Box marginTop={1} gap={2}>
      <Text color="gray">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</Text>
      {totalSec > 0 && <Text color="gray">· Total: <Text color="cyan">{formatDuration(totalSec)}</Text></Text>}
      {active > 0 && <Text color="magenta">· {active} active</Text>}
    </Box>
  );
}

function EmptyState() {
  return (
    <Box marginTop={2} flexDirection="column" alignItems="center">
      <Text dimColor>No sessions recorded for this day.</Text>
    </Box>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

function buildDates(sessions) {
  return [...new Set(sessions.map(s => s.date))].sort();
}

function App() {
  const today = new Date().toISOString().slice(0, 10);
  const [sessions, setSessions] = useState(() => loadSessions());
  const [dates, setDates] = useState(() => buildDates(loadSessions()));
  const todayIdx = dates.indexOf(today);
  const [idx, setIdx] = useState(todayIdx >= 0 ? todayIdx : dates.length - 1);

  const reload = useCallback(() => {
    const s = loadSessions();
    const d = buildDates(s);
    setSessions(s);
    setDates(d);
    const ti = d.indexOf(today);
    setIdx(ti >= 0 ? ti : d.length - 1);
  }, [today]);

  useInput((input, key) => {
    if (key.leftArrow) setIdx(i => Math.max(0, i - 1));
    if (key.rightArrow) setIdx(i => Math.min(dates.length - 1, i + 1));
    if (input === 'r') reload();
    if (input === 'q' || (key.ctrl && input === 'c')) process.exit(0);
  });

  if (dates.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Session Tracker</Text>
        <Box marginTop={1}>
          <Text dimColor>No sessions recorded yet. Start using Claude Code to track sessions.</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>CSV: </Text>
          <Text color="gray">{CSV_FILE}</Text>
        </Box>
      </Box>
    );
  }

  const currentDate = dates[idx];
  const daySessions = sessions.filter(s => s.date === currentDate);

  return (
    <Box flexDirection="column" padding={1}>
      <Header
        label={formatDateLabel(currentDate)}
        hasPrev={idx > 0}
        hasNext={idx < dates.length - 1}
      />

      <Text color="gray">{RULE}</Text>

      {daySessions.length === 0
        ? <EmptyState />
        : daySessions.map((s, i) => <SessionRow key={i} session={s} />)
      }

      {daySessions.length > 0 && (
        <>
          <Box marginTop={1}><Text color="gray">{RULE}</Text></Box>
          <Summary sessions={daySessions} />
        </>
      )}

      <Box marginTop={1}>
        <Text dimColor>{'← →'} navigate  ·  r reload  ·  q quit</Text>
      </Box>
    </Box>
  );
}

// ─── Entry ───────────────────────────────────────────────────────────────────

render(<App />);
