import type { CritiqueFinding, CritiqueReport, Sprite } from "../types";
import { TRANSPARENT } from "../types";
import { luminance, normalizeHex } from "./color";
import { boundingBox } from "./pixels";

export function critiqueSprite(sprite: Sprite, palette: string[]): CritiqueReport {
  const frame = sprite.frames[0];
  const pixels = frame?.pixels ?? [];
  const findings: CritiqueFinding[] = [];
  let score = 100;

  const used = new Set<number>();
  let filled = 0;
  for (const p of pixels) {
    if (p !== TRANSPARENT) {
      used.add(p);
      filled++;
    }
  }

  if (filled === 0) {
    return {
      spriteId: sprite.id,
      spriteName: sprite.name,
      score: 0,
      stats: { filledPixels: 0 },
      findings: [
        {
          severity: "error",
          title: "Canvas is empty",
          detail: "There are no drawn pixels to evaluate.",
          tip: "Start with a silhouette: block in the whole shape with one mid-tone color before adding any details.",
        },
      ],
    };
  }

  // --- color count ---
  const colorCount = used.size;
  const recommendedMax = sprite.width * sprite.height <= 256 ? 8 : 16;
  if (colorCount > recommendedMax + 8) {
    score -= 18;
    findings.push({
      severity: "error",
      title: `Too many colors (${colorCount})`,
      detail: `Small pixel art reads best with roughly ${recommendedMax} colors or fewer; you are using ${colorCount}.`,
      tip: "Consolidate near-duplicate shades. Pick one hue per material and build a light-to-dark ramp of 3-4 steps.",
    });
  } else if (colorCount > recommendedMax) {
    score -= 8;
    findings.push({
      severity: "warn",
      title: `High color count (${colorCount})`,
      detail: `You are above the ~${recommendedMax}-color comfort zone for a ${sprite.width}\u00d7${sprite.height} sprite.`,
      tip: "Try merging similar hues into shared ramps so the palette stays unified.",
    });
  } else {
    findings.push({
      severity: "info",
      title: `Color count is healthy (${colorCount})`,
      detail: "A focused palette keeps the sprite readable at small sizes.",
      tip: "Keep hue shifts subtle between ramp steps; shift hue as well as brightness for richer shading.",
    });
  }

  // --- value contrast ---
  const lumas = [...used].map((i) => luminance(normalizeHex(palette[i]) ?? "#000000"));
  const minL = Math.min(...lumas);
  const maxL = Math.max(...lumas);
  const range = maxL - minL;
  if (range < 0.35) {
    score -= 15;
    findings.push({
      severity: "warn",
      title: "Low value contrast",
      detail: `Your darkest and lightest colors are close in brightness (range ${(range * 100).toFixed(0)}%). The sprite may look flat or muddy.`,
      tip: "Push highlights brighter and shadows darker. Strong value contrast is what makes pixel art pop on any background.",
    });
  } else {
    findings.push({
      severity: "info",
      title: "Good value range",
      detail: `Brightness spans ${(range * 100).toFixed(0)}% from shadow to highlight.`,
      tip: "Reserve your brightest value for focal points like the face or eyes.",
    });
  }

  // --- outline check ---
  let edgePixels = 0;
  let darkEdgePixels = 0;
  const darkThreshold = 0.16;
  for (let y = 0; y < sprite.height; y++)
    for (let x = 0; x < sprite.width; x++) {
      const i = y * sprite.width + x;
      if (pixels[i] === TRANSPARENT) continue;
      const isEdge =
        x === 0 ||
        y === 0 ||
        x === sprite.width - 1 ||
        y === sprite.height - 1 ||
        pixels[i - 1] === TRANSPARENT ||
        pixels[i + 1] === TRANSPARENT ||
        pixels[i - sprite.width] === TRANSPARENT ||
        pixels[i + sprite.width] === TRANSPARENT;
      if (!isEdge) continue;
      edgePixels++;
      if ((luminance(normalizeHex(palette[pixels[i]]) ?? "#000000")) < darkThreshold) darkEdgePixels++;
    }
  const outlinePct = edgePixels ? (darkEdgePixels / edgePixels) * 100 : 0;
  if (outlinePct < 40 && outlinePct > 0) {
    score -= 10;
    findings.push({
      severity: "warn",
      title: "Weak outline",
      detail: `Only ${outlinePct.toFixed(0)}% of edge pixels use a dark color. Light edges can make sprites melt into bright backgrounds.`,
      tip: "Selective outlining works too: keep outlines dark where the form turns away from light, lighter where it faces it.",
    });
  } else if (outlinePct >= 40) {
    findings.push({
      severity: "info",
      title: "Clear outline",
      detail: `${outlinePct.toFixed(0)}% of edge pixels read as a dark contour.`,
      tip: "Avoid pure black (#000); a tinted dark shade ties the outline into the palette.",
    });
  }

  // --- noise / stray pixels ---
  let strays = 0;
  for (let y = 0; y < sprite.height; y++)
    for (let x = 0; x < sprite.width; x++) {
      const i = y * sprite.width + x;
      if (pixels[i] === TRANSPARENT) continue;
      const n =
        (x > 0 && pixels[i - 1] !== TRANSPARENT ? 1 : 0) +
        (x < sprite.width - 1 && pixels[i + 1] !== TRANSPARENT ? 1 : 0) +
        (y > 0 && pixels[i - sprite.width] !== TRANSPARENT ? 1 : 0) +
        (y < sprite.height - 1 && pixels[i + sprite.width] !== TRANSPARENT ? 1 : 0);
      if (n === 0) strays++;
    }
  if (strays > 4) {
    score -= 12;
    findings.push({
      severity: "warn",
      title: `${strays} stray single pixels`,
      detail: "Isolated dots scattered around the figure usually read as noise rather than texture.",
      tip: "Group detail pixels into clusters of 2+ or remove them; clusters read as intentional marks.",
    });
  }

  // --- symmetry (informational for characters) ---
  let sym = 0;
  let comparable = 0;
  for (let y = 0; y < sprite.height; y++)
    for (let x = 0; x < sprite.width / 2; x++) {
      const a = pixels[y * sprite.width + x];
      const b = pixels[y * sprite.width + (sprite.width - 1 - x)];
      if (a === TRANSPARENT && b === TRANSPARENT) continue;
      comparable++;
      if ((a === TRANSPARENT) === (b === TRANSPARENT)) sym += a === b ? 1 : 0.6;
    }
  const symPct = comparable ? Math.round((sym / comparable) * 100) : 0;

  // --- centering ---
  const bbox = boundingBox(pixels, sprite.width, sprite.height);
  let offsetX = 0;
  let offsetY = 0;
  if (bbox) {
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    offsetX = Math.round(cx - (sprite.width - 1) / 2);
    offsetY = Math.round(cy - (sprite.height - 1) / 2);
    const offMag = Math.abs(offsetX) + Math.abs(offsetY);
    if (offMag > Math.max(2, sprite.width / 6)) {
      score -= 6;
      findings.push({
        severity: "info",
        title: "Artwork sits off-center",
        detail: `The bounding box is offset by ${offsetX >= 0 ? "+" : ""}${offsetX}, ${offsetY >= 0 ? "+" : ""}${offsetY} px from canvas center.`,
        tip: "Centered silhouettes animate more cleanly; use shift operations to recenter before building frames.",
      });
    }
  }

  // --- animation hint ---
  if (sprite.frames.length < 2 && sprite.kind === "character") {
    findings.push({
      severity: "info",
      title: "Single static frame",
      detail: "Characters feel alive with even a simple 2-frame idle bounce.",
      tip: "Duplicate this frame, then shift the body down 1px and squash the bottom row for a classic idle.",
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    spriteId: sprite.id,
    spriteName: sprite.name,
    score,
    stats: {
      size: `${sprite.width}x${sprite.height}`,
      filledPixels: filled,
      colorsUsed: colorCount,
      valueRange: +(range).toFixed(2),
      outlineCoveragePct: Math.round(outlinePct),
      horizontalSymmetryPct: symPct,
      strayPixels: strays,
      frameCount: sprite.frames.length,
    },
    findings,
  };
}
