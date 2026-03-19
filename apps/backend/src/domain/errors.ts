export class IntentNotFoundError extends Error {
  constructor(intentKey: string) {
    super(`Intent not found: ${intentKey}`);
    this.name = "IntentNotFoundError";
  }
}

export class GatewayConnectionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GatewayConnectionError";
  }
}
