#!/usr/bin/env node

import { readFileSync } from 'node:fs';

// Inject only the bounded main-session bootstrap. Detailed workflow contracts remain in
// their native Skill and Agent assets; the hook does not scan the project or create state.
const bootstrap = readFileSync(new URL('../skills/guide/SKILL.md', import.meta.url), 'utf8')
  .replace(/^---[\s\S]*?---\n/, '')
  .trim();
const context = `<EXTREMELY-IMPORTANT>\nYou are using oec-dev in the Main Session. Apply the following scoped bootstrap:\n\n${bootstrap}\n</EXTREMELY-IMPORTANT>`;

process.stdout.write(`${JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: context,
  },
})}\n`);
