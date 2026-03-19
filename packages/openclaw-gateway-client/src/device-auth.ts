import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type GatewayDeviceIdentity = {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
};

type StoredGatewayDeviceIdentity = {
  version: 1;
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
  createdAtMs: number;
};

export type GatewaySignedDevice = {
  id: string;
  publicKey: string;
  signature: string;
  signedAt: number;
  nonce: string;
};

export type GatewayDeviceAuthPayloadV3Params = {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce: string;
  platform?: string | null;
  deviceFamily?: string | null;
};

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function normalizeMetadata(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/gu, "");
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const key = crypto.createPublicKey(publicKeyPem);
  const spki = key.export({ type: "spki", format: "der" }) as Buffer;
  if (
    spki.length === ED25519_SPKI_PREFIX.length + 32 &&
    spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }
  return spki;
}

function fingerprintPublicKey(publicKeyPem: string): string {
  return crypto.createHash("sha256").update(derivePublicKeyRaw(publicKeyPem)).digest("hex");
}

function generateDeviceIdentity(): GatewayDeviceIdentity {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return {
    deviceId: fingerprintPublicKey(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
  };
}

export function resolveDefaultGatewayDeviceIdentityPath(): string {
  const stateDir = process.env.OPENCLAW_GATEWAY_CLIENT_STATE_DIR?.trim();
  if (stateDir) {
    return path.join(stateDir, "identity", "device.json");
  }
  return path.join(os.homedir(), ".openclaw-gateway-client", "identity", "device.json");
}

export function loadOrCreateGatewayDeviceIdentity(
  filePath = resolveDefaultGatewayDeviceIdentityPath(),
): GatewayDeviceIdentity {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as StoredGatewayDeviceIdentity;
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === "string" &&
        typeof parsed.publicKeyPem === "string" &&
        typeof parsed.privateKeyPem === "string"
      ) {
        const derivedId = fingerprintPublicKey(parsed.publicKeyPem);
        if (derivedId !== parsed.deviceId) {
          const repaired: StoredGatewayDeviceIdentity = {
            ...parsed,
            deviceId: derivedId,
          };
          fs.writeFileSync(filePath, `${JSON.stringify(repaired, null, 2)}\n`, { mode: 0o600 });
          return {
            deviceId: derivedId,
            publicKeyPem: parsed.publicKeyPem,
            privateKeyPem: parsed.privateKeyPem,
          };
        }
        return {
          deviceId: parsed.deviceId,
          publicKeyPem: parsed.publicKeyPem,
          privateKeyPem: parsed.privateKeyPem,
        };
      }
    }
  } catch {
    // Fall through and regenerate when the stored identity is unreadable.
  }

  const identity = generateDeviceIdentity();
  ensureDir(filePath);
  const stored: StoredGatewayDeviceIdentity = {
    version: 1,
    deviceId: identity.deviceId,
    publicKeyPem: identity.publicKeyPem,
    privateKeyPem: identity.privateKeyPem,
    createdAtMs: Date.now(),
  };
  fs.writeFileSync(filePath, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
  return identity;
}

export function signGatewayDevicePayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  const signature = crypto.sign(null, Buffer.from(payload, "utf8"), key);
  return base64UrlEncode(signature);
}

export function publicKeyRawBase64UrlFromPem(publicKeyPem: string): string {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem));
}

export function buildGatewayDeviceAuthPayloadV3(
  params: GatewayDeviceAuthPayloadV3Params,
): string {
  return [
    "v3",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(","),
    String(params.signedAtMs),
    params.token ?? "",
    params.nonce,
    normalizeMetadata(params.platform),
    normalizeMetadata(params.deviceFamily),
  ].join("|");
}

export function createSignedGatewayDevice(params: {
  identity: GatewayDeviceIdentity;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce: string;
  platform?: string | null;
  deviceFamily?: string | null;
}): GatewaySignedDevice {
  const payload = buildGatewayDeviceAuthPayloadV3({
    deviceId: params.identity.deviceId,
    clientId: params.clientId,
    clientMode: params.clientMode,
    role: params.role,
    scopes: params.scopes,
    signedAtMs: params.signedAtMs,
    token: params.token,
    nonce: params.nonce,
    platform: params.platform,
    deviceFamily: params.deviceFamily,
  });
  return {
    id: params.identity.deviceId,
    publicKey: publicKeyRawBase64UrlFromPem(params.identity.publicKeyPem),
    signature: signGatewayDevicePayload(params.identity.privateKeyPem, payload),
    signedAt: params.signedAtMs,
    nonce: params.nonce,
  };
}
