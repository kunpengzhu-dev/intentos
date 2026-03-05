export type ChatSendPayload = {
  message: string;
  contextId?: string;
};

export type ChatDeltaPayload = {
  delta: string;
  done: boolean;
  contextId: string;
};
