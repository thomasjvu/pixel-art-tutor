# Pixel Art Tutor — visual direction

## Product feeling

Pixel Art Tutor is a shared pixel studio where a person and an AI agent can
work on the same tiny world. The interface should feel like a friendly tool
from a compact game editor: direct, tactile, readable, and a little strange.
The canvas is the focus. Everything around it should help the next pixel,
frame, or conversation happen without competing for attention.

## Theme

The visual language is **Undertale meets Miku**:

- an off-black void for dark mode, with soft gray text rather than pure white
  everywhere;
- an off-white paper surface for light mode, with a warm transparency checker;
- soul red for important action, playback state, errors, and frame emphasis;
- Miku green (`#39c5bb`) for active tools, WebMCP readiness, selected icons,
  links, and companion energy;
- restrained borders and shallow shadows so the work feels calm rather than
  trapped inside a collection of windows.

## Layout principles

- The app is fullscreen. The tools rail owns the left edge, the editor owns
  the middle, and the inspector owns the full right column.
- File, Edit, View, Share, and Export are the primary menu actions. The app
  mark lives beside File; project documents live in the tab row below.
- The canvas and timeline are one editor column. The timeline can collapse or
  be resized, and its alternating layer rows make stacked animation easier to
  scan.
- The footer carries project identity, canvas readouts, save state, room
  state, WebMCP state, and the Made by Ultima link.
- Hidden rails become quiet reveal tabs so the canvas gets the space back.

## Type and iconography

- Use a readable pixel display face for headings and labels, with a CRT-like
  monospace face for longer copy and status text.
- Keep menu text and inspector headings large enough to read at a glance.
- Use the vendored Streamline Pixel icon set consistently for tools, playback,
  navigation, and status affordances. Do not replace an icon with decorative
  text when a matching icon exists.
- Use color to communicate state, not a thick active-side border: Miku green
  means selected/available, red means action/attention, and muted ink means
  idle.

## Canvas and animation

- Pixel cells are always square. The canvas uses integer pixels-per-cell zoom
  and caps the view at 16px per cell so a large sprite remains navigable.
- Grid and onion skin start off, keeping a new canvas clean. They are opt-in
  reference modes rather than permanent chrome.
- Playback controls should be compact and icon-led. The segmented opacity
  control uses small vertical bars inspired by a Fire Emblem HP gauge while
  remaining a real keyboard-accessible range input underneath.

## Companion behavior

The selected Codex companion floats above the editor chrome, starts near the
bottom-right corner, and can be dragged to a persistent position. It is gray
and still while no agent is active. Its pixel speech bubble is an always
available invitation:

> Ask your agent to connect to WebMCP on this site!

When an agent action is visible, the companion returns to color and the bubble
greets the room or shows the current agent action message. The companion is a
guide, not a second toolbar: it should feel lifted off the page and remain
easy to ignore while still making collaboration legible.

## Accessibility commitments

- Preserve strong text contrast in both themes while keeping borders quiet.
- Keep controls keyboard reachable with visible focus outlines.
- Pair decorative controls with native semantics and tooltips; the segmented
  opacity bar is visual treatment over a real range input.
- Respect reduced-motion preferences for sprite animation and agent painting.
- Never rely on color alone for active, locked, or connected states.

## Do / avoid

Do use generous spacing, shallow depth, pixel-sharp imagery, small clusters of
accent color, and concise labels.

Avoid heavy card stacks, yellow accents, browser-default select styling,
oversized shadows, text-only playback controls, or a dense wall of tiny labels.
