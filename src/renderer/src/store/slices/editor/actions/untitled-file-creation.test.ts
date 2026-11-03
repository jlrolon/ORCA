import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../../../shared/constants'
import { makeState } from '../../workspace-cleanup-slice-test-harness'
import { makeWorktree } from '../../worktrees-slice-test-fixtures'
import { createPluginNewFileActions } from './untitled-file-creation'
import type { AppState } from '../../../types'
import type { createUntitledMarkdownFile } from '@/lib/create-untitled-markdown'

const mocks = vi.hoisted(() => ({
  createFile: vi.fn<typeof createUntitledMarkdownFile>(),
  readTemplate: vi.fn<() => Promise<string | null>>(),
  directory: vi.fn<() => Promise<string>>(),
  error: vi.fn()
}))

vi.mock('sonner', () => ({ toast: { error: mocks.error } }))
vi.mock('../../../../../../shared/constants', () => ({
  FLOATING_TERMINAL_WORKTREE_ID: 'global-floating-terminal'
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/lib/ipc-error', () => ({
  extractIpcErrorMessage: (error: Error) => error.message
}))
vi.mock('@/lib/create-untitled-markdown', () => ({
  createUntitledMarkdownFile: mocks.createFile
}))
vi.mock('@/lib/editor-file-operation-owner', () => ({
  captureEditorFileOperationProvenance: () => ({ kind: 'local' }),
  getEditorFileOperationContext: () => ({ target: { kind: 'local' } }),
  assertEditorFileOperationCurrent: () => {}
}))
vi.mock('../../workspace-cleanup', () => ({ createWorkspaceCleanupSlice: () => ({}) }))

const newFile = {
  pluginKey: 'local.todos',
  id: 'todo',
  title: 'Todo',
  extension: '.orca-todo'
}

afterEach(() => vi.unstubAllGlobals())

function setup(activeWorktreeId: string | null = 'main-workspace') {
  const openFile = vi.fn<AppState['openFile']>().mockReturnValue('file-id')
  const state = makeState({
    activeWorktreeId,
    groupsByWorktree: {
      [FLOATING_TERMINAL_WORKTREE_ID]: [
        {
          id: 'floating-group',
          worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
          activeTabId: null,
          tabOrder: []
        }
      ]
    },
    getKnownWorktreeById: () =>
      makeWorktree({ id: 'main-workspace', repoId: 'repo', path: '/repo' }),
    openFile
  })
  const store = createStore<AppState>(() => state)
  return { openFile, state, actions: createPluginNewFileActions(store.setState, store.getState) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.directory.mockResolvedValue('/floating-notes')
  mocks.readTemplate.mockResolvedValue('{"schemaVersion":1}')
  mocks.createFile.mockImplementation(async (directory, worktreeId) => ({
    filePath: `${directory}/untitled.orca-todo`,
    relativePath: 'untitled.orca-todo',
    worktreeId,
    language: 'plaintext',
    isUntitled: true,
    mode: 'edit'
  }))
  vi.stubGlobal('window', {
    api: {
      app: { getFloatingMarkdownDirectory: mocks.directory },
      plugins: { readNewFileTemplate: mocks.readTemplate }
    }
  })
})

describe('plugin new-file destination', () => {
  it('keeps floating-menu files in the floating workspace while a main workspace is active', async () => {
    const { actions, openFile } = setup()
    await actions.openNewPluginFileInActiveWorkspace(newFile, 'floating-group')
    expect(mocks.createFile).toHaveBeenCalledWith(
      '/floating-notes',
      FLOATING_TERMINAL_WORKTREE_ID,
      undefined,
      { kind: 'local' },
      { newFile: { extension: '.orca-todo', content: '{"schemaVersion":1}' } }
    )
    expect(openFile).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: FLOATING_TERMINAL_WORKTREE_ID }),
      { preview: false, targetGroupId: 'floating-group', suppressActiveRuntimeFallback: true }
    )
  })

  it('can create a floating file with no active main workspace', async () => {
    const { actions, openFile } = setup(null)
    await actions.openNewPluginFileInActiveWorkspace(newFile, 'floating-group')
    expect(openFile).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: FLOATING_TERMINAL_WORKTREE_ID }),
      expect.objectContaining({ targetGroupId: 'floating-group' })
    )
  })

  it.each(['main-workspace', null])(
    'creates the first floating file before a tab group exists, with active workspace %s',
    async (activeWorktreeId) => {
      const { actions, openFile, state } = setup(activeWorktreeId)
      state.groupsByWorktree = {}
      await actions.openNewPluginFileInActiveWorkspace(newFile, FLOATING_TERMINAL_WORKTREE_ID)
      expect(openFile).toHaveBeenCalledWith(
        expect.objectContaining({ worktreeId: FLOATING_TERMINAL_WORKTREE_ID }),
        { preview: false, targetGroupId: undefined, suppressActiveRuntimeFallback: true }
      )
    }
  )

  it('continues opening main-menu files in the active main workspace', async () => {
    const { actions, openFile } = setup()
    await actions.openNewPluginFileInActiveWorkspace(newFile, 'main-group')
    expect(mocks.directory).not.toHaveBeenCalled()
    expect(openFile).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreeId: 'main-workspace',
        filePath: '/repo/untitled.orca-todo'
      }),
      { preview: false, targetGroupId: 'main-group', focusEditor: true }
    )
  })

  it('does not create a file when the plugin template is unavailable', async () => {
    const { actions, openFile } = setup()
    mocks.readTemplate.mockResolvedValue(null)
    await actions.openNewPluginFileInActiveWorkspace(newFile, 'floating-group')
    expect(mocks.createFile).not.toHaveBeenCalled()
    expect(openFile).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledOnce()
  })
})
