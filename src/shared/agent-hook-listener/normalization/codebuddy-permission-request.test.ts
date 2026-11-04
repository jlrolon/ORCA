import { beforeEach, describe, expect, it } from 'vitest'
import { createHookListenerState, type HookListenerState } from '../listener-state'
import { normalizeAndAccept } from './agent-hook-listener-test-harness'

describe('CodeBuddy permission status', () => {
  let state: HookListenerState

  beforeEach(() => {
    state = createHookListenerState()
  })

  // Why: CodeBuddy dispatches PermissionRequest through its auto-review hook, so an
  // auto-approved tool fires it without a prompt. Only Notification(permission_prompt)
  // proves the user is actually being asked.
  it('does not treat an auto-approved CodeBuddy PermissionRequest as waiting', () => {
    const bash = { command: 'curl -sfL https://example.test/a.docx -o a.docx' }
    const submitted = normalizeAndAccept(state, 'codebuddy', {
      hook_event_name: 'UserPromptSubmit',
      prompt: 'download the release asset'
    })
    normalizeAndAccept(state, 'codebuddy', {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: bash
    })
    const permissionRequest = normalizeAndAccept(state, 'codebuddy', {
      hook_event_name: 'PermissionRequest',
      tool_name: 'Bash',
      tool_input: bash
    })
    const waiting = normalizeAndAccept(state, 'codebuddy', {
      hook_event_name: 'Notification',
      notification_type: 'permission_prompt',
      message: 'CodeBuddy needs your permission to use Bash'
    })
    const approved = normalizeAndAccept(state, 'codebuddy', {
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: bash
    })

    expect(submitted?.payload.state).toBe('working')
    expect(permissionRequest).toBeNull()
    expect(waiting?.payload).toMatchObject({
      agentType: 'codebuddy',
      state: 'waiting',
      toolName: 'Bash'
    })
    expect(approved?.payload.state).toBe('working')
  })

  // CodeBuddy is the only compatible vendor with the auto-review hook pass; qoder-cn keeps waiting.
  it('keeps qoder-cn PermissionRequest as waiting', () => {
    const waiting = normalizeAndAccept(state, 'qoder-cn', {
      hook_event_name: 'PermissionRequest',
      tool_name: 'Bash',
      tool_input: { command: 'ls' }
    })
    expect(waiting?.payload).toMatchObject({
      agentType: 'qoder-cn',
      state: 'waiting',
      toolName: 'Bash'
    })
  })
})
