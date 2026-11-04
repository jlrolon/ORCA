import { realpath, stat } from 'node:fs/promises'
import { posix, win32 } from 'node:path'
import { blockedPluginSaveAsExtension } from '../../shared/plugins/frames/plugin-save-as-extensions'

export type LaunchableFileFacts = {
  path: string
  isFile: boolean
  mode: number
}

/** True when the OS default handler would run the target (program, script, installer, bundle). */
export function isLaunchableFileType(
  { path, isFile, mode }: LaunchableFileFacts,
  platform: NodeJS.Platform = process.platform,
  windowsPathExt: string | undefined = process.env.PATHEXT
): boolean {
  if (platform === 'win32') {
    // NTFS stream suffixes (`a.exe:s`) still resolve to the base file's type.
    const name = win32.basename(path).split(':')[0]
    if (blockedPluginSaveAsExtension(name)) {
      return true
    }
    const extension = win32.extname(name.replace(/[. ]+$/, '')).toLowerCase()
    return (
      extension.length > 1 &&
      (windowsPathExt ?? '')
        .toLowerCase()
        .split(';')
        .some((entry) => entry.trim() === extension)
    )
  }
  if (blockedPluginSaveAsExtension(path)) {
    return true
  }
  // Extensionless +x files open in Terminal on macOS; typed files (often +x on shared mounts) open by type.
  return isFile && (mode & 0o111) !== 0 && posix.extname(posix.basename(path)) === ''
}

/** Fails closed: anything we cannot inspect is treated as launchable. */
export async function isLaunchablePath(pathValue: string): Promise<boolean> {
  try {
    const [stats, resolvedPath] = await Promise.all([stat(pathValue), realpath(pathValue)])
    const facts = { isFile: stats.isFile(), mode: stats.mode }
    // Check the symlink name and its target: launchers follow links to the real file.
    return (
      isLaunchableFileType({ ...facts, path: pathValue }) ||
      isLaunchableFileType({ ...facts, path: resolvedPath })
    )
  } catch {
    return true
  }
}
