# oec-engineering

`oec-engineering` provides focused software engineering Skills and a project-owned team Spec
contract. It does not replace Claude Code's main coding agent or install a development state
machine.

## Boundaries

- Team Specs contain durable, evidence-backed engineering facts.
- Change packages contain context and evidence for a non-trivial change.
- Ordinary implementation, exploration, and validation remain with the main coding agent.
- E3, SAE, UTP, remote Git, and Feishu writes are outside this plugin.
- Installing the plugin does not create `.claude`, `.codex`, or `ai-docs` files in a project.

Project files are created or changed only when the user asks to manage team Specs and confirms the
proposed paths.
