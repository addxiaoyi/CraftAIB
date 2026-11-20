# Layout skeleton

The app shell is one navigation model with three responsive states. Every workspace
renders inside one of three skeletons; no workspace renders its own header.

## Shell

```
┌──────────────────────────────────────────────────────────────┐
│ AppHeader  h-[var(--app-header-h)]  z-40                     │
├──────────────────────────────────────────────────────────────┤
│ main  flex-1  min-h-0  overflow-hidden                       │
│   ├─ split skeleton   (AI builder, 3D viewer)                │
│   └─ page skeleton    (7 tool pages, settings)               │
└──────────────────────────────────────────────────────────────┘
```

- Root: `flex h-dvh w-full flex-col overflow-hidden`.
- Header: fixed token height, `overflow-visible` so the toolbox and project menus can
  escape the bar. Do not put `overflow-hidden` back on the header.
- Drawer and backdrop anchor to `top-[var(--app-header-h)]`, never to a literal `52px`.

## Navigation breakpoints

| Width | Workspace switch | Project actions |
| --- | --- | --- |
| `< 1024px` | hamburger + `WorkspaceDrawer` overlay | icon menu |
| `1024–1279px` | core rail as icons, toolbox dropdown | icon menu (`FolderOpen`) |
| `1280–1535px` | core rail as icons, toolbox dropdown | Save / Open text buttons |
| `≥ 1536px` | core rail with text labels, toolbox dropdown | Save / Open text buttons |

Core rail: `ai_builder`, `viewer_3d`, `projections`, `materials`, plus a settings icon in
the action zone. Toolbox dropdown: `pixel_art`, `map_art`, `voxel_lab`, `geo_scene`,
`lego_ldraw` (settings is omitted there because the header already has a dedicated
settings button). The drawer and the dropdown both render from
`frontend/src/layout/workspaces.ts`, so labels and icons cannot drift apart. At icon-only
widths the toolbox trigger swaps the wrench for the active tool's icon, so the current
tool is identifiable without opening the menu.

The structure summary renders as `name · voxels` on tablets (`md`, 768–1023px), hides in
the crowded icon-rail band (`lg`–`xl`, 1024–1279px), and returns with the size from `xl`
(1280px). That keeps the rail breathable without dropping model context on tablets.

The settings button carries `data-workspace-id="settings"` so smoke tests and keyboard
users reach it through the same selector as every other workspace.

### Menu keyboard contract

Both header menus are real menus:

- opening with click or Enter moves focus to the first `role="menuitem"`;
- `ArrowDown` / `ArrowUp` rove with wrap-around, `Home` / `End` jump to the edges;
- `Escape` closes and returns focus to the trigger, `Tab` closes and lets focus continue;
- selecting a tool returns focus to the toolbox trigger, so the next `Tab` continues from
  the header instead of restarting at the document body;
- the trigger exposes `aria-expanded`, `aria-haspopup="menu"` and `aria-controls`, and the
  menu carries a matching `id` and an `aria-label`.

### Skip link and motion

The first `Tab` on any page reveals a skip link that targets `#craftaib-main`; `main` is
`tabIndex={-1}`, so activating it moves keyboard focus into the workspace without walking
the whole header. The link is hidden with opacity (not `display`) and becomes visible and
clickable on focus.

Both skeleton animations (`animate-fade-in`, `animate-drawer-in`) are turned off under
`prefers-reduced-motion: reduce`.


## Skeletons

### Split

Used by `AiBuilderView` and `Viewer3dView`. The workspace owns two panes and the
internal scrolling; the shell only supplies the header and the full-height `main`.

- AI builder left panel: `lg:w-[var(--workspace-panel-w)]`, `xl:w-[var(--workspace-panel-w-wide)]`.
- 3D viewer left dock: `sm:w-[var(--workspace-dock-w)]`; its toggle sits at
  `translateX(calc(var(--workspace-dock-w) - 4px))`.
- Below `lg` the AI builder swaps panes through `SegmentedTabs` instead of stacking them.

### Page

Used by `ProjectionsView`, `MaterialsView`, `PixelArtView`, `MapArtView`,
`VoxelLabView`, `GeoSceneView`, `LegoLdrawView`, `SettingsView`.

`PageWorkspace` owns the scrolling column and the title row:

- `width="wide"` → `max-w-7xl`; `width="narrow"` → `max-w-4xl` (settings).
- `title` is the only `h1` on the page.
- `subtitle` renders under it; `status` renders as a `role="status"` mono caption.
- `actions` renders in a right-aligned row that wraps under the title on mobile.
- Content keeps its own `space-y-6` rhythm inside the page column.

### Canvas

The 3D viewport inside split workspaces is a bare canvas: no title row, no padding,
absolute overlays only. Tools that need a full-bleed stage should follow this shape
instead of nesting a second page frame.

## Tokens

Declared in `frontend/src/index.css`:

| Token | Value | Used by |
| --- | --- | --- |
| `--app-header-h` | `52px` | header height, drawer and backdrop offsets |
| `--workspace-panel-w` | `420px` | AI builder left pane at `lg` |
| `--workspace-panel-w-wide` | `450px` | AI builder left pane at `xl` |
| `--workspace-dock-w` | `288px` | 3D viewer region dock and toggle offset |

`responsive-browser-smoke.mjs` fails when a `var(--x)` reference has no declaration, so
new layout tokens must be declared in `:root` before they are used.

## Component contracts

`frontend/src/components/layout/AppHeader.tsx`

- `data-mobile-menu-toggle` + `aria-expanded` + `aria-controls` on the hamburger.
- `data-workspace-id` on every workspace target, with `aria-current="page"` on the active one.
- `data-toolbox-toggle` opens a `role="menu"`; menu rows are `role="menuitem"`.
- `data-project-action="save" | "open"` appears once per visible control, never twice.
- The export button keeps the visible label `.litematic`.

`frontend/src/components/layout/WorkspaceDrawer.tsx`

- `role="dialog"`, `aria-modal="true"`, backdrop click closes.
- Focus starts inside, Tab is trapped, Escape closes, focus returns to the toggle.
- Closes automatically at `(min-width: 1024px)`.
- `z-[60]` backdrop, `z-[61]` panel: above the viewer dock (`z-[25]`) and the header (`z-40`).
- Slides in from the left (`animate-drawer-in`); the smoke waits for that animation to finish
  before it measures the settled geometry.

`frontend/src/components/layout/PageWorkspace.tsx`

- Props: `title`, `subtitle?`, `status?`, `actions?`, `width?: 'wide' | 'narrow'`, `children`.
- Never renders a second `h1` or a nested page scroll container.

`frontend/src/components/layout/SegmentedTabs.tsx`

- Props: `items`, `value`, `onChange`, `ariaLabel`, `className?`.
- Buttons are `aria-pressed`; the group carries `aria-label`.

## Verification

```bash
npm run typecheck:ui
npm run build:ui
node scripts/ui-contract-smoke.mjs
node scripts/responsive-browser-smoke.mjs
node scripts/architect-ui-smoke.mjs
node scripts/ai-generation-browser-smoke.mjs
node scripts/ui-button-smoke.mjs
node scripts/ui-file-action-smoke.mjs
```

`responsive-browser-smoke.mjs` asserts, at 1600/1440/1280/1024/768/844/390/320px:

- the first Tab reveals the skip link and Enter focuses `#craftaib-main`;
- the hamburger exists only below 1024px, and the top-bar rail only at or above it;
- workspace text labels appear from 1536px and stay unclipped;
- no horizontal overflow and no clipped header actions;
- `.litematic` stays visible;
- the drawer below 1024px keeps 44px rows, one radius, trap and Escape behavior;
- every type size stays on the 10/11/12/14/16 scale.
