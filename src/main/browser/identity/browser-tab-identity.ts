// Share identity between WebContents, CDP and request hooks so user agents and client hints agree.

import { app } from 'electron'
import type { BrowserProcessUserAgentIdentity } from './browser-process-user-agent'
import { googleAuthUserAgent, isGoogleAuthUrl } from './browser-google-auth-ua'

type UserAgentBrand = { brand: string; version: string }

export type UserAgentMetadata = {
  brands: UserAgentBrand[]
  fullVersionList: UserAgentBrand[]
  fullVersion: string
  platform: string
  platformVersion: string
  architecture: string
  model: string
  mobile: boolean
}

export type BrowserTabIdentity =
  /** Desktop client hints remain browser-owned. */
  | { kind: 'process'; userAgent: string }
  /** Electron's own UA on Google sign-in hosts; client hints remain browser-owned. */
  | { kind: 'google-auth'; userAgent: string }
  | { kind: 'mobile'; userAgent: string; userAgentMetadata: UserAgentMetadata }

export function googleAuthTabIdentity(): BrowserTabIdentity {
  return { kind: 'google-auth', userAgent: googleAuthUserAgent() }
}

// Desktop presets preserve process identity; only mobile presets replace it.
export function resolveBrowserTabIdentity(args: {
  url: string
  mobile: boolean
  processIdentity: BrowserProcessUserAgentIdentity
}): BrowserTabIdentity {
  // Sign-in hosts outrank mobile presets: Google rejects identities claiming another browser.
  if (isGoogleAuthUrl(args.url)) {
    return googleAuthTabIdentity()
  }
  if (args.mobile) {
    return buildMobileTabIdentity(args.processIdentity.userAgent)
  }
  return { kind: 'process', userAgent: args.processIdentity.userAgent }
}

// A UA-only CDP override blanks every client hint, which brands the tab as a spoofed
// browser on sign-in and anti-bot checks; ship Chromium-shaped metadata with the override.
export function desktopUserAgentMetadata(userAgent: string): UserAgentMetadata {
  const chromeFull =
    userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? `${extractChromeMajor(userAgent)}.0.0.0`
  const chromeMajor = chromeFull.split('.')[0] ?? extractChromeMajor(userAgent)
  return {
    brands: [
      { brand: 'Not;A=Brand', version: '8' },
      { brand: 'Chromium', version: chromeMajor }
    ],
    fullVersionList: [
      { brand: 'Not;A=Brand', version: '8.0.0.0' },
      { brand: 'Chromium', version: chromeFull }
    ],
    fullVersion: chromeFull,
    platform:
      process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux',
    platformVersion: desktopPlatformVersion(),
    architecture: desktopArchitecture(),
    model: '',
    mobile: false
  }
}

// Chromium reports Windows via the Universal API Contract version, not the OS version:
// Windows 11 builds must map to 13.0.0+ or sites classify the session as Windows 10.
const WINDOWS_PLATFORM_VERSION_BY_MIN_BUILD: ReadonlyArray<readonly [number, string]> = [
  [26100, '19.0.0'],
  [22621, '15.0.0'],
  [22000, '13.0.0'],
  [19041, '10.0.0'],
  [18362, '8.0.0'],
  [17763, '7.0.0'],
  [17134, '6.0.0'],
  [16299, '5.0.0'],
  [15063, '4.0.0'],
  [14393, '3.0.0'],
  [10586, '2.0.0'],
  [10240, '1.0.0']
]

export function windowsClientHintPlatformVersion(systemVersion: string): string {
  const build = Number(systemVersion.split('.')[2])
  if (Number.isFinite(build)) {
    for (const [minBuild, contractVersion] of WINDOWS_PLATFORM_VERSION_BY_MIN_BUILD) {
      if (build >= minBuild) {
        return contractVersion
      }
    }
  }
  return '10.0.0'
}

// Chromium emits numeric major.minor.bugfix; kernel releases carry suffixes ("6.8.0-45-generic").
export function numericClientHintPlatformVersion(systemVersion: string): string {
  const match = systemVersion.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
  return match ? `${match[1]}.${match[2] ?? '0'}.${match[3] ?? '0'}` : ''
}

function desktopPlatformVersion(): string {
  const systemVersion = process.getSystemVersion?.() ?? ''
  return process.platform === 'win32'
    ? windowsClientHintPlatformVersion(systemVersion)
    : numericClientHintPlatformVersion(systemVersion)
}

// Chromium reports the hardware architecture: an x64 build translated on ARM still presents arm.
function desktopArchitecture(): string {
  if (process.arch.startsWith('arm') || app?.runningUnderARM64Translation) {
    return 'arm'
  }
  return 'x86'
}

// Match the mobile UA version to the client-hint brands.
function buildMobileUserAgent(chromeMajor: string): string {
  return `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${chromeMajor}.0.0.0 Mobile/15E148 Safari/604.1`
}

function extractChromeMajor(ua: string): string {
  const match = ua.match(/Chrome\/(\d+)/)
  return match ? match[1] : '134'
}

function buildMobileTabIdentity(processUserAgent: string): BrowserTabIdentity {
  const chromeMajor = extractChromeMajor(processUserAgent)
  return {
    kind: 'mobile',
    userAgent: buildMobileUserAgent(chromeMajor),
    userAgentMetadata: {
      brands: [
        { brand: 'Google Chrome', version: chromeMajor },
        { brand: 'Chromium', version: chromeMajor },
        { brand: 'Not/A)Brand', version: '24' }
      ],
      fullVersionList: [
        { brand: 'Google Chrome', version: `${chromeMajor}.0.0.0` },
        { brand: 'Chromium', version: `${chromeMajor}.0.0.0` },
        { brand: 'Not/A)Brand', version: '24.0.0.0' }
      ],
      fullVersion: `${chromeMajor}.0.0.0`,
      platform: 'iOS',
      platformVersion: '17.0',
      architecture: '',
      model: 'iPhone',
      mobile: true
    }
  }
}
