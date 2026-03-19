export type HandshakePayload = {
  token?: string;
  deviceId?: string;
};

export type HandshakeOkPayload = {
  sessionId: string;
  userId?: string;
  clientId: string;
  scopeId: string;
  accepted: true;
};

export type HandshakeFailedPayload = {
  accepted: false;
  reason: string;
};
