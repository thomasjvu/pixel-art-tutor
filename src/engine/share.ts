import { MAX_PROJECT_JSON_LENGTH, MAX_SHARE_HASH_LENGTH } from "../projectLimits";

export function encodeProjectToHashParam(json: string): string | null {
  if (json.length > MAX_PROJECT_JSON_LENGTH) return null;
  const bytes = new TextEncoder().encode(json);
  if (Math.ceil((bytes.length * 4) / 3) > MAX_SHARE_HASH_LENGTH) return null;
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const encoded = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return encoded.length <= MAX_SHARE_HASH_LENGTH ? encoded : null;
}

export function decodeProjectFromHashParam(param: string): unknown | null {
  if (!param || param.length > MAX_SHARE_HASH_LENGTH) return null;
  try {
    const b64 = param.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function projectHashFromJson(json: string): string | null {
  try {
    const encoded = encodeProjectToHashParam(JSON.stringify(JSON.parse(json)));
    return encoded ? `#p=${encoded}` : null;
  } catch {
    return null;
  }
}
