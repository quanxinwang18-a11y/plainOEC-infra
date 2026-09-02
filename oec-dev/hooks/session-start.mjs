#!/usr/bin/env node

import { readFileSync } from 'node:fs';

// The bootstrap Skill is injected at session start so the model receives the
// same mandatory process before it can choose a domain Skill or edit code.
// Detailed workflow contracts remain in their native Skill and Agent assets.
const bootstrap = readFileSync(new URL('../skills/using-oec-dev/SKILL.md', import.meta.url), 'utf8').trim();
const context = `<EXTREMELY-IMPORTANT>\nYou are using oec-dev. The following bootstrap governs Skill discovery and task handling:\n\n${bootstrap}\n</EXTREMELY-IMPORTANT>`;

process.stdout.write(`${JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: context,
  },
})}\n`);
