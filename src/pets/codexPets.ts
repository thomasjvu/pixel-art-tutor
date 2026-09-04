/**
 * The small, app-owned pet contract used by Pixel Art Tutor.
 *
 * Codex does not currently expose a public browser API for reading the pet
 * selected in the desktop app or CLI. When a host wants to provide one, it
 * can inject `window.__CODEX_PET__` or answer the postMessage request below.
 * The local picker remains the honest fallback when no host pet is available.
 */

export type CodexPetVariant = "codey" | "sprout" | "cat" | "star";
export type CodexPetSource = "codex" | "built-in" | "none";
export type PetDiscoveryStatus = "searching" | "detected" | "fallback" | "none";

export interface CodexPet {
  id: string;
  name: string;
  description: string;
  accent: string;
  variant: CodexPetVariant;
  /** Optional avatar or Codex sprite sheet supplied by a host or the local app. */
  imageUrl?: string;
  /** Codex ships 8×9 animation sheets; built-in assets use their first frame here. */
  spriteSheet?: boolean;
}

export const BUILT_IN_CODEX_PETS: readonly CodexPet[] = [
  {
    id: "codex",
    name: "Codex",
    description: "The original blue companion from Codex.",
    accent: "#7d9cff",
    variant: "star",
    imageUrl: "/codex-pets/codex-spritesheet-v4.webp",
    spriteSheet: true,
  },
  {
    id: "dewey",
    name: "Dewey",
    description: "A bright blue drop-shaped companion.",
    accent: "#73d7ff",
    variant: "star",
    imageUrl: "/codex-pets/dewey-spritesheet-v4.webp",
    spriteSheet: true,
  },
  {
    id: "seedy",
    name: "Seedy",
    description: "A soft green friend for growing ideas.",
    accent: "#8fe388",
    variant: "sprout",
    imageUrl: "/codex-pets/seedy-spritesheet-v4.webp",
    spriteSheet: true,
  },
  {
    id: "fireball",
    name: "Fireball",
    description: "A warm little spark with plenty of energy.",
    accent: "#ff8d3d",
    variant: "cat",
    imageUrl: "/codex-pets/fireball-spritesheet-v4.webp",
    spriteSheet: true,
  },
  {
    id: "stacky",
    name: "Stacky",
    description: "A cheerful orange companion for busy builds.",
    accent: "#ffb85c",
    variant: "cat",
    imageUrl: "/codex-pets/stacky-spritesheet-v4.webp",
    spriteSheet: true,
  },
  {
    id: "rocky",
    name: "Rocky",
    description: "A sturdy little pal who keeps projects grounded.",
    accent: "#b7a6ff",
    variant: "cat",
    imageUrl: "/codex-pets/rocky-spritesheet-v4.webp",
    spriteSheet: true,
  },
  {
    id: "null-signal",
    name: "Null Signal",
    description: "A quiet neon guide for strange experiments.",
    accent: "#67e8ff",
    variant: "star",
    imageUrl: "/codex-pets/null-signal-spritesheet-v4.webp",
    spriteSheet: true,
  },
  {
    id: "bsod",
    name: "BSOD",
    description: "A blue screen buddy who is not actually stuck.",
    accent: "#5292ff",
    variant: "codey",
    imageUrl: "/codex-pets/bsod-spritesheet-v4.webp",
    spriteSheet: true,
  },
];

export const DEFAULT_CODEX_PET = BUILT_IN_CODEX_PETS[0];

type PetRecord = Record<string, unknown>;

function record(value: unknown): PetRecord | null {
  return value && typeof value === "object" ? (value as PetRecord) : null;
}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function safeImageUrl(value: unknown): string | undefined {
  const raw = text(value, 400_000);
  if (!raw) return undefined;
  if (raw.startsWith("data:image/") || raw.startsWith("blob:")) return raw;
  if (typeof window === "undefined") return undefined;
  try {
    const url = new URL(raw, window.location.href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function variant(value: unknown, id: string): CodexPetVariant {
  if (value === "codey" || value === "sprout" || value === "cat" || value === "star") return value;
  const match = BUILT_IN_CODEX_PETS.find((pet) => pet.id === id);
  return match?.variant ?? "codey";
}

function fallbackAccent(id: string): string {
  return BUILT_IN_CODEX_PETS.find((pet) => pet.id === id)?.accent ?? DEFAULT_CODEX_PET.accent;
}

/** Convert a host payload into a bounded, display-only pet object. */
export function normalizeCodexPet(value: unknown): CodexPet | null {
  if (typeof value === "string") {
    return BUILT_IN_CODEX_PETS.find(
      (pet) => pet.id === value.trim().toLowerCase() || pet.name.toLowerCase() === value.trim().toLowerCase(),
    ) ?? null;
  }
  const input = record(value);
  if (!input) return null;
  const nested = record(input.pet);
  const source = nested ?? input;
  const knownById = text(source.id, 64)
    ? BUILT_IN_CODEX_PETS.find((pet) => pet.id === String(source.id).trim().toLowerCase())
    : undefined;
  const name = text(source.name, 40) ?? knownById?.name ?? null;
  if (!name) return null;
  const id = (text(source.id, 64) ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).toLowerCase().slice(0, 64) || "codex-pet";
  const known = BUILT_IN_CODEX_PETS.find((pet) => pet.id === id);
  const description = text(source.description, 120) ?? known?.description ?? "Your Codex companion for tiny worlds.";
  const accentCandidate = text(source.accent, 20);
  const accent = accentCandidate && /^#[0-9a-f]{6}$/i.test(accentCandidate)
    ? accentCandidate
    : fallbackAccent(id);
  const imageUrl = safeImageUrl(source.imageUrl ?? source.avatarUrl ?? source.previewUrl ?? source.image ?? known?.imageUrl);
  const spriteSheet = source.spriteSheet === true || known?.spriteSheet === true;
  return {
    id,
    name,
    description,
    accent,
    variant: variant(source.variant, id),
    ...(imageUrl ? { imageUrl } : {}),
    ...(spriteSheet ? { spriteSheet: true } : {}),
  };
}

interface PetHostWindow extends Window {
  __CODEX_PET__?: unknown;
  __CODEX_PETS__?: unknown;
  codex?: { pet?: unknown };
  openai?: { pet?: unknown };
}

function injectedPet(): CodexPet | null {
  if (typeof window === "undefined") return null;
  const host = window as PetHostWindow;
  const catalog = record(host.__CODEX_PETS__);
  const candidates = [
    host.__CODEX_PET__,
    catalog?.selected,
    host.codex?.pet,
    host.openai?.pet,
  ];
  for (const candidate of candidates) {
    const pet = normalizeCodexPet(candidate);
    if (pet) return pet;
  }
  return null;
}

function messagePet(event: MessageEvent): CodexPet | null {
  if (typeof window === "undefined") return null;
  if (event.source !== window && event.source !== window.parent) return null;
  const data = record(event.data);
  if (!data || (data.type !== "pixel-art-tutor:codex-pet" && data.type !== "codex:pet")) return null;
  return normalizeCodexPet(data.pet ?? data);
}

/**
 * Discover a host pet and listen for a late response from an enclosing app.
 * The event/message names are intentionally namespaced to this project; they
 * are an integration seam, not a claim that Codex has a public web API.
 */
export function subscribeToCodexPet(onPet: (pet: CodexPet) => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handleCustomEvent = (event: Event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    const pet = normalizeCodexPet(detail);
    if (pet) onPet(pet);
  };
  const handleMessage = (event: MessageEvent) => {
    const pet = messagePet(event);
    if (pet) onPet(pet);
  };

  window.addEventListener("pixel-art-tutor:codex-pet", handleCustomEvent);
  window.addEventListener("codex:pet", handleCustomEvent);
  window.addEventListener("message", handleMessage);

  const current = injectedPet();
  if (current) onPet(current);
  if (window.parent !== window) {
    window.parent.postMessage({ type: "pixel-art-tutor:request-codex-pet" }, "*");
  }

  return () => {
    window.removeEventListener("pixel-art-tutor:codex-pet", handleCustomEvent);
    window.removeEventListener("codex:pet", handleCustomEvent);
    window.removeEventListener("message", handleMessage);
  };
}

export function petByName(name: string): CodexPet {
  const normalized = name.trim().toLowerCase();
  return BUILT_IN_CODEX_PETS.find((pet) => pet.id === normalized || pet.name.toLowerCase() === normalized) ?? DEFAULT_CODEX_PET;
}
