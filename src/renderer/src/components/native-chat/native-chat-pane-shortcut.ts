import type { KeyboardEvent } from 'react'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import {
  keybindingMatchesAction,
  type KeybindingInput,
  type KeybindingOverrides
} from '../../../../shared/keybindings'
import type { NativeChatContextMenuActions } from './use-native-chat-context-menu'

export type NativeChatSplitDirection = 'right' | 'down'
export type NativeChatPaneShortcut = NativeChatSplitDirection | 'equalize'

type NativeChatTerminalPaneShortcutActions = Pick<
  NativeChatContextMenuActions,
  'onSplitRight' | 'onSplitDown' | 'canEqualizePaneSizes' | 'onEqualizePaneSizes'
>
type NativeChatPaneShortcutEvent = KeybindingInput &
  Pick<KeyboardEvent, 'repeat' | 'preventDefault' | 'stopPropagation'>

export function matchNativeChatPaneShortcut(
  input: KeybindingInput,
  platform: NodeJS.Platform,
  keybindings: KeybindingOverrides
): NativeChatPaneShortcut | null {
  if (keybindingMatchesAction('terminal.splitRight', input, platform, keybindings)) {
    return 'right'
  }
  if (keybindingMatchesAction('terminal.splitDown', input, platform, keybindings)) {
    return 'down'
  }
  if (keybindingMatchesAction('terminal.equalizePaneSizes', input, platform, keybindings)) {
    return 'equalize'
  }
  return null
}

export function runNativeChatTerminalPaneShortcut(
  shortcut: NativeChatPaneShortcut,
  actions: NativeChatTerminalPaneShortcutActions
): void {
  if (shortcut === 'right') {
    actions.onSplitRight()
  } else if (shortcut === 'down') {
    actions.onSplitDown()
  } else if (actions.canEqualizePaneSizes) {
    // Like the terminal shortcut, a lone or expanded pane takes the key without resizing.
    actions.onEqualizePaneSizes()
  }
}

export function handleNativeChatPaneShortcut(
  event: NativeChatPaneShortcutEvent,
  keybindings: KeybindingOverrides,
  actions?: NativeChatTerminalPaneShortcutActions
): boolean {
  const shortcut = event.repeat
    ? null
    : matchNativeChatPaneShortcut(event, getShortcutPlatform(), keybindings)
  if (!shortcut || !actions) {
    return false
  }
  event.preventDefault()
  event.stopPropagation()
  runNativeChatTerminalPaneShortcut(shortcut, actions)
  return true
}
