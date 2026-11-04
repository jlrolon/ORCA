import { describe, expect, it } from 'vitest'
import { isLaunchableFileType } from './launchable-file-type'

const FILE = 0o100644
const EXEC = 0o100755
const DIR = 0o40755
const PATHEXT = '.COM;.EXE;.BAT;.CMD;.VBS;.JS;.WSF;.RUNME'

describe('isLaunchableFileType', () => {
  it.each([
    ['win32', 'C:\\x\\setup.exe', FILE, true],
    ['win32', 'C:\\x\\run.BAT', FILE, true],
    ['win32', 'C:\\x\\trick.exe. .', FILE, true],
    ['win32', 'C:\\x\\a.exe:stream', FILE, true],
    ['win32', 'C:\\x\\tool.runme', FILE, true],
    ['win32', 'C:\\x\\notes.md', EXEC, false],
    ['darwin', '/Applications/Tool.app', DIR, true],
    ['darwin', '/x/run.command', FILE, true],
    ['darwin', '/x/bin/tool', EXEC, true],
    ['darwin', '/x/docs', DIR, false],
    ['darwin', '/x/report.pdf', FILE, false],
    ['darwin', '/x/photo.png', EXEC, false],
    ['linux', '/x/app.desktop', FILE, true],
    ['linux', '/x/elf-binary', EXEC, true],
    ['linux', '/x/install.sh', FILE, true],
    ['linux', '/x/readme.txt', FILE, false],
    ['linux', '/x/page.html', FILE, false]
  ] as const)('%s %s -> %s', (platform, path, mode, expected) => {
    const isFile = (mode & 0o170000) === 0o100000
    expect(isLaunchableFileType({ path, isFile, mode }, platform, PATHEXT)).toBe(expected)
  })
})
