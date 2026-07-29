# PRD #319 Files Trees Explorer Acceptance Trace

This trace maps each PRD #319 acceptance criterion to the issue that delivered or verifies it.
Issues #320-#327 are closed. Issue #328 verifies the final dependency/component cleanup.

| PRD #319 acceptance criterion                                                                                                                                           | Completed issue trace  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `@pierre/trees` is added as an exact-version dependency while it is beta.                                                                                               | #320                   |
| `react-arborist` is no longer used by the Files explorer and is removed if unused elsewhere.                                                                            | #320, #328             |
| `material-icon-theme` is no longer used by the Files explorer and is removed if unused elsewhere.                                                                       | #321, #328             |
| The Files explorer uses Trees as its renderer-only model/interaction layer.                                                                                             | #320                   |
| Files still uses Monaco for source editing and the existing Tiptap-based editor for Markdown/MDX rich editing.                                                          | #320                   |
| Files still routes all privileged filesystem operations through `window.spacezero.files.*` and main-owned Files services.                                               | #320, #323, #324, #325 |
| Trees implementation details do not leak into shared IPC contracts or main-process services.                                                                            | #325                   |
| The explorer uses compact density.                                                                                                                                      | #321                   |
| Sticky folders are enabled.                                                                                                                                             | #321                   |
| Single-child folder chains are always compacted.                                                                                                                        | #321                   |
| Files search is the default explorer search mode and uses Trees `hide-non-matches` behavior to filter by canonical path/name.                                           | #322                   |
| Contents search remains explicit, uses Space Zero's main-owned search service, and renders file/line/context results rather than Trees rows.                            | #322                   |
| Drag-and-drop move is disabled while Files search is active.                                                                                                            | #322, #324             |
| Inline rename triggers Space Zero's validated move/rename path through main services.                                                                                   | #324                   |
| Drag-and-drop move triggers Space Zero's validated move path through main services.                                                                                     | #324                   |
| Right-click opens the row context menu.                                                                                                                                 | #323                   |
| A subtle row hover trigger can also open the row context menu.                                                                                                          | #323                   |
| Context-menu actions for create file/folder, rename, trash, and reveal continue to respect existing Space Zero policy and confirmations.                                | #323                   |
| Rename, move, or trash affecting dirty tabs still requires Save, Discard, or Cancel first.                                                                              | #324                   |
| Successful rename/move rewrites affected open-tab paths and keeps them open.                                                                                            | #324                   |
| Trash closes affected tabs only after the operation succeeds.                                                                                                           | #323                   |
| Git status decorations are always visible in both Project Session and Knowledge Base Files.                                                                             | #326                   |
| Files does not stage, unstage, revert, commit, checkout, or perform Git workflow mutations.                                                                             | #326                   |
| Critical row annotations are available for symlink, protected/locked, and open-tab conflict states where those states affect user action.                               | #327                   |
| `.git` internals remain hidden and protected.                                                                                                                           | #323, #325, #327       |
| Symlinks remain identifiable but are not followed, expanded, edited through, searched through, renamed, moved, or trashed.                                              | #323, #325, #327       |
| Large-tree data is prepared or presorted outside renderer UI tree shaping, with Space Zero exclusions/order/security policy applied before data reaches Trees.          | #325                   |
| Explorer width, collapsed state, selected path, expanded/restored tree state, tabs, dirty buffers, and editor view state remain scoped independently per Files context. | #320                   |
| Trees styling is derived from Space Zero/editor theme variables where practical, while Space Zero remains owner of final product styling.                               | #321                   |

## Cleanup verification for #328

- `react-arborist` is absent from `package.json` and `pnpm-lock.yaml` on the #328 branch.
- `material-icon-theme` is absent from `package.json` and `pnpm-lock.yaml` on the #328 branch.
- No Files source code imports `react-arborist` or `material-icon-theme`.
- The old Files icon resolver/component pipeline (`files-icon.tsx`, `files-icon-resolver.ts`) is absent.
