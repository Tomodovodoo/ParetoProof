# Frontend Design System and Component Stack Baseline

This document defines the MVP frontend design-system direction for `apps/web`. It fixes component-stack and styling constraints so frontend execution issues can build on one shared approach.

## Component stack choice

For MVP, use a repo-local component system built on React + TypeScript + semantic HTML primitives.

- keep UI primitives in `apps/web/src/components/ui/*`
- keep surface-specific composites in `apps/web/src/components/<surface>/*`
- avoid introducing a heavyweight third-party design-system library during MVP
- allow focused utility libraries only when they solve a narrow, recurring accessibility or composition problem

Rationale: current UI already uses custom CSS tokens and route-level React components. Extending that baseline avoids a disruptive migration during core auth/portal delivery.

## Foundational styling decisions

The style system is token-first and lives in CSS variables.

- global tokens remain in `apps/web/src/styles/app.css` under `:root`
- tokens must cover:
  - color roles (`--bg`, `--ink`, `--line`, status colors)
  - spacing scale (`--space-*`)
  - radius scale (`--radius-*`)
  - typography scale (`--font-size-*`, `--line-height-*`)
  - elevation and focus states
- components consume semantic tokens, not raw hex values in component-level CSS
- no CSS-in-JS requirement for MVP; plain CSS modules or scoped stylesheet files are acceptable

## Layout and responsive rules

MVP frontend must remain desktop-first but mobile-safe for every auth and portal screen.

- required breakpoints:
  - `<= 1220px` for wide-grid collapse
  - `<= 900px` for single-column portal/layout shifts
  - `<= 640px` for compact typography/action stacking
- minimum touch target for actionable controls: 44px equivalent area
- avoid horizontal scrolling for core flows (`public`, `auth`, `portal`)
- every panel/card layout must define a collapsed state before merge

## Routing and composition style

Keep host-surface routing explicit and deterministic.

- continue using the top-level surface resolver pattern in `App.tsx` (`public`, `auth`, `portal`)
- avoid adding framework router complexity for MVP unless true nested route/state history is required
- for intra-portal navigation, use explicit section keys and view-state composition in portal shell components
- keep route guards and access-state transitions colocated with bootstrap/auth boundary components

## Component quality bar

All shared UI components must satisfy:

- keyboard navigation and visible focus style
- semantic landmarks and accessible labels
- loading and empty states for async data blocks
- status variants for `info`, `success`, `warning`, `error` where relevant
- deterministic visual behavior across Chromium-based browsers used by contributors

## Initial MVP component catalog

The following primitives should exist before expanding advanced portal features:

- `Button` (primary, secondary, tonal, danger)
- `Input`, `Select`, `Textarea`, `Checkbox`
- `Card`, `PanelHeader`, `Badge`, `Tag`
- `Table` shell primitives for run/result rows
- `InlineStatus` and `EmptyState` blocks
- `Dialog` and `ConfirmAction` pattern for destructive admin actions

## Out of scope for this baseline

- dark-mode commitment
- public component package extraction from `apps/web`
- full design-token automation pipeline
- replacing existing host-surface split with a new app-wide router framework
