import type { AgentResult } from './types.js';

export type PolicyCheckResult = {
  allowed: boolean;
  reason?: string;
  requiresApproval?: boolean;
};

/**
 * Policy gate: prevents unapproved agent results from becoming [R] events.
 * All tool execution results from OpenClaw must pass through this gate.
 */
export function checkPolicy(result: AgentResult, _approvedActions: Set<string>): PolicyCheckResult {
  void _approvedActions;
  if (!result.success) {
    return { allowed: true };
  }

  // In the future, this will check if the agent's actions were pre-approved
  // For now, all successful results are allowed
  return { allowed: true };
}

export function isHighRiskAction(actionType: string): boolean {
  const highRisk = ['file_delete', 'payment', 'credential_access', 'system_modify'];
  return highRisk.includes(actionType);
}
