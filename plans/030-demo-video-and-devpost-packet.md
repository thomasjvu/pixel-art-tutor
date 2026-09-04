# Plan 030: Produce the short demo and complete the submission packet

> Executor instructions: create a public YouTube video under three minutes with
> clear audio. Start with the working app and make agent tool use the central
> evidence. This is an external recording/upload task; the repository cannot
> mark it complete by itself.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/028-live-deployment-verification.md and 029
- **Category**: demo / submission
- **Planned at**: commit `77b3fa5`, 2026-09-03

## Recording cut

- 0:00–0:10: finished artwork already open; show WebMCP and room status.
- 0:10–0:30: agent reads the project and runs `critique_artwork`.
- 0:30–0:55: agent uses `set_pixels` for one targeted improvement.
- 0:55–1:15: agent creates a four-frame blink/bounce with `add_frame`,
  `set_pixels`, `add_frame_tag`, and `set_animation_preview`.
- 1:15–1:35: show the human and agent in the same room.
- 1:35–1:45: end on the finished animation and a brief registration/code view.

## Written packet

The Devpost description must explain, specifically, why a canvas editor needs
structured WebMCP access, how people and agents share the same project, what
the agent can inspect/change, and that the app registers imperative tools plus
the declarative sprite form. Testing instructions must include the live URL,
browser requirements, room steps, and credentials or an explicit no-login
statement.

If the pre-August-25 rule applies, add a factual submission-period additions
note; do not invent dates or claim features that are not in the live build.

## Done criteria

- Public YouTube URL is under three minutes and has intelligible audio.
- Devpost is submitted, not a draft, with all links and teammates complete.
