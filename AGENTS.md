# Repository Guardrails

- `PLAN.md` is the only implementation plan; `GATE-0-PRODUCT-CONTRACT.md` is the accepted product contract.
- Implement one Gate at a time. Do not start the next Gate until the user accepts the current Gate.
- The discarded V1 must not return as a baseline: no six-space thumbnail rail, static image hotspots, proposal-card workflow, customer/designer mode toggle, or block-model 3D.
- One canonical scene owns floor-plan geometry, rooms, surfaces, openings, furniture IDs, transforms, materials, capabilities, rules, versions, and camera presets.
- 2D is a synchronized read-only top-down overview. Real 3D is the primary browsing and editing surface.
- Room navigation is: whole-home 3D → click room → room 3D overhead → contextual camera presets.
- Movable furniture is directly editable through `SceneCommand`; deterministic rules validate both manual and Agent actions.
- Home Assistant Floor3D is an interaction reference only. Use original contemporary Scandinavian catalogue styling without IKEA branding or copied products.
- Never claim live Aily, OPPEIN product data, pricing, BOM, production, or construction integration without current end-to-end evidence.
- Before each Gate, record Git state and exact paths. Keep diffs scoped, run the Gate's checks, and report evidence plus remaining limits.
