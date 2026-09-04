# Plan 038 — Codex pet companions

Status: IMPLEMENTED in the working tree.

## Goal

Give the guided studio a friendly, optional pet voice while staying honest about
the current Codex surface: the official pets documentation describes selection in
the ChatGPT desktop app and Codex CLI, but does not define a public browser API.

## Delivered

1. Add `src/pets/codexPets.ts` with bounded pet types, four local companions, a
   persisted selection contract, and an opt-in host bridge.
2. Discover a host pet from the namespaced custom event, postMessage response, or
   explicitly injected window fields; label it `Loaded from Codex` only after a
   validated payload arrives.
3. Add a compact Agent-tab picker with local companions and `No pet` fallback.
4. Use the selected companion as the guided-tour speaker, WebMCP activity avatar,
   and idle AGENT room presence name.
5. Document the limitation and bridge contract in README, AGENTS, and the pixel-art
   tutor skill.
6. Verify fallback selection, host-event adoption, dynamic tutorial copy, lint,
   typecheck, build, and the full-height inspector layout in Chromium.

## Host payload

The adapter accepts a `name` plus optional `id`, `description`, `accent`, `variant`,
and `imageUrl`. A host can inject `window.__CODEX_PET__`, dispatch `codex:pet` or
`pixel-art-tutor:codex-pet`, or answer the `pixel-art-tutor:request-codex-pet`
postMessage. No payload is treated as a local-only selection, not as a Codex pet.
