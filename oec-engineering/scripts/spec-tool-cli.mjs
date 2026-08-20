#!/usr/bin/env node

import { auditLegacyInstallation, checkTeamSpecs, selectTeamSpecs } from './spec-tool.mjs';

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = { command, paths: [], format: 'text' };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--workspace') options.workspace = rest[++index];
    else if (argument === '--change') options.change = rest[++index];
    else if (argument === '--format') options.format = rest[++index];
    else if (argument === '--paths') {
      while (rest[index + 1] && !rest[index + 1].startsWith('--')) options.paths.push(rest[++index]);
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (!['text', 'json'].includes(options.format)) throw new Error('--format must be text or json');
  return options;
}

function textResult(command, result) {
  const lines = [`${command}: ${result.ok ? 'ok' : 'blocked'}`];
  if (command === 'select') {
    for (const spec of result.specs) lines.push(`- ${spec.id}: ${spec.path}`);
    if (result.specs.length === 0) lines.push('- no matching Specs');
  } else if (command === 'legacy-audit') {
    lines.push(`- manifest: ${result.installation ? result.installation.path : 'not found'}`);
    lines.push(`- managed files: ${result.installation?.managedCount ?? 0}`);
    lines.push(`- preserved ai-docs files: ${result.preservedProjectContent.files}`);
  } else {
    lines.push(`- Specs: ${result.specs.length}`);
    lines.push(`- ADRs: ${result.adrs.length}`);
    lines.push(`- changes: ${result.changes.length}`);
  }
  for (const warning of result.warnings ?? []) lines.push(`warning ${warning.code} ${warning.path}: ${warning.message}`);
  for (const error of result.errors ?? []) lines.push(`error ${error.code} ${error.path}: ${error.message}`);
  return `${lines.join('\n')}\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  let result;
  if (options.command === 'select') result = await selectTeamSpecs(options);
  else if (options.command === 'check') result = await checkTeamSpecs(options);
  else if (options.command === 'legacy-audit') result = await auditLegacyInstallation(options);
  else throw new Error('command must be select, check, or legacy-audit');

  process.stdout.write(options.format === 'json' ? `${JSON.stringify(result, null, 2)}\n` : textResult(options.command, result));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`oec-spec: ${error.message}\n`);
  process.exitCode = 2;
});
