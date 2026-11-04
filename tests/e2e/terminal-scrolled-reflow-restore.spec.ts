import { randomUUID } from 'node:crypto'
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from './helpers/orca-app'
import { ensureTerminalVisible, waitForSessionReady } from './helpers/store'
import {
  getTerminalContent,
  sendToTerminal,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'
import { nodeTerminalCommand } from './terminal-node-command'
import { waitForPtyShellEcho } from './terminal-pty-readiness'

test('scrollback keeps the same reply visible across terminal resize', async ({
  orcaPage,
  testRepoPath
}) => {
  await waitForSessionReady(orcaPage)
  await orcaPage.setViewportSize({ width: 1180, height: 820 })
  await ensureTerminalVisible(orcaPage)
  await waitForActiveTerminalManager(orcaPage, 30_000)
  const pty = await waitForActivePanePtyId(orcaPage)
  await waitForPtyShellEcho(orcaPage, pty, 15_000)
  const id = randomUUID()
  const file = path.join(testRepoPath, `.orca-resize-${id}.mjs`)
  const prefix = `ORCA_RESIZE_${id}`
  const text = [
    ...Array.from(
      { length: 80 },
      (_, i) =>
        `${prefix}_PARA_${i} ${'A fictional reading room has shelves and windows. '.repeat(8)}\n\n`
    ),
    `${prefix}_ANCHOR_REPLY first answer remains visible.\n\n---\n\n${prefix}_Q2 Should the first message create the conversation?\n\n${prefix}_YES yes.\n\n---\n\n${prefix}_Q3 What goes into each turn?\n\n${prefix}_THREE yes to all three.\n`,
    ...Array.from({ length: 150 }, (_, i) => `${prefix}_AFTER_${i}\n`),
    `${prefix}_DONE\n`
  ].join('')
  writeFileSync(file, `process.stdout.write(${JSON.stringify(text)})`)
  try {
    await sendToTerminal(orcaPage, pty, `${nodeTerminalCommand([file])}\r`)
    await expect
      .poll(() => getTerminalContent(orcaPage, 30_000), { timeout: 20_000 })
      .toContain(`${prefix}_DONE`)
    const visible = async () =>
      orcaPage.evaluate(
        ({ anchor }) => {
          const state = window.__store?.getState()
          const manager = state?.activeTabId ? window.__paneManagers?.get(state.activeTabId) : null
          const pane = manager?.getActivePane?.() ?? manager?.getPanes?.()[0]
          if (!pane) {
            throw new Error('No active terminal')
          }
          const b = pane.terminal.buffer.active
          const full = Array.from(
            { length: b.length },
            (_, i) => b.getLine(i)?.translateToString(true) ?? ''
          ).join('')
          return {
            viewportY: b.viewportY,
            baseY: b.baseY,
            cols: pane.terminal.cols,
            hasAnchor: full.includes(anchor),
            text: Array.from(
              { length: pane.terminal.rows },
              (_, i) => b.getLine(b.viewportY + i)?.translateToString(true) ?? ''
            ).join('\n')
          }
        },
        { anchor: `${prefix}_ANCHOR_REPLY` }
      )
    const box = await orcaPage.locator('.xterm').first().boundingBox()
    if (!box) {
      throw new Error('Terminal is not visible')
    }
    await orcaPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    for (let i = 0; i < 60 && !(await visible()).text.includes(`${prefix}_ANCHOR_REPLY`); i++) {
      const previous = (await visible()).viewportY
      await orcaPage.mouse.wheel(0, -240)
      await expect.poll(async () => (await visible()).viewportY).toBeLessThan(previous)
    }
    expect((await visible()).text).toContain(`${prefix}_ANCHOR_REPLY`)
    expect((await visible()).viewportY).toBeLessThan((await visible()).baseY)
    const before = await visible()
    await orcaPage.setViewportSize({ width: 900, height: 820 })
    await expect.poll(async () => (await visible()).cols, { timeout: 10_000 }).not.toBe(before.cols)
    await expect
      .poll(async () => (await visible()).text.replaceAll('\n', ''), { timeout: 10_000 })
      .toContain(`${prefix}_ANCHOR_REPLY`)
    expect((await visible()).hasAnchor, 'reply remains in terminal buffer').toBe(true)
  } finally {
    rmSync(file, { force: true })
  }
})
