import {
  DEFAULT_WORKSPACE_TOOL_SAFETY_POLICY,
  evaluateSafetyPolicy
} from './workspace-tool-safety-policy'

describe('WorkspaceToolSafetyPolicy', () => {
  describe('default policy', () => {
    it('is conservative: write and dangerous require confirmation', () => {
      expect(DEFAULT_WORKSPACE_TOOL_SAFETY_POLICY).toEqual({
        allowWriteWithoutConfirmation: false,
        allowDangerousWithoutConfirmation: false
      })
    })
  })

  describe('evaluateSafetyPolicy', () => {
    it('always allows read tools without confirmation', () => {
      const decision = evaluateSafetyPolicy('read', DEFAULT_WORKSPACE_TOOL_SAFETY_POLICY)

      expect(decision).toEqual({ allowed: true, requiresConfirmation: false })
    })

    it('requires confirmation for write tools under the default policy', () => {
      const decision = evaluateSafetyPolicy('write', DEFAULT_WORKSPACE_TOOL_SAFETY_POLICY)

      expect(decision).toEqual({ allowed: false, requiresConfirmation: true })
    })

    it('allows write tools without confirmation when opted in', () => {
      const decision = evaluateSafetyPolicy('write', {
        allowWriteWithoutConfirmation: true,
        allowDangerousWithoutConfirmation: false
      })

      expect(decision).toEqual({ allowed: true, requiresConfirmation: false })
    })

    it('requires confirmation for dangerous tools under the default policy', () => {
      const decision = evaluateSafetyPolicy('dangerous', DEFAULT_WORKSPACE_TOOL_SAFETY_POLICY)

      expect(decision).toEqual({ allowed: false, requiresConfirmation: true })
    })

    it('allows dangerous tools without confirmation when opted in', () => {
      const decision = evaluateSafetyPolicy('dangerous', {
        allowWriteWithoutConfirmation: false,
        allowDangerousWithoutConfirmation: true
      })

      expect(decision).toEqual({ allowed: true, requiresConfirmation: false })
    })
  })
})
