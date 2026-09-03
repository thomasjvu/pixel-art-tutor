const ICON_PATHS: Record<string, string> = {
  "mingcute:pencil": "M2 11h2v2H2zM4 9h2v2H4zM6 7h2v2H6zM8 5h2v2H8zM10 3h3v2h-1v2h-2zM12 2h2v2h-2zM2 13h5v1H2z",
  "mingcute:eraser": "M2 9 8 3h3l3 3v2l-6 6H5l-3-3zm3 4h3l4-4-3-3-5 5z",
  "mingcute:bucket": "M4 3h8v2h1v2h-1v6H4V7H3V5h1zm2 2v6h4V5zM3 14h10v1H3z",
  "mingcute:eye": "M1 8 3 5h2l3-2 3 2h2l2 3-2 3h-2l-3 2-3-2H3zm3 0a4 4 0 0 0 8 0 4 4 0 0 0-8 0zm3-2h2v4H7z",
  "mingcute:undo-2": "M3 4h7a4 4 0 1 1 0 8H7v-2h3a2 2 0 1 0 0-4H3v2L1 6l2-2zm0 0V1l3 3-3 3V4z",
  "mingcute:redo-2": "M13 4H6a4 4 0 1 0 0 8h3v-2H6a2 2 0 1 1 0-4h7v2l2-2-2-2zm0 0V1l-3 3 3 3V4z",
  "mingcute:grid-2": "M1 1h6v6H1zm8 0h6v6H9zM1 9h6v6H1zm8 0h6v6H9zM3 3v2h2V3zm8 0v2h2V3zM3 11v2h2v-2zm8 0v2h2v-2z",
  "mingcute:layers": "M8 1l7 4-7 4-7-4zm0 6 5 3-5 3-5-3m0 3 5 3 5-3",
  "mingcute:question": "M5 5a3 3 0 1 1 5 2c-1 1-2 1-2 3H6c0-2 1-3 2-4a1 1 0 1 0-1-1H5zm1 7h2v2H6z",
  "mingcute:sparkles-2": "M7 1l1 5 4 2-4 1-1 6-1-6-4-1 4-2zm6 1 1 2 1 1-1 1-1 2-1-2-1-1 1-1z",
  "mingcute:file-new": "M3 1h7l3 3v11H3zm6 1v3h3M7 7v6m-3-3h6",
  "mingcute:folder-open-2": "M1 4h5l1 2h8v8H1zm2 3h10l-1 5H3z",
  "mingcute:image-2": "M1 2h14v12H1zm2 2v8h10V4zm1 6 2-2 2 2 2-3 3 3v2H4zM5 5h2v2H5z",
  "mingcute:save-2": "M2 1h10l2 2v12H2zm2 2v4h7V3zm1 7h6v3H5z",
  "mingcute:game-2": "M3 5h10l2 7-3 2-2-3H6l-2 3-3-2zm2 2v2h2V7zm-1 1h4M10 8h2m-1-1v2",
  "mingcute:box-3": "M2 4 8 1l6 3v8l-6 3-6-3zm2 1v6l4 2V7zm8 0L8 7v6l4-2zM5 4l3 2 3-2-3-1z",
  "mingcute:gallery": "M1 2h14v12H1zm2 2v8h10V4zm1 6 2-2 2 2 2-3 3 3v2H4z",
  "mingcute:back-2": "M11 2 5 8l6 6V2zM3 3h2v10H3z",
  "mingcute:forward-2": "M5 2l6 6-6 6V2zm6 1h2v10h-2z",
  "mingcute:pause-fill": "M3 2h3v12H3zm7 0h3v12h-3z",
  "mingcute:play-fill": "M4 2l9 6-9 6z",
  "mingcute:add": "M7 1h2v6h6v2H9v6H7V9H1V7h6z",
  "mingcute:mouse": "M5 1h6l2 3v8l-2 3H5l-2-3V4zm0 2v5h6V3zm2 1h2v2H7z",
  "mingcute:picture": "M1 2h14v12H1zm2 2v8h10V4zm1 6 2-2 2 2 2-3 3 3v2H4zM5 5h2v2H5z",
  "mingcute:palette": "M2 7a6 6 0 1 1 8 6H7v-2H5v-2H3zm3-3h2v2H5zm4 0h2v2H9zm2 4h2v2h-2z",
  "mingcute:movie": "M2 2h12v12H2zm2 2v8h8V4zm0-2v2m3-2v2m3-2v2M4 12v2m3-2v2m3-2v2",
  "mingcute:map": "M1 3l4-2 6 2 4-2v12l-4 2-6-2-4 2zm4 0v8m6-6v8",
  "mingcute:bulb": "M5 10a5 5 0 1 1 6 0v2H5zm2 4h2v1H7zM6 12h4v2H6z",
  "mingcute:bot": "M5 4h6l2 2v6l-2 2H5l-2-2V6zm3-3h2v3H8zM5 7h2v2H5zm4 0h2v2H9zM6 11h4v1H6z",
  "mingcute:group": "M4 5a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM1 14v-2a3 3 0 0 1 6 0v2zm8 0v-2a3 3 0 0 1 6 0v2z",
  "mingcute:heart": "M8 14 2 8a4 4 0 0 1 6-5 4 4 0 0 1 6 5z",
  "mingcute:bulb-2": "M5 10a5 5 0 1 1 6 0v2H5zm2 4h2v1H7zM8 1v2M2 5h2m8 0h2M3 2l2 2m6-2-2 2",
  "mingcute:close-circle": "M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm-3 4 2 3-2 3 2 1 1-3 1 3 2-1-2-3 2-3-2-1-1 3-1-3z",
  "mingcute:alert": "M7 1h2l6 13H1zm1 4h2v4H8zm0 5h2v2H8z",
  "mingcute:information": "M7 1h2v2H7zm0 4h2v7H7zM1 7h2v2H1zm12 0h2v2h-2z",
  "mingcute:lightbulb": "M5 10a5 5 0 1 1 6 0v2H5zm2 4h2v1H7zM6 12h4v2H6z",
  "mingcute:cursor": "M2 1l10 7-5 1 3 5-2 1-3-5-3 4z",
  "mingcute:cross": "M7 1h2v6h6v2H9v6H7V9H1V7h6z",
  "mingcute:more-2": "M2 6h2v4H2zm5 0h2v4H7zm5 0h2v4h-2z",
};

const UNKNOWN_ICON = "M6 6h4v4H6z";

export function Icon({ icon }: { icon: string }) {
  return (
    <svg
      className="pixel-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[icon] ?? UNKNOWN_ICON} />
    </svg>
  );
}
