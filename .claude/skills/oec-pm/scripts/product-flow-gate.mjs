#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const VALID_STAGES = new Set(['finalize', 'pre-publish', 'post-publish']);

function usage() {
  return [
    'Usage:',
    '  node product-flow-gate.mjs --workspace <path> --version vX.Y.Z --stage finalize|pre-publish|post-publish [--strict-warnings]',
    '',
    'Stages:',
    '  finalize      root PRD + changelog + increment PRD',
    '  pre-publish   finalize gates + HANDOFF + child PRDs + UI-link warnings',
    '  post-publish  pre-publish gates + E3 mapping',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    stage: 'finalize',
    strictWarnings: false,
    workspace: process.cwd(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      args.help = true;
    } else if (token === '--workspace') {
      args.workspace = argv[++i];
    } else if (token === '--version') {
      args.version = argv[++i];
    } else if (token === '--stage') {
      args.stage = argv[++i];
    } else if (token === '--strict-warnings') {
      args.strictWarnings = true;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!VALID_STAGES.has(args.stage)) {
    throw new Error(`Invalid --stage "${args.stage}". Expected one of: ${[...VALID_STAGES].join(', ')}`);
  }

  args.workspace = resolve(args.workspace);
  return args;
}

function readText(root, relativePath) {
  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath)) {
    return null;
  }

  if (!statSync(absolutePath).isFile()) {
    return null;
  }

  return readFileSync(absolutePath, 'utf8');
}

function fileExists(root, relativePath) {
  const absolutePath = join(root, relativePath);
  return existsSync(absolutePath) && statSync(absolutePath).isFile();
}

function cleanScalar(value) {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function detectVersion(root) {
  const versionsDir = join(root, 'ai-docs', 'versions');
  if (!existsSync(versionsDir)) {
    return null;
  }

  const versions = readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^v\d+\.\d+\.\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort(compareVersions);

  return versions.at(-1) ?? null;
}

function compareVersions(left, right) {
  const a = left.slice(1).split('.').map(Number);
  const b = right.slice(1).split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function parseHandoff(text) {
  const subPrds = [];
  const sections = text
    .split(/\n(?=\s*-\s+featureName:)/)
    .filter((section) => /^\s*-\s+featureName:/m.test(section));

  for (const section of sections) {
    const featureName = section.match(/^\s*-\s+featureName:\s*(.+)$/m)?.[1];
    const file = section.match(/^\s*file:\s*(.+)$/m)?.[1];
    const stories = [...section.matchAll(/^\s*-\s+id:\s*(.+)$/gm)].map((match) => cleanScalar(match[1]));

    subPrds.push({
      featureName: featureName ? cleanScalar(featureName) : '',
      file: file ? cleanScalar(file) : '',
      stories,
    });
  }

  return subPrds;
}

function parseE3Mapping(text) {
  const requirements = [];
  const sections = text
    .split(/\n(?=\s*-\s+featureName:)/)
    .filter((section) => /^\s*-\s+featureName:/m.test(section));

  for (const section of sections) {
    const featureName = section.match(/^\s*-\s+featureName:\s*(.+)$/m)?.[1];
    const subPrdFile = section.match(/^\s*sub_prd_file:\s*(.+)$/m)?.[1];
    const requirement = {
      featureName: featureName ? cleanScalar(featureName) : '',
      subPrdFile: subPrdFile ? cleanScalar(subPrdFile) : '',
      e3RequirementId: '',
      storyTasks: [],
    };

    let context = '';
    let currentStoryTask = null;
    let inE3Task = false;

    for (const rawLine of section.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line === 'e3_requirement:') {
        context = 'e3_requirement';
        inE3Task = false;
        continue;
      }
      if (line === 'story_tasks:') {
        context = 'story_tasks';
        inE3Task = false;
        continue;
      }
      if (context === 'e3_requirement' && line.startsWith('id:')) {
        requirement.e3RequirementId = cleanScalar(line.slice('id:'.length));
        continue;
      }
      if (line.startsWith('- story_id:')) {
        currentStoryTask = {
          storyId: cleanScalar(line.slice('- story_id:'.length)),
          e3TaskId: '',
        };
        requirement.storyTasks.push(currentStoryTask);
        context = 'story_task';
        inE3Task = false;
        continue;
      }
      if (context === 'story_task' && line === 'e3_task:') {
        inE3Task = true;
        continue;
      }
      if (context === 'story_task' && inE3Task && line.startsWith('id:') && currentStoryTask) {
        currentStoryTask.e3TaskId = cleanScalar(line.slice('id:'.length));
      }
    }

    requirements.push(requirement);
  }

  return requirements;
}

function isPlaceholderUiLinks(text) {
  return /\{module\d*\}|<粘贴链接>|draft\s*\|\s*final|TODO|待补充/.test(text);
}

function addIssue(collection, code, message) {
  collection.push({ code, message });
}

function checkFinalize(root, version, errors) {
  const rootPrdPath = 'ai-docs/prd/prd-all.md';
  const rootPrd = readText(root, rootPrdPath);
  if (rootPrd === null) {
    addIssue(errors, 'root-prd-missing', `${rootPrdPath} is missing`);
  } else if (rootPrd.trim().length === 0) {
    addIssue(errors, 'root-prd-empty', `${rootPrdPath} is empty`);
  }

  const changelogPath = 'ai-docs/prd/prd-all-changelog.md';
  const changelog = readText(root, changelogPath);
  if (changelog === null) {
    addIssue(errors, 'root-changelog-missing', `${changelogPath} is missing`);
  } else if (changelog.trim().length === 0) {
    addIssue(errors, 'root-changelog-empty', `${changelogPath} is empty`);
  } else if (!new RegExp(`(^|\\b)${version.replace(/\./g, '\\.')}($|\\b)`, 'm').test(changelog)) {
    addIssue(errors, 'root-changelog-missing-version', `${changelogPath} has no ${version} entry`);
  }

  const incrementPath = `ai-docs/versions/${version}/prd/prd-${version}.md`;
  const incrementPrd = readText(root, incrementPath);
  if (incrementPrd === null) {
    addIssue(errors, 'increment-prd-missing', `${incrementPath} is missing`);
  } else if (incrementPrd.trim().length === 0) {
    addIssue(errors, 'increment-prd-empty', `${incrementPath} is empty`);
  }
}

function checkPrePublish(root, version, errors, warnings) {
  const handoffPath = `ai-docs/versions/${version}/prd/HANDOFF.yaml`;
  const handoffText = readText(root, handoffPath);
  let subPrds = [];

  if (handoffText === null) {
    addIssue(errors, 'handoff-missing', `${handoffPath} is missing`);
  } else if (handoffText.trim().length === 0) {
    addIssue(errors, 'handoff-empty', `${handoffPath} is empty`);
  } else {
    subPrds = parseHandoff(handoffText);
    if (subPrds.length === 0) {
      addIssue(errors, 'handoff-sub-prds-empty', `${handoffPath} has no sub_prds entries`);
    }
  }

  for (const subPrd of subPrds) {
    if (!subPrd.featureName) {
      addIssue(errors, 'handoff-feature-name-missing', `${handoffPath} has a sub_prd without featureName`);
    }
    if (!subPrd.file) {
      addIssue(errors, 'handoff-file-missing', `${subPrd.featureName || '<unknown>'} has no file`);
    } else if (!fileExists(root, subPrd.file)) {
      addIssue(errors, 'sub-prd-file-missing', `${subPrd.file} is listed in HANDOFF but does not exist`);
    }
    if (subPrd.stories.length === 0) {
      addIssue(errors, 'handoff-stories-empty', `${subPrd.featureName || subPrd.file || '<unknown>'} has no stories`);
    }
  }

  const uiLinksPath = `ai-docs/versions/${version}/ui/ui-${version}-design-links.md`;
  const uiLinks = readText(root, uiLinksPath);
  if (uiLinks === null) {
    addIssue(warnings, 'ui-design-links-missing', `${uiLinksPath} is missing`);
  } else if (uiLinks.trim().length === 0 || isPlaceholderUiLinks(uiLinks)) {
    addIssue(warnings, 'ui-design-links-placeholder', `${uiLinksPath} is empty or still a template`);
  }

  return subPrds;
}

function checkPostPublish(root, version, handoffSubPrds, errors, warnings) {
  const mappingPath = `ai-docs/integrations/e3/${version}.yaml`;
  const mappingText = readText(root, mappingPath);

  if (mappingText === null) {
    addIssue(errors, 'e3-mapping-missing', `${mappingPath} is missing`);
    return;
  }
  if (mappingText.trim().length === 0) {
    addIssue(errors, 'e3-mapping-empty', `${mappingPath} is empty`);
    return;
  }

  const requirements = parseE3Mapping(mappingText);
  if (requirements.length === 0) {
    addIssue(errors, 'e3-requirements-empty', `${mappingPath} has no requirements entries`);
    return;
  }

  for (const subPrd of handoffSubPrds) {
    const requirement = requirements.find((candidate) => {
      return (
        (subPrd.featureName && candidate.featureName === subPrd.featureName) ||
        (subPrd.file && candidate.subPrdFile === subPrd.file) ||
        (subPrd.file && basename(candidate.subPrdFile) === basename(subPrd.file))
      );
    });

    if (!requirement) {
      addIssue(errors, 'e3-requirement-missing', `${subPrd.featureName || subPrd.file} has no E3 requirement mapping`);
      continue;
    }

    if (!requirement.e3RequirementId) {
      addIssue(errors, 'e3-requirement-id-missing', `${subPrd.featureName || subPrd.file} has no e3_requirement.id`);
    }

    const mappedStoryIds = new Set(requirement.storyTasks.map((task) => task.storyId).filter(Boolean));
    for (const storyId of subPrd.stories) {
      if (!mappedStoryIds.has(storyId)) {
        addIssue(errors, 'story-task-mapping-missing', `${subPrd.featureName || subPrd.file} story ${storyId} has no story_tasks entry`);
      }
    }

    const missingTaskIds = requirement.storyTasks.filter((task) => !task.e3TaskId).length;
    if (missingTaskIds > 0) {
      addIssue(
        warnings,
        'story-task-id-missing',
        `${subPrd.featureName || subPrd.file} has ${missingTaskIds} story task id(s) missing in ${mappingPath}`,
      );
    }
  }
}

function renderResult({ stage, version, workspace, errors, warnings, strictWarnings }) {
  const failed = errors.length > 0 || (strictWarnings && warnings.length > 0);
  const lines = [
    `product-flow-gate: ${failed ? 'fail' : 'pass'}`,
    `stage: ${stage}`,
    `version: ${version}`,
    `workspace: ${workspace}`,
  ];

  if (errors.length > 0) {
    lines.push('errors:');
    for (const error of errors) {
      lines.push(`- [${error.code}] ${error.message}`);
    }
  }

  if (warnings.length > 0) {
    lines.push('warnings:');
    for (const warning of warnings) {
      lines.push(`- [${warning.code}] ${warning.message}`);
    }
  }

  return { failed, text: `${lines.join('\n')}\n` };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exit(2);
  }

  if (args.help) {
    console.log(usage());
    return;
  }

  const version = args.version ?? detectVersion(args.workspace);
  if (!version) {
    console.error('Missing --version and no ai-docs/versions/vX.Y.Z directory was found.');
    process.exit(2);
  }

  const errors = [];
  const warnings = [];

  checkFinalize(args.workspace, version, errors);

  let handoffSubPrds = [];
  if (args.stage === 'pre-publish' || args.stage === 'post-publish') {
    handoffSubPrds = checkPrePublish(args.workspace, version, errors, warnings);
  }

  if (args.stage === 'post-publish') {
    checkPostPublish(args.workspace, version, handoffSubPrds, errors, warnings);
  }

  const result = renderResult({
    stage: args.stage,
    version,
    workspace: args.workspace,
    errors,
    warnings,
    strictWarnings: args.strictWarnings,
  });

  process.stdout.write(result.text);
  process.exit(result.failed ? 1 : 0);
}

main();
