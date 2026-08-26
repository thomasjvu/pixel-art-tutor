import type { Sprite } from "../types";
import { TRANSPARENT } from "../types";

export function renderSpriteToCanvas(
  sprite: Sprite,
  opts: { frameIndex?: number; allFrames?: boolean; scale?: number; palette?: string[] },
): HTMLCanvasElement {
  const scale = opts.scale ?? 1;
  const palette = opts.palette ?? [];
  const frames =
    opts.allFrames
      ? sprite.frames
      : [sprite.frames[opts.frameIndex ?? 0] ?? sprite.frames[0]];
  const cols = frames.length;
  const canvas = document.createElement("canvas");
  canvas.width = sprite.width * cols * scale;
  canvas.height = sprite.height * scale;
  const ctx = canvas.getContext("2d")!;
  frames.forEach((f, col) => {
    if (!f) return;
    for (let y = 0; y < sprite.height; y++)
      for (let x = 0; x < sprite.width; x++) {
        const p = f.pixels[y * sprite.width + x];
        if (p === TRANSPARENT || !palette[p]) continue;
        ctx.fillStyle = palette[p];
        ctx.fillRect((col * sprite.width + x) * scale, y * scale, scale, scale);
      }
  });
  return canvas;
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
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
