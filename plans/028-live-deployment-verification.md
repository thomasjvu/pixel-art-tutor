# Plan 028: Deploy and verify the judge-facing application

> Executor instructions: deploy the frontend and room worker using the team's
> chosen provider. This plan cannot be completed from the local repository
> without the deployment target and credentials. Never replace a missing URL
> with localhost in the submission form.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM
- **Depends on**: plans/027-credential-rotation-handoff.md, provider access
- **Category**: deployment / submission gate
- **Planned at**: commit `77b3fa5`, 2026-09-03

## Steps

1. Build the frontend with the production `VITE_PARTYKIT_HOST` value.
2. Deploy the Vite output to the chosen public host.
3. Deploy the room worker with `npm run room:deploy` or the provider's
   equivalent.
4. Set `ROOM_ALLOWED_ORIGIN` to the exact frontend origin.
5. Open the live URL in ChatGPT's in-app browser and Chrome with WebMCP enabled.
6. Run `get_project_state`, `read_sprite`, and one safe mutation; confirm the
   canvas updates and tools return structured results.
7. Open the same `?room=<id>` link in a second browser profile and confirm both
   presence and a visible shared edit.
8. Record the final URL, room test URL, and no-login/credential statement for
   Devpost testing instructions.

## Done criteria

- The live URL loads without setup or auth surprises.
- WebMCP discovery and a mutation succeed in a judge-supported browser.
- Room origin configuration is exact and two-client sync is verified.

## Stop conditions

- Do not claim completion if only localhost was tested.
- Stop if the room worker accepts the wrong origin or the client and worker are
  deployed from mismatched revisions.
