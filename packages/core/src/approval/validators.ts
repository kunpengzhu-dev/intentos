export type ApprovalDecision = {
  approvalId: string;
  decision: string;
  data?: unknown;
};

export function isValidApprovalDecision(decision: ApprovalDecision): boolean {
  return !!decision.approvalId && !!decision.decision;
}

export function isHighRiskApproval(kind: string): boolean {
  return kind === 'auth' || kind === 'risk';
}
