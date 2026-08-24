# HTML deck contract

Use this contract for every deck created by `html-slides`.

## Files and ownership

- `index.html` is copied from `assets/deck-index.html`; edit only `DECK_MANIFEST` unless a user
  requirement needs a shell change.
- `slides/*.html` are complete, independently openable 1920×1080 documents.
- `shared/tokens.css` owns only cross-slide color, type, spacing, reset, and repeated chrome.
- `assets/` contains only real local images, logos, or fonts used by the deck. Do not add filler.
- Use ordered, descriptive filenames such as `01-cover.html` and `02-problem.html`.

## Content and direction

- Preserve the user's message and evidence. Missing facts remain named placeholders.
- When a real brand is involved, prefer supplied or verified official assets. Never redraw a
  recognizable product with improvised CSS or claim an unofficial asset is official.
- Derive the visual motif from the subject instead of defaulting to generic gradients, uniform
  card grids, decorative emoji, or invented metrics.
- One slide should communicate one primary idea with a small number of supporting points.

For a deck with at least five slides or an ambiguous visual direction, build two representative
slides first: the cover and a content page with a materially different structure. Show rendered
images and pause only when the unresolved visual choice would propagate across the remaining deck.

## Canvas and typography

- The slide canvas is exactly 1920×1080 with `overflow: hidden` and `box-sizing: border-box`.
- Design for projection distance: body text is at least 24px, normal headings are 60–120px, and
  small labels remain at least 18px unless the user explicitly needs dense technical detail.
- Keep title and body type roles distinct. For mixed Chinese and Latin text, put the Latin family
  before the CJK fallback and use `line-break: strict`.
- Use `text-wrap: balance` for short headings, `text-wrap: pretty` for paragraphs, and tabular
  numerals for aligned data.
- Maintain at least 4.5:1 contrast for ordinary text. Do not use color alone to encode meaning.

## Layout and shell

- Each page owns its layout CSS; shared classes must not silently change another page's structure.
- Do not put page numbers, deck progress, or navigation controls inside a slide. The shell owns them.
- Keep all necessary local paths relative to the deck directory so it opens through `file://`.
- Remote fonts or images are allowed only when the user accepts the network dependency; report it
  at delivery. Prefer local assets for an offline deck.
- The shell provides grid overview, keyboard navigation, hash navigation, scaling, a page counter,
  and print styles. Do not add random overview modes or persistent last-slide state.

## Out of scope

Do not add editable PPTX conversion, automated PDF scripts, animation/video pipelines, GIF export,
cloud APIs, audio, watermarks, persistent approval files, or a second single-file deck runtime.
