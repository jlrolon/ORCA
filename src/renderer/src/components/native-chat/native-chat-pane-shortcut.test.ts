import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { KeybindingInput } from '../../../../shared/keybindings'
import { handleNativeChatPaneShortcut } from './native-chat-pane-shortcut'

// US-layout Cmd+Shift+= types '+', so Settings records it as Mod+Shift+Plus.
const cmdShiftEqual = { key: '+', code: 'Equal', metaKey: true, shiftKey: true }
const equalizeOnCmdShiftEqual = { 'terminal.equalizePaneSizes': ['Mod+Shift+Plus'] }

function keyDown(input: KeybindingInput & { repeat?: boolean }) {
  return { repeat: false, ...input, preventDefault: vi.fn(), stopPropagation: vi.fn() }
}

function terminalPaneActions(canEqualizePaneSizes: boolean) {
  return {
    onSplitRight: vi.fn(),
    onSplitDown: vi.fn(),
    canEqualizePaneSizes,
    onEqualizePaneSizes: vi.fn()
  }
}

beforeEach(() => vi.stubGlobal('navigator', { userAgent: 'Macintosh' }))
afterEach(() => vi.unstubAllGlobals())

it.each([
  ['Cmd+D', { key: 'd', code: 'KeyD', metaKey: true }, 'onSplitRight'],
  ['Cmd+Shift+D', { key: 'D', code: 'KeyD', metaKey: true, shiftKey: true }, 'onSplitDown'],
  ['Cmd+Shift+=', cmdShiftEqual, 'onEqualizePaneSizes']
] as const)('%s in a chat runs its terminal pane command', (_label, input, command) => {
  const actions = terminalPaneActions(true)
  const event = keyDown(input)
  expect(handleNativeChatPaneShortcut(event, equalizeOnCmdShiftEqual, actions)).toBe(true)
  expect(event.preventDefault).toHaveBeenCalledOnce()
  for (const name of ['onSplitRight', 'onSplitDown', 'onEqualizePaneSizes'] as const) {
    expect(actions[name]).toHaveBeenCalledTimes(name === command ? 1 : 0)
  }
})

it('takes the equalize key without resizing a lone or expanded pane', () => {
  const actions = terminalPaneActions(false)
  const event = keyDown(cmdShiftEqual)
  expect(handleNativeChatPaneShortcut(event, equalizeOnCmdShiftEqual, actions)).toBe(true)
  expect(event.preventDefault).toHaveBeenCalledOnce()
  expect(actions.onEqualizePaneSizes).not.toHaveBeenCalled()
})

it('leaves the key to the chat while equalize is unbound, repeating, or no terminal pane hosts it', () => {
  const actions = terminalPaneActions(true)
  for (const [event, keybindings, paneActions] of [
    [keyDown(cmdShiftEqual), {}, actions],
    [keyDown({ ...cmdShiftEqual, repeat: true }), equalizeOnCmdShiftEqual, actions],
    [keyDown(cmdShiftEqual), equalizeOnCmdShiftEqual, undefined]
  ] as const) {
    expect(handleNativeChatPaneShortcut(event, keybindings, paneActions)).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
  }
  expect(actions.onEqualizePaneSizes).not.toHaveBeenCalled()
})
