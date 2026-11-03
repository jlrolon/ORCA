import {
  ON_DEVICE_TEXT_GENERATION_ID,
  ON_DEVICE_TEXT_GENERATION_MODEL_ID
} from './on-device-text-generation'
import { resolveInstructionsFromNormalized } from './source-control-ai-operation-policy'
import type { SourceControlAiPrCreationDefaults } from './source-control-ai-types'
import type { ResolveSourceControlAiResult } from './source-control-ai'

export function resolveOnDeviceSourceControlAi(args: {
  commandInputTemplate: string
  source: Parameters<typeof resolveInstructionsFromNormalized>[0]
  repoOverrides: Parameters<typeof resolveInstructionsFromNormalized>[1]
  operation: Parameters<typeof resolveInstructionsFromNormalized>[2]
  legacyCustomPrompt?: string
  prCreationDefaults: Required<SourceControlAiPrCreationDefaults>
}): ResolveSourceControlAiResult {
  const customPrompt = resolveInstructionsFromNormalized(
    args.source,
    args.repoOverrides,
    args.operation,
    args.legacyCustomPrompt
  )
  return {
    ok: true,
    value: {
      enabled: true,
      params: {
        agentId: ON_DEVICE_TEXT_GENERATION_ID,
        model: ON_DEVICE_TEXT_GENERATION_MODEL_ID,
        commandInputTemplate: args.commandInputTemplate,
        ...(customPrompt ? { customPrompt } : {})
      },
      prCreationDefaults: args.prCreationDefaults
    }
  }
}
