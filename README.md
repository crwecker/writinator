# Writinator

A book-writing app: a CodeMirror 6 editor with a storylet tree, character
stat tracking, notes, writing quests, and exports to Markdown, HTML, DOCX,
PDF, RTF, EPUB and ZIP. Runs in the browser at [writinator.com](https://writinator.com)
and as a Mac app via Tauri.

## Development

```sh
npm install
npm run dev          # dev server
npm test             # vitest
npx tsc -b --noEmit  # type-check
npx eslint .         # lint
npm run build        # production build
npm run tauri:dev    # desktop app (needs Rust)
```

Books are saved as `.writinator` files (File System Access API in Chromium
browsers, native files in the desktop app) and mirrored to browser storage.

See `CLAUDE.md` for architecture and conventions.
