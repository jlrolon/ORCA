import { useEffect, useRef, type RefObject } from 'react'
import { addAppKeyListener, removeAppKeyListener } from '@/lib/app-keyboard-router'
import type { EditorToggleValue } from './view-mode/EditorViewToggle'
import { editorShortcutMatches } from './editor-shortcuts'

type EditorViewCommandsProps = {
  ownerKey: string
  enabled: boolean
  panelRef: RefObject<HTMLDivElement | null>
  value: EditorToggleValue
  modes: readonly EditorToggleValue[]
  onChange: (next: EditorToggleValue) => void
}

export function EditorViewCommands({
  ownerKey,
  enabled,
  panelRef,
  value,
  modes,
  onChange
}: EditorViewCommandsProps): null {
  const rememberedNonChangesModeRef = useRef<EditorToggleValue | null>(
    value === 'changes' ? null : value
  )
  const ownerKeyRef = useRef(ownerKey)

  if (ownerKeyRef.current !== ownerKey) {
    ownerKeyRef.current = ownerKey
    rememberedNonChangesModeRef.current = value === 'changes' ? null : value
  } else if (value !== 'changes') {
    // Track committed pointer changes too, so the command returns to the mode the user actually left.
    rememberedNonChangesModeRef.current = value
  }

  useEffect(() => {
    if (!enabled) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || event.key === 'Process') {
        return
      }

      const root = panelRef.current
      const target = event.target
      if (!root || !(target instanceof Node) || !root.contains(target)) {
        return
      }
      if (target instanceof Element && target.closest('[data-shortcut-recorder-active]')) {
        return
      }

      const togglesChanges = editorShortcutMatches('editor.toggleChanges', event)
      const cyclesView = !togglesChanges && editorShortcutMatches('editor.cycleViewMode', event)
      if (!togglesChanges && !cyclesView) {
        return
      }

      let next: EditorToggleValue | undefined
      if (togglesChanges) {
        if (!modes.includes('changes')) {
          return
        }
        if (value === 'changes') {
          const remembered = rememberedNonChangesModeRef.current
          next =
            remembered && modes.includes(remembered)
              ? remembered
              : modes.find((mode) => mode !== 'changes')
        } else {
          next = 'changes'
        }
      } else if (modes.length > 0) {
        const currentIndex = modes.indexOf(value)
        next = modes[(currentIndex + 1) % modes.length]
      }

      if (!next || next === value) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      if (event.repeat) {
        return
      }

      if (next === 'changes') {
        rememberedNonChangesModeRef.current = value
      }
      onChange(next)
    }

    addAppKeyListener('keydown', handleKeyDown)
    return () => removeAppKeyListener('keydown', handleKeyDown)
  }, [enabled, modes, onChange, panelRef, value])

  return null
}
