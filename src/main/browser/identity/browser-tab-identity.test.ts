import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { runningUnderARM64Translation: false } }))

const { numericClientHintPlatformVersion, windowsClientHintPlatformVersion } =
  await import('./browser-tab-identity')

describe('windowsClientHintPlatformVersion', () => {
  it.each([
    ['Windows 10 1507', '10.0.10240', '1.0.0'],
    ['Windows 10 1809', '10.0.17763', '7.0.0'],
    ['Windows 10 22H2', '10.0.19045', '10.0.0'],
    ['Windows 11 21H2', '10.0.22000', '13.0.0'],
    ['Windows 11 23H2', '10.0.22631', '15.0.0'],
    ['Windows 11 24H2', '10.0.26100', '19.0.0']
  ])('maps %s to its Universal API Contract version', (_label, systemVersion, expected) => {
    expect(windowsClientHintPlatformVersion(systemVersion)).toBe(expected)
  })

  it('falls back to a Windows 10 contract version when the build cannot be parsed', () => {
    expect(windowsClientHintPlatformVersion('')).toBe('10.0.0')
  })
})

describe('numericClientHintPlatformVersion', () => {
  it.each([
    ['a two-component macOS version', '15.1', '15.1.0'],
    ['a three-component macOS version', '14.6.1', '14.6.1'],
    ['a version with a non-numeric tail', '14.6.1 (build)', '14.6.1'],
    ['a non-numeric version', 'unknown', '']
  ])('normalizes %s to numeric major.minor.bugfix', (_label, systemVersion, expected) => {
    expect(numericClientHintPlatformVersion(systemVersion)).toBe(expected)
  })
})
