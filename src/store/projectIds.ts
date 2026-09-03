let fallbackCounter = 0;

function safePrefix(prefix: string): string {
  return prefix.replace(/[^a-z0-9_-]/gi, "-").replace(/^-+|-+$/g, "") || "id";
}

function entropyToken(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  fallbackCounter += 1;
  return `${Date.now().toString(36)}-${fallbackCounter.toString(36)}`;
}

export function createUniqueId(prefix: string, usedIds: ReadonlySet<string>): string {
  const normalizedPrefix = safePrefix(prefix);
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `${normalizedPrefix}-${entropyToken()}`;
    if (!usedIds.has(candidate)) return candidate;
  }

  fallbackCounter += 1;
  let candidate = `${normalizedPrefix}-${Date.now().toString(36)}-${fallbackCounter.toString(36)}`;
  while (usedIds.has(candidate)) {
    fallbackCounter += 1;
    candidate = `${normalizedPrefix}-${Date.now().toString(36)}-${fallbackCounter.toString(36)}`;
  }
  return candidate;
}
