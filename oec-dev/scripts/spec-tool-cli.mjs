#!/usr/bin/env node

import {
  auditLegacyInstallation,
  checkTaskArtifacts,
  checkTeamSpecs,
  findSpecReminders,
  resolveTaskRef,
  selectTeamSpecs,
} from './spec-tool.mjs';

function parseArguments(argv) {
  const [command, maybeSubcommand, ...tail] = argv;
  const isTask = command === 'task';
  const options = {
    command,
    subcommand: isTask ? maybeSubcommand : undefined,
    paths: [],
    signals: [],
    format: 'text',
  };
  const rest = isTask ? tail : [maybeSubcommand, ...tail].filter((value) => value !== undefined);
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--workspace') options.workspace = rest[++index];
    else if (argument === '--dev-root') options.devRoot = rest[++index];
    else if (argument === '--product-root') options.productRoot = rest[++index];
    else if (argument === '--change') options.change = rest[++index];
    else if (argument === '--change-id') options.changeId = rest[++index];
    else if (argument === '--task-ref') options.taskRef = rest[++index];
    else if (argument === '--path') options.path = rest[++index];
    else if (argument === '--version') options.version = rest[++index];
    else if (argument === '--task-slug' || argument === '--task') options.taskSlug = rest[++index];
    else if (argument === '--feature' || argument === '--feature-name') options.featureName = rest[++index];
    else if (argument === '--stage') options.stage = rest[++index];
    else if (argument === '--allow-missing') options.allowMissing = true;
    else if (argument === '--format') options.format = rest[++index];
    else if (argument === '--signals') options.signals.push(...String(rest[++index] ?? '').split(','));
    else if (argument === '--paths') {
      while (rest[index + 1] && !rest[index + 1].startsWith('--')) options.paths.push(rest[++index]);
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (!['text', 'json'].includes(options.format)) throw new Error('--format must be text or json');
  if (command === 'task' && !['resolve', 'check'].includes(options.subcommand)) {
    throw new Error('task command must be resolve or check');
  }
  return options;
}

function textResult(command, result, subcommand) {
  const label = subcommand ? `${command} ${subcommand}` : command;
  const lines = [`${label}: ${result.ok ? 'ok' : 'blocked'}`];
  if (command === 'select') {
    for (const spec of result.specs) lines.push(`- ${spec.id}: ${spec.path}`);
    if (result.specs.length === 0) lines.push('- no matching Specs');
    if (result.modules?.length) lines.push(`- modules: ${result.modules.map((item) => item.id).join(', ')}`);
  } else if (command === 'legacy-audit') {
    lines.push(`- manifest: ${result.installation ? result.installation.path : 'not found'}`);
    lines.push(`- managed files: ${result.installation?.managedCount ?? 0}`);
    lines.push(`- preserved ai-docs files: ${result.preservedProjectContent.files}`);
  } else if (command === 'task' && subcommand === 'resolve') {
    if (result.ref) lines.push(`- taskRef: ${result.ref}`);
    if (result.relativePath) lines.push(`- path: ${result.relativePath}`);
    lines.push(`- exists: ${result.exists ? 'yes' : 'no'}`);
    lines.push(`- compatibility: ${result.compatibility ?? 'unknown'}`);
    if (result.source?.kind) lines.push(`- source: ${result.source.kind}`);
  } else if (command === 'task' && subcommand === 'check') {
    lines.push(`- task: ${result.task?.ref ?? 'unresolved'}`);
    lines.push(`- stage: ${result.stage}`);
    lines.push(`- errors: ${result.errors?.length ?? 0}`);
    lines.push(`- warnings: ${result.warnings?.length ?? 0}`);
  } else if (command === 'remind') {
    lines.push(`- level: ${result.level ?? 'none'}`);
    for (const candidate of result.candidates ?? []) {
      lines.push(`- ${candidate.kind}: ${candidate.target} (${candidate.severity})`);
      for (const reason of candidate.reasons ?? []) lines.push(`  reason: ${reason}`);
    }
    if ((result.candidates ?? []).length === 0) lines.push('- no durable Spec update candidate');
  } else {
    lines.push(`- Specs: ${result.specs.length}`);
    lines.push(`- ADRs: ${result.adrs.length}`);
    lines.push(`- changes: ${result.changes.length}`);
    if (result.modules?.length) lines.push(`- modules: ${result.modules.length}`);
  }
  for (const warning of result.warnings ?? []) lines.push(`warning ${warning.code} ${warning.path ?? ''}: ${warning.message}`);
  for (const error of result.errors ?? []) lines.push(`error ${error.code} ${error.path ?? ''}: ${error.message}`);
  return `${lines.join('\n')}\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  let result;
  if (options.command === 'select') result = await selectTeamSpecs(options);
  else if (options.command === 'check') result = await checkTeamSpecs(options);
  else if (options.command === 'legacy-audit') result = await auditLegacyInstallation(options);
  else if (options.command === 'remind') result = await findSpecReminders(options);
  else if (options.command === 'task' && options.subcommand === 'resolve') result = await resolveTaskRef(options);
  else if (options.command === 'task' && options.subcommand === 'check') result = await checkTaskArtifacts(options);
  else throw new Error('command must be select, check, legacy-audit, remind, or task resolve/check');

  process.stdout.write(options.format === 'json'
    ? `${JSON.stringify(result, null, 2)}\n`
    : textResult(options.command, result, options.subcommand));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`oec-spec: ${error.message}\n`);
  process.exitCode = 2;
});
