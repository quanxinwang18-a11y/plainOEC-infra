---
name: create-slides
description: Creates browser-based, multi-file HTML slide decks from a topic, source documents, or a deck brief. Use for presentations, slide decks, or PPT-like deliverables when HTML output is acceptable. Do not use to create or edit .pptx files, produce PDF-only output, record GIF or video, build ordinary web pages or app prototypes, or invent missing business content.
argument-hint: "[topic, source files, brand assets, or deck brief]"
---

# Create HTML slide decks

Create a self-contained deck that opens from `file://` and needs no package installation or local
server. HTML is the source and the promised deliverable; browser printing is supported, but an
automated PDF or editable PPTX is not part of this Skill.

## Establish the brief

Use the user's real content and inspect referenced source files and brand assets before designing.
Ask only for missing facts that materially change the audience, message, page count, language, or
visual direction. Do not invent statistics, quotes, product claims, or brand assets.

- With a clear visual direction and fewer than five slides, create the complete deck directly.
- With an ambiguous visual direction or at least five slides, first create a cover and one
  structurally different content slide. Render both and ask for a choice only when the remaining
  visual alternatives would materially change the result.
- Do not require three directions, persistent approval files, or subagent orchestration.

## Build the deck

Read [references/deck-contract.md](references/deck-contract.md) before writing files. Use the
multi-file layout described there:

```text
<deck-name>/
├── index.html
├── shared/tokens.css
├── slides/01-cover.html
├── slides/02-*.html
└── assets/                 # only when real local assets are needed
```

Copy [assets/deck-index.html](assets/deck-index.html) to `index.html` and edit only its
`DECK_MANIFEST`. Start shared styling from [assets/tokens-template.css](assets/tokens-template.css)
and each page from [assets/slide-template.html](assets/slide-template.html), then adapt them to the
content rather than treating their neutral appearance as a design system.

Every slide is a complete 1920×1080 HTML document. Keep its CSS isolated, put only cross-slide
tokens and repeated chrome in `shared/tokens.css`, and never add a slide-level page number because
the deck shell owns navigation and counting.

## Verify and deliver

Read [references/verification.md](references/verification.md). Open every slide and the aggregate
deck in an available browser, check console errors, inspect the rendered 16:9 frames, and exercise
overview plus keyboard and hash navigation. Use an already available browser or Playwright; do not
install dependencies without the user's authorization.

Deliver the deck directory and state any missing assets, unverified interactions, or font/network
assumptions. Do not claim that a `.pptx`, PDF, GIF, or video was produced.
