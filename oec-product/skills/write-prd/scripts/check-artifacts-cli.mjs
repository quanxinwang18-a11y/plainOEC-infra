#!/usr/bin/env node

import { checkArtifacts } from '../../../../packages/prd-artifact-contract/check-artifacts.mjs';

const VERSION_PATTERN = /^v\d+\.\d+\.\d+$/;
const STAGES = new Set(['finalize', 'pre-publish']);

function parseArgs(argv) {
  const args = { workspace: process.cwd(), stage: 'finalize', json: false, strictWarnings: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--workspace') args.workspace = argv[++index];
    else if (token === '--version') args.version = argv[++index];
    else if (token === '--stage') args.stage = argv[++index];
    else if (token === '--json') args.json = true;
    else if (token === '--strict-warnings') args.strictWarnings = true;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!STAGES.has(args.stage)) throw new Error(`Invalid --stage: ${args.stage}`);
  if (!args.workspace) throw new Error('--workspace requires a value');
  if (args.version && !VERSION_PATTERN.test(args.version)) throw new Error(`Invalid --version: ${args.version}`);
  return args;
}

function usage() {
  return 'Usage: check-artifacts.mjs --workspace <path> [--version vX.Y.Z] --stage finalize|pre-publish [--json] [--strict-warnings]\n';
}

function renderHuman(result) {
  const lines = [
    `oec-prd-check: ${result.ok ? 'pass' : 'fail'}`,
    `stage: ${result.stage}`,
    `version: ${result.version ?? '<none>'}`,
  ];
  for (const [label, entries] of [['errors', result.errors], ['warnings', result.warnings]]) {
    if (entries.length === 0) continue;
    lines.push(`${label}:`);
    for (const entry of entries) lines.push(`- [${entry.code}] ${entry.path ? `${entry.path}: ` : ''}${entry.message}`);
  }
  return `${lines.join('\n')}\n`;
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n${usage()}`);
  process.exit(2);
}
if (args.help) {
  process.stdout.write(usage());
} else {
  try {
    const result = checkArtifacts(args);
    process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : renderHuman(result));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    process.stderr.write(`Unable to check artifacts: ${error.message}\n`);
    process.exit(2);
  }
}
