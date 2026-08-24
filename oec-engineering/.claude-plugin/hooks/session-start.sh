#!/usr/bin/env bash
# SessionStart hook for oec-engineering
# Injects a compact orientation: capabilities, project Spec state, and
# getting-started guidance when no Specs exist.
#
# Uses only standard Unix tools (find, wc, sed, grep) — no Node.js, no
# oec-spec, no file-content parsing. Startup time is ~10ms.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# --- Detect project state ---
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
ENGINEERING_DIR="${PROJECT_DIR}/ai-docs/engineering"

# Count Specs (list up to 10 paths)
spec_count=0
spec_list=""
if [ -d "${ENGINEERING_DIR}/specs" ]; then
    spec_files=$(find "${ENGINEERING_DIR}/specs" -name "*.md" -type f 2>/dev/null | sort)
    spec_count=$(echo "$spec_files" | grep -c "\.md$" 2>/dev/null || echo 0)
    if [ "$spec_count" -gt 0 ]; then
        spec_list=$(echo "$spec_files" | sed "s|${PROJECT_DIR}/||" | head -10 | sed 's/^/- /')
    fi
fi

# Count ADRs
adr_count=0
if [ -d "${ENGINEERING_DIR}/decisions" ]; then
    adr_count=$(find "${ENGINEERING_DIR}/decisions" -name "ADR-*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
fi

# Count active changes
change_count=0
if [ -d "${ENGINEERING_DIR}/changes" ]; then
    change_count=$(find "${ENGINEERING_DIR}/changes" -maxdepth 2 -name "change.md" -type f 2>/dev/null | wc -l | tr -d ' ')
fi

# --- Build context ---
context="<oec-engineering>
## Capabilities

You have oec-engineering installed. Use capabilities when they apply:

| When you need to            | Use                        |
|-----------------------------|----------------------------|
| Init/update team Specs      | managing-team-specs        |
| Plan a technical change     | planning-engineering-changes |
| Implement test-first        | test-driven-development    |
| Diagnose a hard failure     | diagnosing-failures        |
| Review code                 | reviewing-code-changes     |
| Close a completed change    | closing-engineering-changes |
| Isolated implementation     | oec-implement (agent)      |
| Fresh-eyes review           | oec-check (agent)          |
| Background research         | oec-research (agent)       |

For small fixes, implement directly. Capabilities are tools, not requirements."

# --- Dynamic: project state ---
if [ -d "$ENGINEERING_DIR" ]; then
    context+="

## Project state

Engineering knowledge exists at ai-docs/engineering/
- Specs: ${spec_count} file(s)
- ADRs: ${adr_count} decision(s)
- Active changes: ${change_count} change package(s)"

    if [ "$spec_count" -gt 0 ]; then
        context+="

### Available Specs

Consult only the Specs relevant to your current paths. Use:
\`oec-spec select --workspace \"\$PWD\" --paths <paths> --format json\`

${spec_list}"

        if [ "$spec_count" -gt 10 ]; then
            context+="
- ... and $((spec_count - 10)) more. Use oec-spec select to find relevant ones."
        fi
    fi
else
    context+="

## Getting started

No engineering knowledge exists yet. To initialize:
/oec-engineering:managing-team-specs init"
fi

context+="
</oec-engineering>"

# --- Escape for JSON ---
escape_for_json() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\n'/\\n}"
    s="${s//$'\r'/\\r}"
    s="${s//$'\t'/\\t}"
    printf '%s' "$s"
}

escaped=$(escape_for_json "$context")

# --- Output: Claude Code format ---
# Cursor and Copilot CLI formats can be added later if needed;
# currently only Claude Code is supported.
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$escaped"
else
    printf '{"additionalContext":"%s"}\n' "$escaped"
fi

exit 0