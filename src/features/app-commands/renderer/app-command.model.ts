/**
 * Neutral App Command foundation.
 *
 * App Commands are stable, human-facing actions that can be triggered from
 * multiple UI surfaces (Command Palette, keyboard shortcuts, menus, buttons).
 * This module owns only the shared shape of a command; feature-specific
 * commands register their handlers where the behavior lives.
 */

export type AppCommandId = string

export interface AppCommand {
  /** Stable command identifier used by shortcuts, palettes, and menus. */
  id: AppCommandId
  /** Human-facing title shown in discovery surfaces. */
  title: string
  /** Logical grouping for the Command Palette and settings. */
  category: string
  /** Optional search keywords beyond the title. */
  keywords?: string[]
  /** Renderer-local handler for commands that stay in the UI layer. */
  handler: () => void
}
