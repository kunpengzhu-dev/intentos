export type ApprovalSchema = {
  options?: Array<{ id: string; label: string; description?: string }>;
  fields?: Array<{ name: string; type: string; label: string; required?: boolean }>;
};

export type ApprovalDTO = {
  id: string;
  intentId: string;
  runId: string;
  kind: 'confirm' | 'choice' | 'form' | 'auth' | 'risk';
  title: string;
  description?: string;
  schema?: ApprovalSchema;
  deadline?: number;
  defaultDecision?: string;
  blocking: boolean;
  createdAt: number;
};
