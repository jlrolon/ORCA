import { describe, expect, it } from 'vitest'
import type { AgentStatusIpcPayload } from '../../../../shared/agent-status-ipc-payload'
import type { SleepingAgentSessionRecord } from '../../../../shared/agent-session/lifecycle/agent-session-resume'
import { getDefaultWorkspaceSession } from '../../../../shared/constants'
import type { WorkspaceSessionState } from '../../../../shared/workspace-session-state-types'
import {
  cwdInsideOtherTabbedWorktree,
  hookStatusResumeCommand,
  quitResumeRecords,
  resumeStatusFromHookRow
} from './hook-status-resume-records'

const WORKTREE = 'repo::/wt'
const OTHER_WORKTREE = 'repo::/wt-other'
const PANE_KEY = 'tab-1:11111111-1111-4111-8111-111111111111'
const SESSION = { key: 'session_id' as const, id: 'session-1' }
const RECIPE = { agentCommand: '/opt/codex', agentArgs: '--x', agentEnv: {} }

function row(overrides: Partial<AgentStatusIpcPayload> = {}): AgentStatusIpcPayload {
  return {
    paneKey: PANE_KEY,
    worktreeId: WORKTREE,
    agentType: 'codex',
    providerSession: SESSION,
    state: 'working',
    prompt: 'go',
    receivedAt: 5,
    stateStartedAt: 5,
    connectionId: null,
    ...overrides
  }
}

function heldSession(
  records: Record<string, SleepingAgentSessionRecord> = {}
): WorkspaceSessionState {
  return {
    ...getDefaultWorkspaceSession(),
    tabsByWorktree: {
      [WORKTREE]: [
        {
          id: 'tab-1',
          ptyId: 'pty-1',
          worktreeId: WORKTREE,
          title: 'Codex',
          customTitle: null,
          color: null,
          sortOrder: 0,
          createdAt: 1
        }
      ]
    },
    sleepingAgentSessionsByPaneKey: records
  }
}

function status(overrides: Partial<AgentStatusIpcPayload> = {}) {
  return resumeStatusFromHookRow(row(overrides), undefined)!
}

function twoWorktreeSession(
  records: Record<string, SleepingAgentSessionRecord> = {}
): WorkspaceSessionState {
  const session = heldSession(records)
  session.tabsByWorktree[OTHER_WORKTREE] = [
    {
      id: 'tab-9',
      ptyId: 'pty-9',
      worktreeId: OTHER_WORKTREE,
      title: 'Other',
      customTitle: null,
      color: null,
      sortOrder: 1,
      createdAt: 1
    }
  ]
  return session
}

describe('cwdInsideOtherTabbedWorktree', () => {
  const session = twoWorktreeSession()

  it('names a folder inside another worktree of the same session', () => {
    expect(cwdInsideOtherTabbedWorktree(session, WORKTREE, '/wt-other/pkg')).toBe(true)
    expect(cwdInsideOtherTabbedWorktree(session, WORKTREE, '/wt-other')).toBe(true)
  })

  it('spares the pane worktree, its neighbours, and unknown folders (#16960)', () => {
    expect(cwdInsideOtherTabbedWorktree(session, WORKTREE, '/wt/pkg')).toBe(false)
    expect(cwdInsideOtherTabbedWorktree(session, WORKTREE, '/wt-other-x/pkg')).toBe(false)
    expect(cwdInsideOtherTabbedWorktree(session, WORKTREE, '/somewhere-else')).toBe(false)
    expect(cwdInsideOtherTabbedWorktree(session, WORKTREE, undefined)).toBe(false)
    expect(cwdInsideOtherTabbedWorktree(session, WORKTREE, '')).toBe(false)
  })
})

describe('hookStatusResumeCommand', () => {
  const launchConfigOf = () => undefined

  it('keeps the recipe the pane’s earlier record of the same session kept', () => {
    const earlier = hookStatusResumeCommand({
      status: status(),
      session: heldSession(),
      worktreeId: WORKTREE,
      launchConfigOf: () => RECIPE
    })
    const [record] = earlier?.type === 'sleep' ? earlier.records : []

    const command = hookStatusResumeCommand({
      status: status({ state: 'blocked' }),
      session: heldSession({ [PANE_KEY]: record! }),
      worktreeId: WORKTREE,
      launchConfigOf
    })

    expect(command?.type === 'sleep' && command.records[0]?.launchConfig).toEqual(RECIPE)
  })

  it('drops the record of a pane whose agent can no longer be resumed', () => {
    const existing = hookStatusResumeCommand({
      status: status(),
      session: heldSession(),
      worktreeId: WORKTREE,
      launchConfigOf
    })
    const [record] = existing?.type === 'sleep' ? existing.records : []

    expect(
      hookStatusResumeCommand({
        status: status({ agentType: 'amp', providerSession: undefined }),
        session: heldSession({ [PANE_KEY]: record! }),
        worktreeId: WORKTREE,
        launchConfigOf
      })
    ).toMatchObject({ type: 'wake', paneKeys: [PANE_KEY], recordOnly: true })
  })

  it('leaves a pane the partition does not hold', () => {
    expect(
      hookStatusResumeCommand({
        status: status(),
        session: getDefaultWorkspaceSession(),
        worktreeId: WORKTREE,
        launchConfigOf
      })
    ).toBeNull()
  })

  it('keeps the pane record when a hook names a conversation from another tabbed worktree (#37799)', () => {
    const earlier = hookStatusResumeCommand({
      status: status(),
      session: twoWorktreeSession(),
      worktreeId: WORKTREE,
      launchConfigOf
    })
    const [record] = earlier?.type === 'sleep' ? earlier.records : []

    const command = hookStatusResumeCommand({
      status: status({
        providerSession: { key: 'session_id' as const, id: 'session-b', cwd: '/wt-other/pkg' }
      }),
      session: twoWorktreeSession({ [PANE_KEY]: record! }),
      worktreeId: WORKTREE,
      launchConfigOf
    })

    expect(command).toBeNull()
  })

  it('still records a hook whose folder is outside every tabbed worktree (#16960)', () => {
    const command = hookStatusResumeCommand({
      status: status({
        providerSession: { key: 'session_id' as const, id: 'session-b', cwd: '/elsewhere' }
      }),
      session: twoWorktreeSession(),
      worktreeId: WORKTREE,
      launchConfigOf
    })

    expect(command?.type === 'sleep' && command.records[0]?.providerSession.cwd).toBe('/elsewhere')
  })

  it('keeps the pane record when a foreign worktree hook would clear it', () => {
    const earlier = hookStatusResumeCommand({
      status: status(),
      session: twoWorktreeSession(),
      worktreeId: WORKTREE,
      launchConfigOf
    })
    const [record] = earlier?.type === 'sleep' ? earlier.records : []

    const command = hookStatusResumeCommand({
      status: status({
        agentType: 'amp',
        providerSession: { key: 'session_id' as const, id: 'session-b', cwd: '/wt-other' }
      }),
      session: twoWorktreeSession({ [PANE_KEY]: record! }),
      worktreeId: WORKTREE,
      launchConfigOf
    })

    expect(command).toBeNull()
  })
})

describe('quitResumeRecords', () => {
  const launchConfigOf = () => undefined

  it('leaves a conversation from another tabbed worktree out of the pane quit capture (#37799)', () => {
    const records = quitResumeRecords({
      statuses: [
        status({
          providerSession: { key: 'session_id' as const, id: 'session-b', cwd: '/wt-other/pkg' }
        }),
        status({ providerSession: { key: 'session_id' as const, id: 'session-a', cwd: '/wt/pkg' } })
      ],
      session: twoWorktreeSession(),
      worktreeIdOf: () => WORKTREE,
      launchConfigOf,
      capturedAt: 10
    })

    expect(records.map((record) => record.providerSession.id)).toEqual(['session-a'])
  })
})
