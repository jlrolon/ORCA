import { useCallback, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { getRuntimeTargetForFileOwner } from '@/lib/file-owner-runtime-target'
import type { OpenFile } from '@/store/slices/editor'
import type { EditorToggleValue } from './view-mode/EditorViewToggle'
import { flushEditorFrames, hasEditorFrameFlush } from './save/flush/editor-pending-flush'

export function useEditorViewSwitch(
  activeFile: OpenFile | null,
  activeViewStateId: string | null | undefined
): {
  ownerKey: string
  applyRef: { current: (next: EditorToggleValue) => void }
  handleChange: (next: EditorToggleValue) => void
} {
  const ownerTarget = activeFile
    ? getRuntimeTargetForFileOwner(
        useAppStore.getState(),
        activeFile.worktreeId,
        activeFile.runtimeEnvironmentId
      )
    : null
  const ownerKey = JSON.stringify([
    ownerTarget,
    activeFile?.worktreeId ?? null,
    activeFile?.id ?? null,
    activeViewStateId ?? null
  ])
  const ownerIdentity = activeFile ? JSON.stringify([ownerTarget, activeFile.worktreeId]) : null
  const generationRef = useRef(0)
  const applyRef = useRef<(next: EditorToggleValue) => void>(() => {})

  useLayoutEffect(() => {
    generationRef.current += 1
    return () => {
      generationRef.current += 1
    }
  }, [ownerKey])

  const handleChange = useCallback(
    (next: EditorToggleValue): void => {
      if (!activeFile || ownerIdentity === null) {
        return
      }
      const { id: fileId, worktreeId } = activeFile
      const generation = ++generationRef.current
      const applyIfCurrent = (): void => {
        if (generation !== generationRef.current) {
          return
        }
        const state = useAppStore.getState()
        const currentFile = state.openFiles.find((file) => file.id === fileId)
        if (!currentFile || currentFile.worktreeId !== worktreeId) {
          return
        }
        const currentOwnerIdentity = JSON.stringify([
          getRuntimeTargetForFileOwner(
            state,
            currentFile.worktreeId,
            currentFile.runtimeEnvironmentId
          ),
          currentFile.worktreeId
        ])
        if (currentOwnerIdentity === ownerIdentity) {
          applyRef.current(next)
        }
      }

      const state = useAppStore.getState()
      if (!hasEditorFrameFlush(state, fileId)) {
        applyIfCurrent()
        return
      }

      // Why: a custom editor may keep debounced edits in its frame; only a successful handoff can
      // make it safe to unmount that frame for the new view.
      void flushEditorFrames(state, fileId)
        .then((flushed) => {
          if (flushed) {
            applyIfCurrent()
          }
        })
        .catch(() => {})
    },
    [activeFile, ownerIdentity]
  )

  return { ownerKey, applyRef, handleChange }
}
