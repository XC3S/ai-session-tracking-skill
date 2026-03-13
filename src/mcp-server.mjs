#!/usr/bin/env node
/**
 * MCP server for Cursor integration.
 * Exposes track_start / track_end tools that write to the shared CSV.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { basename, dirname } from 'path';

const TRACKING_DIR = join(homedir(), '.claude', 'tracking');
const CSV_FILE = join(TRACKING_DIR, 'sessions.csv');
const CSV_HEADER = 'session_id,event_type,timestamp,date,project,prompt,source\n';

function csvQuote(str) {
  const s = String(str ?? '').replace(/\n/g, ' ').replace(/\r/g, '').substring(0, 300);
  return `"${s.replace(/"/g, '""')}"`;
}

function writeRow(fields) {
  if (!existsSync(TRACKING_DIR)) mkdirSync(TRACKING_DIR, { recursive: true });
  if (!existsSync(CSV_FILE)) writeFileSync(CSV_FILE, CSV_HEADER);
  appendFileSync(CSV_FILE, fields.map(csvQuote).join(',') + '\n');
}

const server = new Server(
  { name: 'tracking-skill', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'track_start',
      description: 'Log the start of an AI session. Call at the beginning of every response.',
      inputSchema: {
        type: 'object',
        properties: {
          cwd:    { type: 'string', description: 'Full path to the workspace/project root' },
          prompt: { type: 'string', description: "The user's message (first ~200 chars)" },
        },
        required: ['cwd', 'prompt'],
      },
    },
    {
      name: 'track_end',
      description: 'Log the end of an AI session. Call at the very end of every response.',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'The session_id returned by track_start' },
        },
        required: ['session_id'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const now = new Date();
  const timestamp = now.toISOString();
  const date = timestamp.slice(0, 10);

  if (name === 'track_start') {
    const session_id = randomUUID();
    const cwd = args.cwd ?? '';
    const name_ = basename(cwd);
    const project = name_ === '.claude' ? basename(dirname(cwd)) : name_;
    writeRow([session_id, 'start', timestamp, date, project, args.prompt ?? '', 'cursor']);
    return { content: [{ type: 'text', text: session_id }] };
  }

  if (name === 'track_end') {
    writeRow([args.session_id, 'end', timestamp, date, '', '', 'cursor']);
    return { content: [{ type: 'text', text: 'ok' }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
