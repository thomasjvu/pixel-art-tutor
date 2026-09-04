(async () => {
  const mc = document.modelContext;
  if (!mc) return JSON.stringify({ ok: false, error: "document.modelContext missing" });
  const tools = await mc.getTools();
  const call = async (name, input) => {
    const tool = tools.find((t) => t.name === name);
    if (!tool) return { ok: false, error: `missing tool ${name}` };
    const raw = await mc.executeTool(tool, JSON.stringify(input ?? {}));
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };

  const INK = "#1a1c2c";
  const NAVY = "#29366f";
  const MINT = "#39c5bb";
  const MINT_DK = "#257179";
  const RED = "#ff2e2e";
  const ROSE = "#d9576b";
  const CREAM = "#f4f4f4";
  const SAND = "#ffcd75";
  const GOLD = "#ffd166";
  const GREEN = "#38b764";
  const LEAF = "#a7f070";
  const SKY = "#41a6f6";
  const ICE = "#73eff7";
  const BLUE = "#3b5dc9";
  const SLATE = "#333c57";

  await call("add_palette_color", { hex: MINT });
  await call("add_palette_color", { hex: RED });
  await call("rename_project", { name: "Gallery Sprites" });
  await call("set_canvas_options", { zoom: 8 });

  const SIZE = 64;

  function blank() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  }
  function plot(g, x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) g[y][x] = c;
  }
  function fillRect(g, x, y, w, h, c) {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) plot(g, x + xx, y + yy, c);
  }
  function fillCircle(g, cx, cy, r, c) {
    const rr = r * r;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= rr) plot(g, cx + x, cy + y, c);
      }
    }
  }
  function fillEllipse(g, cx, cy, rx, ry, c) {
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        if (rx && ry && (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) plot(g, cx + x, cy + y, c);
      }
    }
  }
  function inPoly(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1];
      const xj = pts[j][0], yj = pts[j][1];
      const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
      if (hit) inside = !inside;
    }
    return inside;
  }
  function fillPoly(g, pts, c) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.floor(Math.min(...xs));
    const maxX = Math.ceil(Math.max(...xs));
    const minY = Math.floor(Math.min(...ys));
    const maxY = Math.ceil(Math.max(...ys));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (inPoly(x + 0.5, y + 0.5, pts)) plot(g, x, y, c);
      }
    }
  }
  function pixelsOf(g) {
    const pixels = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (g[y][x]) pixels.push({ x, y, color: g[y][x] });
      }
    }
    return pixels;
  }

  function slimeWizard() {
    const g = blank();
    fillCircle(g, 34, 38, 20, NAVY);
    fillCircle(g, 34, 38, 18, MINT);
    fillCircle(g, 28, 32, 5, "#70c1b3");
    fillEllipse(g, 34, 18, 16, 7, NAVY);
    fillEllipse(g, 34, 18, 14, 5, MINT);
    fillPoly(g, [[22, 18], [46, 18], [40, 4], [32, 0], [24, 6]], NAVY);
    fillPoly(g, [[24, 17], [44, 17], [38, 6], [32, 3], [26, 8]], MINT);
    fillRect(g, 22, 16, 24, 3, GOLD);
    fillCircle(g, 40, 5, 2, GOLD);
    fillRect(g, 10, 22, 4, 20, SAND);
    fillRect(g, 11, 22, 2, 20, GOLD);
    fillEllipse(g, 12, 18, 5, 6, RED);
    fillEllipse(g, 12, 17, 3, 3, ROSE);
    fillRect(g, 27, 36, 3, 4, INK);
    fillRect(g, 38, 36, 3, 4, INK);
    plot(g, 28, 37, CREAM);
    plot(g, 39, 37, CREAM);
    for (const [x, y] of [[30, 42], [31, 43], [32, 44], [33, 44], [34, 44], [35, 43], [36, 42]]) plot(g, x, y, INK);
    fillEllipse(g, 26, 54, 5, 3, MINT_DK);
    fillEllipse(g, 40, 54, 5, 3, MINT_DK);
    return g;
  }

  function creamCat() {
    const g = blank();
    fillEllipse(g, 32, 42, 16, 14, NAVY);
    fillEllipse(g, 32, 42, 14, 12, CREAM);
    fillPoly(g, [[16, 28], [22, 12], [28, 28]], NAVY);
    fillPoly(g, [[36, 28], [42, 12], [48, 28]], NAVY);
    fillPoly(g, [[18, 27], [22, 15], [26, 27]], SAND);
    fillPoly(g, [[38, 27], [42, 15], [46, 27]], SAND);
    fillCircle(g, 32, 30, 13, NAVY);
    fillCircle(g, 32, 30, 11, CREAM);
    fillCircle(g, 27, 30, 3, MINT);
    fillCircle(g, 37, 30, 3, MINT);
    fillCircle(g, 27, 30, 1, INK);
    fillCircle(g, 37, 30, 1, INK);
    fillRect(g, 31, 33, 2, 2, RED);
    fillRect(g, 24, 40, 16, 3, MINT);
    fillCircle(g, 32, 43, 3, GOLD);
    fillEllipse(g, 48, 46, 4, 10, NAVY);
    fillEllipse(g, 48, 46, 3, 8, CREAM);
    plot(g, 30, 36, INK);
    plot(g, 33, 36, INK);
    return g;
  }

  function wingedHeart() {
    const g = blank();
    const heart = (cx, cy, s, c) => {
      for (let y = -s * 2; y <= s * 2; y++) {
        for (let x = -s * 2; x <= s * 2; x++) {
          const nx = x / s;
          const ny = -y / s;
          const a = nx * nx + ny * ny - 1;
          if (a * a * a - nx * nx * ny * ny * ny <= 0) plot(g, cx + x, cy + y, c);
        }
      }
    };
    heart(32, 34, 13, NAVY);
    heart(32, 34, 11, RED);
    heart(32, 34, 8, ROSE);
    fillCircle(g, 26, 28, 3, CREAM);
    fillPoly(g, [[8, 32], [18, 24], [22, 30], [16, 36], [10, 38]], NAVY);
    fillPoly(g, [[10, 32], [18, 26], [20, 30], [16, 34], [12, 36]], CREAM);
    fillPoly(g, [[56, 32], [46, 24], [42, 30], [48, 36], [54, 38]], NAVY);
    fillPoly(g, [[54, 32], [46, 26], [44, 30], [48, 34], [52, 36]], CREAM);
    plot(g, 20, 18, GOLD);
    plot(g, 44, 16, GOLD);
    plot(g, 48, 22, SAND);
    return g;
  }

  function capMushroom() {
    const g = blank();
    fillEllipse(g, 32, 44, 12, 14, NAVY);
    fillEllipse(g, 32, 44, 10, 12, MINT);
    fillEllipse(g, 32, 24, 22, 14, NAVY);
    fillEllipse(g, 32, 24, 20, 12, RED);
    fillCircle(g, 22, 22, 4, SAND);
    fillCircle(g, 34, 16, 5, CREAM);
    fillCircle(g, 44, 24, 4, SAND);
    fillCircle(g, 28, 28, 3, CREAM);
    fillRect(g, 27, 42, 3, 3, INK);
    fillRect(g, 35, 42, 3, 3, INK);
    for (const [x, y] of [[29, 48], [30, 49], [31, 50], [32, 50], [33, 49], [34, 48]]) plot(g, x, y, INK);
    fillEllipse(g, 24, 56, 5, 3, MINT_DK);
    fillEllipse(g, 40, 56, 5, 3, MINT_DK);
    return g;
  }

  function mintPotion() {
    const g = blank();
    fillRect(g, 28, 8, 8, 8, SAND);
    fillRect(g, 29, 9, 6, 6, GOLD);
    fillRect(g, 24, 14, 16, 6, NAVY);
    fillRect(g, 26, 15, 12, 4, SLATE);
    fillEllipse(g, 32, 38, 16, 18, NAVY);
    fillEllipse(g, 32, 38, 14, 16, "#94b0c2");
    fillEllipse(g, 32, 38, 12, 14, INK);
    fillEllipse(g, 32, 44, 12, 8, MINT);
    fillRect(g, 20, 40, 24, 10, MINT);
    fillEllipse(g, 32, 50, 12, 4, MINT_DK);
    fillCircle(g, 26, 42, 1, ICE);
    fillCircle(g, 30, 46, 1, CREAM);
    fillCircle(g, 36, 43, 1, ICE);
    fillCircle(g, 48, 16, 2, GOLD);
    plot(g, 46, 16, GOLD);
    plot(g, 50, 16, GOLD);
    plot(g, 48, 14, GOLD);
    plot(g, 48, 18, GOLD);
    return g;
  }

  function sparkStar() {
    const g = blank();
    const star = (cx, cy, r, c) => {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? r : r * 0.4;
        pts.push([cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]);
      }
      fillPoly(g, pts, c);
    };
    star(32, 33, 26, NAVY);
    star(32, 33, 22, GOLD);
    star(32, 33, 16, SAND);
    fillCircle(g, 27, 30, 3, INK);
    fillCircle(g, 37, 30, 3, INK);
    plot(g, 28, 29, CREAM);
    plot(g, 38, 29, CREAM);
    fillCircle(g, 26, 34, 1, ROSE);
    fillCircle(g, 38, 34, 1, ROSE);
    for (const [x, y] of [[29, 38], [30, 39], [31, 40], [32, 40], [33, 40], [34, 39], [35, 38]]) plot(g, x, y, INK);
    plot(g, 10, 12, MINT);
    plot(g, 52, 14, ICE);
    plot(g, 14, 50, MINT);
    plot(g, 50, 48, GOLD);
    return g;
  }

  function sproutPal() {
    const g = blank();
    fillCircle(g, 32, 40, 18, NAVY);
    fillCircle(g, 32, 40, 16, GREEN);
    fillCircle(g, 26, 34, 5, LEAF);
    fillPoly(g, [[30, 22], [32, 6], [42, 14], [38, 22], [34, 24]], NAVY);
    fillPoly(g, [[31, 21], [33, 8], [40, 14], [36, 21], [33, 22]], LEAF);
    fillPoly(g, [[33, 12], [38, 14], [35, 18]], GREEN);
    fillRect(g, 26, 38, 3, 4, INK);
    fillRect(g, 35, 38, 3, 4, INK);
    plot(g, 27, 39, CREAM);
    plot(g, 36, 39, CREAM);
    for (const [x, y] of [[29, 46], [30, 47], [31, 48], [32, 48], [33, 47], [34, 46]]) plot(g, x, y, INK);
    fillEllipse(g, 24, 55, 5, 3, "#257179");
    fillEllipse(g, 40, 55, 5, 3, "#257179");
    return g;
  }

  function cloudBuddy() {
    const g = blank();
    fillCircle(g, 24, 36, 14, NAVY);
    fillCircle(g, 40, 36, 14, NAVY);
    fillCircle(g, 32, 28, 16, NAVY);
    fillCircle(g, 32, 42, 14, NAVY);
    fillCircle(g, 24, 36, 12, SKY);
    fillCircle(g, 40, 36, 12, SKY);
    fillCircle(g, 32, 28, 14, SKY);
    fillCircle(g, 32, 42, 12, SKY);
    fillCircle(g, 26, 30, 4, ICE);
    fillEllipse(g, 32, 36, 8, 6, INK);
    fillRect(g, 28, 34, 3, 2, ICE);
    fillRect(g, 34, 34, 3, 2, ICE);
    fillRect(g, 30, 38, 5, 2, ICE);
    fillEllipse(g, 22, 52, 5, 3, BLUE);
    fillEllipse(g, 42, 52, 5, 3, BLUE);
    return g;
  }

  const sprites = [
    { name: "Slime Wizard", draw: slimeWizard },
    { name: "Cream Cat", draw: creamCat },
    { name: "Winged Heart", draw: wingedHeart },
    { name: "Cap Mushroom", draw: capMushroom },
    { name: "Mint Potion", draw: mintPotion },
    { name: "Spark Star", draw: sparkStar },
    { name: "Sprout Pal", draw: sproutPal },
    { name: "Cloud Buddy", draw: cloudBuddy },
  ];

  const created = [];
  for (const spec of sprites) {
    const added = await call("add_sprite", {
      name: spec.name,
      width: SIZE,
      height: SIZE,
      kind: "item",
      frameCount: 1,
    });
    if (!added || added.ok === false) {
      created.push({ name: spec.name, error: added?.error || "add_sprite failed" });
      continue;
    }
    await call("set_active_sprite", { spriteId: added.spriteId });
    const pixels = pixelsOf(spec.draw());
    const painted = await call("set_pixels", { pixels, spriteId: added.spriteId, frameIndex: 0 });
    created.push({
      name: spec.name,
      spriteId: added.spriteId,
      pixels: pixels.length,
      painted,
    });
  }

  const state = await call("get_project_state", {});
  return JSON.stringify({ ok: true, created, sprites: state.sprites, projectName: state.projectName });
})();
