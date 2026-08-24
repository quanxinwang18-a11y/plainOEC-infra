# HTML deck verification

Verify the observable deck, not only the source text.

## Required checks

1. Open every `slides/*.html` file at 1920×1080. Check clipping, overlap, missing assets, font
   fallback, contrast, and text too small for projection.
2. Open `index.html` through `file://`. Confirm the grid overview contains every manifest entry and
   each card opens the correct slide.
3. Exercise Arrow Left/Right, Page Up/Down, Space, Home, End, Escape, and hash URLs such as
   `#slide-2` and `#overview`.
4. Resize the browser to confirm scale and letterboxing keep the entire 16:9 canvas visible.
5. Inspect console and page errors. Missing files, uncaught errors, or a blank iframe block delivery.
6. Preview browser printing and confirm each manifest slide becomes one print page.

## Tool choice

Use a browser or Playwright already available in the environment. A typical existing Playwright
command is:

```bash
playwright screenshot --viewport-size=1920,1080 file:///absolute/path/to/index.html deck.png
```

Do not install Playwright, a browser, or npm packages without user authorization. If no automated
browser is available, open the files manually and state that console or interaction checks remain
unverified.

## Delivery report

Report the deck path, slide count, checks performed, any network-dependent fonts or assets, and any
remaining placeholders. Do not imply that visual inspection happened when only static checks ran.
