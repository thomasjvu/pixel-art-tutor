import type { Project, Sprite } from "../types";
import { spriteLayers, TRANSPARENT } from "../types";

function frameCount(sprite: Sprite): number {
  return Math.max(1, ...spriteLayers(sprite).map((layer) => layer.frames.length));
}

export function renderSpriteToCanvas(
  sprite: Sprite,
  opts: { frameIndex?: number; allFrames?: boolean; scale?: number; palette?: string[]; paletteAlpha?: number[] },
): HTMLCanvasElement {
  const scale = opts.scale ?? 1;
  const palette = opts.palette ?? [];
  const paletteAlpha = opts.paletteAlpha ?? [];
  const layers = spriteLayers(sprite);
  const indexes = opts.allFrames
    ? Array.from({ length: frameCount(sprite) }, (_, index) => index)
    : [Math.max(0, Math.min(frameCount(sprite) - 1, opts.frameIndex ?? 0))];
  const cols = indexes.length;
  const canvas = document.createElement("canvas");
  canvas.width = sprite.width * cols * scale;
  canvas.height = sprite.height * scale;
  const ctx = canvas.getContext("2d")!;
  indexes.forEach((frameIndex, col) => {
    for (const layer of layers) {
      if (!layer.visible) continue;
      const f = layer.frames[Math.min(frameIndex, layer.frames.length - 1)];
      if (!f) continue;
      ctx.globalCompositeOperation = layer.blendMode === "normal" ? "source-over" : layer.blendMode;
      for (let y = 0; y < sprite.height; y++)
        for (let x = 0; x < sprite.width; x++) {
          const p = f.pixels[y * sprite.width + x];
          if (p === TRANSPARENT || !palette[p]) continue;
          ctx.globalAlpha = layer.opacity * (paletteAlpha[p] ?? 1);
          ctx.fillStyle = palette[p];
          ctx.fillRect((col * sprite.width + x) * scale, y * scale, scale, scale);
        }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      }
  });
  return canvas;
}

export interface TextureAtlasEntry {
  spriteId: string;
  spriteName: string;
  frameId: string;
  frameIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pack every sprite's composited cels into one deterministic point-filtered atlas. */
export function renderTextureAtlas(
  project: Project,
  opts: { palette?: string[]; paletteAlpha?: number[]; maxWidth?: number; gap?: number } = {},
): { canvas: HTMLCanvasElement; entries: TextureAtlasEntry[] } {
  const gap = Math.max(0, Math.round(opts.gap ?? 1));
  const sheets = project.sprites.map((sprite) => ({
    sprite,
    sheet: renderSpriteToCanvas(sprite, {
      allFrames: true,
      scale: 1,
      palette: opts.palette ?? project.palette,
      paletteAlpha: opts.paletteAlpha ?? project.paletteAlpha,
    }),
  }));
  const widestSheet = Math.max(1, ...sheets.map(({ sheet }) => sheet.width));
  const maxWidth = Math.max(widestSheet, Math.round(opts.maxWidth ?? 512));
  const placements: Array<{ sprite: Sprite; sheet: HTMLCanvasElement; x: number; y: number }> = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const item of sheets) {
    if (x > 0 && x + item.sheet.width > maxWidth) {
      x = 0;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    placements.push({ ...item, x, y });
    x += item.sheet.width + gap;
    rowHeight = Math.max(rowHeight, item.sheet.height);
  }
  const atlas = document.createElement("canvas");
  atlas.width = Math.max(1, Math.min(maxWidth, Math.max(...placements.map((item) => item.x + item.sheet.width), 1)));
  atlas.height = Math.max(1, y + rowHeight);
  const ctx = atlas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const entries: TextureAtlasEntry[] = [];
  for (const { sprite, sheet, x: px, y: py } of placements) {
    ctx.drawImage(sheet, px, py);
    const count = frameCount(sprite);
    for (let index = 0; index < count; index++) {
      const frame = spriteLayers(sprite)[0]!.frames[Math.min(index, spriteLayers(sprite)[0]!.frames.length - 1)]!;
      entries.push({
        spriteId: sprite.id,
        spriteName: sprite.name,
        frameId: frame.id,
        frameIndex: index,
        x: px + index * sprite.width,
        y: py,
        width: sprite.width,
        height: sprite.height,
      });
    }
  }
  return { canvas: atlas, entries };
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  try {
    // Keep the anchor click in the user gesture. An async toBlob callback is
    // treated as a blocked automatic download by several Chromium builds.
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = filename;
    a.click();
  } catch {
    canvas.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, filename);
    }, "image/png");
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function hexRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16) || 0,
    Number.parseInt(hex.slice(3, 5), 16) || 0,
    Number.parseInt(hex.slice(5, 7), 16) || 0,
  ];
}

function nearestPaletteIndex(r: number, g: number, b: number, palette: string[]): number {
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  palette.forEach((hex, index) => {
    const [pr, pg, pb] = hexRgb(hex);
    const next = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (next < distance) {
      distance = next;
      best = index;
    }
  });
  return best;
}

function writeGifCode(bytes: number[], state: { buffer: number; bits: number }, code: number, size: number) {
  state.buffer |= code << state.bits;
  state.bits += size;
  while (state.bits >= 8) {
    bytes.push(state.buffer & 0xff);
    state.buffer >>>= 8;
    state.bits -= 8;
  }
}

function lzwEncode(indices: number[], minCodeSize = 8): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const bytes: number[] = [];
  const state = { buffer: 0, bits: 0 };
  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;
  let dictionary = new Map<string, number>();
  const reset = () => {
    dictionary = new Map(Array.from({ length: clearCode }, (_, index) => [String(index), index]));
    codeSize = minCodeSize + 1;
    nextCode = endCode + 1;
  };
  reset();
  writeGifCode(bytes, state, clearCode, codeSize);
  if (indices.length > 0) {
    let phrase = String(indices[0]);
    for (let index = 1; index < indices.length; index++) {
      const next = String(indices[index]);
      const candidate = `${phrase},${next}`;
      const existing = dictionary.get(candidate);
      if (existing !== undefined) {
        phrase = candidate;
        continue;
      }
      writeGifCode(bytes, state, dictionary.get(phrase)!, codeSize);
      if (nextCode < 4096) {
        dictionary.set(candidate, nextCode++);
        if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
      } else {
        writeGifCode(bytes, state, clearCode, codeSize);
        reset();
      }
      phrase = next;
    }
    writeGifCode(bytes, state, dictionary.get(phrase)!, codeSize);
  }
  writeGifCode(bytes, state, endCode, codeSize);
  if (state.bits > 0) bytes.push(state.buffer & 0xff);
  return new Uint8Array(bytes);
}

function pushAscii(bytes: number[], text: string): void {
  for (let index = 0; index < text.length; index++) bytes.push(text.charCodeAt(index));
}

function pushU16(bytes: number[], value: number): void {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

/** Encode the active sprite as a palette-indexed animated GIF (GIF89a). */
export function encodeAnimatedGif(
  sprite: Sprite,
  opts: { palette: string[]; paletteAlpha?: number[]; fps?: number; frameIndices?: number[] },
): Blob {
  const palette = opts.palette.slice(0, 256);
  while (palette.length < 256) palette.push("#000000");
  const frameIndices = opts.frameIndices?.length ? opts.frameIndices : Array.from({ length: frameCount(sprite) }, (_, index) => index);
  const bytes: number[] = [];
  pushAscii(bytes, "GIF89a");
  pushU16(bytes, sprite.width);
  pushU16(bytes, sprite.height);
  bytes.push(0xf7, 0, 0);
  palette.forEach((hex) => bytes.push(...hexRgb(hex)));
  bytes.push(0x21, 0xff, 0x0b);
  pushAscii(bytes, "NETSCAPE2.0");
  bytes.push(0x03, 0x01, 0x00, 0x00, 0x00);
  const frameDelay = Math.max(1, Math.round(100 / Math.max(1, Math.min(60, opts.fps ?? 8))));
  const alpha = opts.paletteAlpha ?? [];
  for (const frameIndex of frameIndices) {
    const canvas = renderSpriteToCanvas(sprite, {
      frameIndex,
      scale: 1,
      palette: opts.palette,
      paletteAlpha: alpha,
    });
    const data = canvas.getContext("2d")!.getImageData(0, 0, sprite.width, sprite.height).data;
    const indexes: number[] = [];
    let transparent = false;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3]! < 128) {
        indexes.push(255);
        transparent = true;
      } else {
        indexes.push(nearestPaletteIndex(data[index]!, data[index + 1]!, data[index + 2]!, opts.palette));
      }
    }
    bytes.push(0x21, 0xf9, 0x04, transparent ? 0x05 : 0x04);
    pushU16(bytes, frameDelay);
    bytes.push(255, 0);
    bytes.push(0x2c);
    pushU16(bytes, 0);
    pushU16(bytes, 0);
    pushU16(bytes, sprite.width);
    pushU16(bytes, sprite.height);
    bytes.push(0);
    bytes.push(8);
    const encoded = lzwEncode(indexes, 8);
    for (let offset = 0; offset < encoded.length; offset += 255) {
      const chunk = encoded.slice(offset, offset + 255);
      bytes.push(chunk.length, ...chunk);
    }
    bytes.push(0);
  }
  bytes.push(0x3b);
  return new Blob([new Uint8Array(bytes)], { type: "image/gif" });
}

export function downloadText(text: string, filename: string, mimeType = "application/json") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function spriteFileStem(name: string): string {
  return (
    name
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "sprite"
  );
}

/** A ready-to-drop Godot SpriteFrames resource for the exported horizontal sheet. */
export function godotSpriteFrames(
  sprite: Sprite,
  opts: { texturePath: string; fps: number },
): string {
  const atlasResources = sprite.frames
    .map(
      (_, i) =>
        `[sub_resource type="AtlasTexture" id="AtlasTexture_${i}"]\natlas = ExtResource("1_sheet")\nregion = Rect2(${i * sprite.width}, 0, ${sprite.width}, ${sprite.height})`,
    )
    .join("\n\n");
  const frameResources = sprite.frames
    .map((_, i) => `{"duration": 1.0, "texture": SubResource("AtlasTexture_${i}")}`)
    .join(",\n");
  const fps = Math.max(1, Math.round(opts.fps));
  return `[gd_resource type="SpriteFrames" load_steps=${sprite.frames.length + 2} format=3]

[ext_resource type="Texture2D" path="${opts.texturePath}" id="1_sheet"]

${atlasResources}

[resource]
animations = [{
"frames": [${frameResources}],
"loop": true,
"name": &"default",
"speed": ${fps}.0
}]
`;
}

function stableGuid(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `${hex}${hex.split("").reverse().join("")}${hex}${hex.split("").reverse().join("")}`;
}

/** Unity TextureImporter metadata: drop beside the PNG and Unity will import/slice it. */
export function unityTextureMeta(sprite: Sprite): string {
  const stem = spriteFileStem(sprite.name);
  const slices = sprite.frames
    .map(
      (_, i) => `    - serializedVersion: 2
      name: ${stem}_${i + 1}
      rect:
        serializedVersion: 2
        x: ${i * sprite.width}
        y: 0
        width: ${sprite.width}
        height: ${sprite.height}
      alignment: 0
      pivot: {x: 0.5, y: 0.5}
      border: {x: 0, y: 0, w: 0, h: 0}
      outline: []
      physicsShape: []
      tessellationDetail: 0
      bones: []
      spriteID: ${stableGuid(`${sprite.id}-${i}`)}
      internalID: ${21300000 + i}`,
    )
    .join("\n");
  return `fileFormatVersion: 2
guid: ${stableGuid(sprite.id)}
TextureImporter:
  internalIDToNameTable: []
  externalObjects: {}
  serializedVersion: 12
  mipmaps:
    mipMapMode: 0
    enableMipMap: 0
    sRGBTexture: 1
    linearTexture: 0
    fadeOut: 0
    borderMipMap: 0
    mipMapsPreserveCoverage: 0
    alphaTestReferenceValue: 0.5
    mipMapFadeDistanceStart: 1
    mipMapFadeDistanceEnd: 3
  bumpmap:
    convertToNormalMap: 0
    externalNormalMap: 0
    heightScale: 0.25
    normalMapFilter: 0
  isReadable: 1
  streamingMipmaps: 0
  streamingMipmapsPriority: 0
  vTOnly: 0
  ignoreMasterTextureLimit: 0
  grayScaleToAlpha: 0
  generateCubemap: 6
  cubemapConvolution: 0
  seamlessCubemap: 0
  textureFormat: 1
  maxTextureSize: 2048
  textureSettings:
    serializedVersion: 2
    filterMode: 0
    aniso: 1
    mipBias: 0
    wrapU: 0
    wrapV: 0
    wrapW: 0
  nPOTScale: 0
  lightmap: 0
  compressionQuality: 50
  spriteMode: 2
  spriteExtrude: 1
  spriteMeshType: 1
  alignment: 0
  spritePivot: {x: 0.5, y: 0.5}
  spritePixelsToUnits: ${Math.max(sprite.width, sprite.height)}
  spriteBorder: {x: 0, y: 0, w: 0, h: 0}
  alphaUsage: 1
  alphaIsTransparency: 1
  spriteTessellationDetail: -1
  textureType: 8
  textureShape: 1
  platformSettings: []
  spriteSheet:
    serializedVersion: 2
    sprites:
${slices}
    outline: []
    physicsShape: []
    bones: []
    spriteID: ${stableGuid(sprite.id)}
    vertices: []
    indices:
    edges: []
    weights: []
  secondaryTextures: []
  spritePackingTag:
  userData:
  assetBundleName:
  assetBundleVariant:
`;
}

export function unitySpriteManifest(sprite: Sprite, fps: number): string {
  return JSON.stringify(
    {
      format: "pixel-art-tutor/unity-sprite-sheet",
      texture: `${spriteFileStem(sprite.name)}-sheet.png`,
      filterMode: "Point",
      spriteMode: "Multiple",
      pixelsPerUnit: Math.max(sprite.width, sprite.height),
      fps: Math.max(1, Math.round(fps)),
      frames: sprite.frames.map((frame, index) => ({
        id: frame.id,
        name: `${spriteFileStem(sprite.name)}_${index + 1}`,
        rect: { x: index * sprite.width, y: 0, width: sprite.width, height: sprite.height },
      })),
    },
    null,
    2,
  );
}
