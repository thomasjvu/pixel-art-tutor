# Codex pet art

These eight WebP files are the local Codex TUI v4 pet sprite sheets copied into Pixel Art Tutor so
the browser app can show the same built-in companions without depending on a remote asset host.
Each sheet is an 8×9 frame atlas; the studio crops its first frame as a crisp avatar.

The app does not claim that a browser can read a user's private desktop or CLI pet preference. A
host integration can provide that preference through the namespaced bridge documented in
`src/pets/codexPets.ts`; otherwise the default is the bundled `codex` sheet and the UI labels it
**Built-in Codex pet**.
