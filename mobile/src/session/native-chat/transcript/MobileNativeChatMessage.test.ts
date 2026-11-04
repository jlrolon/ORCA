import './mobile-agent-message-renderer.test-fixture'

import { createElement } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  NativeChatBackgroundTaskBlock,
  NativeChatMessage
} from '../../../../../src/shared/native-chat/native-chat-types'
import { backgroundTaskJournalBody } from '../../../../../src/shared/native-chat/input/native-chat-background-task-row'
import { projectStructuredItemToNativeChat } from '../../../../../src/shared/agent-session/view/structured-agent-session-projection'

import type { NativeChatResolvedPrompt } from '../../../../../src/shared/native-chat/native-chat-resolution-receipt'

import type { AgentMessageSource } from '../../../../../src/shared/agent-session/agent-session-message-source'

import { MobileNativeChatMessage } from './MobileNativeChatMessage'

import { findAllByHostType } from '../../../test-support/react-test-renderer-host-nodes'

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }
}))

function userMessage(blocks: NativeChatMessage['blocks']): NativeChatMessage {
  return { id: 'u1', role: 'user', blocks, timestamp: null, source: 'transcript' }
}

describe('MobileNativeChatMessage', () => {
  let renderer: ReactTestRenderer | null = null

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  function render(
    message: NativeChatMessage,
    props: {
      fontScale?: number
      structuredActivityUi?: boolean
      activeTurnIsWorking?: boolean
      trailingRun?: boolean
      foldedAway?: boolean
      turnExpanded?: boolean
      turnStatus?: {
        startedAt: number | null
        thinking: boolean
        workedSeconds: number | null
      } | null
      onToggleTurn?: () => void
      reasoningIsLive?: boolean
      unsentNotice?: string
      receipt?: NativeChatResolvedPrompt
      userMessageOpen?: boolean
      onToggleUserMessage?: (messageId: string) => void
      awaiting?: boolean
    } = {}
  ): ReactTestRenderer {
    act(() => {
      renderer = create(createElement(MobileNativeChatMessage, { message, ...props }))
    })
    return renderer!
  }

  const markdownIn = (node: ReactTestInstance): string[] =>
    node
      .findAll((child) => String(child.type) === 'MobileMarkdown')
      .map((markdown) => markdown.props.content)
  const textIn = (node: ReactTestInstance): string[] =>
    findAllByHostType(node, 'Text').map((text) => String(text.children.join('')))

  it('measures the natural layer, expands and refolds, and preserves old-server body', () => {
    const from: AgentMessageSource = { kind: 'agent', orchestration: null, senders: [] }
    const message = {
      ...userMessage([
        { type: 'text' as const, text: 'Long paragraph wrapped over many native lines.' }
      ]),
      from
    }
    const tree = render(message)
    const measured = tree.root.findByProps({ testID: 'agent-message-body' })
    const clip = tree.root.findByProps({ testID: 'agent-message-viewport' })
    const folded = clip.props.style.height
    expect(measured.props.style).toMatchObject({ position: 'absolute', left: 0, right: 0, top: 0 })
    act(() => measured.props.onLayout({ nativeEvent: { layout: { height: folded } } }))
    expect(textIn(tree.root)).not.toContain('Show more')
    act(() => measured.props.onLayout({ nativeEvent: { layout: { height: folded * 4 } } }))
    const toggle = () =>
      findAllByHostType(tree.root, 'Pressable').find(
        (node) => node.props.accessibilityState?.expanded !== undefined
      )!
    act(() => toggle().props.onPress())
    expect(clip.props.style.height).toBe(folded * 4)
    act(() => toggle().props.onPress())
    expect(clip.props.style.height).toBe(folded)
    expect(textIn(tree.root)).toContain('Show more')
    const body = () => tree.root.findByProps({ testID: 'agent-message-body' })
    const viewport = () => tree.root.findByProps({ testID: 'agent-message-viewport' })
    let stale = body().props.onLayout
    act(() => viewport().props.onLayout({ nativeEvent: { layout: { width: 320 } } }))
    act(() => stale({ nativeEvent: { layout: { height: 900 } } }))
    expect(viewport().props.style.height).toBe(folded)
    expect(textIn(tree.root)).not.toContain('Show more')
    act(() => body().props.onLayout({ nativeEvent: { layout: { height: folded * 2 } } }))
    expect(textIn(tree.root)).toContain('Show more')
    stale = body().props.onLayout
    act(() => tree.update(createElement(MobileNativeChatMessage, { message, fontScale: 1.5 })))
    act(() => stale({ nativeEvent: { layout: { height: 900 } } }))
    expect(viewport().props.style.height).toBe(folded * 1.5)
    act(() => body().props.onLayout({ nativeEvent: { layout: { height: 10 } } }))
    expect(viewport().props.style.height).toBe(10)
    stale = body().props.onLayout
    const recovered = {
      ...message,
      blocks: [{ type: 'text' as const, text: 'Recovered current body' }]
    }
    act(() =>
      tree.update(createElement(MobileNativeChatMessage, { message: recovered, fontScale: 1.5 }))
    )
    act(() => stale({ nativeEvent: { layout: { height: 900 } } }))
    expect(viewport().props.style.height).toBe(folded * 1.5)
    act(() => body().props.onLayout({ nativeEvent: { layout: { height: 20 } } }))
    expect(viewport().props.style.height).toBe(20)
    expect(markdownIn(tree.root)).toEqual(['Recovered current body'])
    act(() => tree.unmount())
    const oldServer = render({ ...message, from: undefined })
    expect(oldServer.root.findAllByProps({ testID: 'agent-message-card' })).toHaveLength(0)
    expect(markdownIn(oldServer.root)).toEqual([
      message.blocks[0].type === 'text' ? message.blocks[0].text : ''
    ])
  })

  // An older host refuses the read; the row keeps today's placeholder.

  it('draws a background task as its row, not the plain sentence written for older clients', () => {
    const task = (overrides: Partial<NativeChatBackgroundTaskBlock>): NativeChatMessage =>
      projectStructuredItemToNativeChat({
        itemId: 'task',
        revision: 1,
        sequence: 1,
        observedAt: 1,
        body: backgroundTaskJournalBody({
          type: 'background-task',
          taskId: 'b1',
          kind: 'command',
          label: 'pnpm test',
          state: 'working',
          startedAt: 1_000,
          outputFile: '/tmp/b1.output',
          ...overrides
        })
      })!
    const run = () => render(task({})).root.findByProps({ testID: 'background-task-run' })
    expect(textIn(run())).toEqual(['pnpm test', 'working', 'Output: /tmp/b1.output'])
    act(() => renderer?.unmount())
    const settled = render(
      task({ state: 'blocked', settledAt: 66_000, summary: 'Exited with code 1' })
    )
    expect(textIn(settled.root)).toEqual([
      'pnpm test',
      'blocked · failed · 1m 5s',
      'Exited with code 1',
      'Output: /tmp/b1.output'
    ])
  })
})
