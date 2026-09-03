import { Icon as IconifyIcon, addCollection } from "@iconify/react";
import { streamlinePixel } from "./streamlinePixelIcons";

// Streamline Pixel is shipped locally so editor chrome stays crisp and still
// works when the studio is offline. The collection is CC BY 4.0; see README.
addCollection(streamlinePixel);

const ICON_NAMES: Record<string, string> = {
  "mingcute:pencil": "streamline-pixel:interface-essential-pencil-edit-1",
  "mingcute:eraser": "streamline-pixel:interface-essential-eraser",
  "mingcute:bucket": "streamline-pixel:design-color-bucket",
  "mingcute:eye": "streamline-pixel:interface-essential-view-eye",
  "mingcute:eye-off": "streamline-pixel:interface-essential-view-eye",
  "mingcute:lock": "streamline-pixel:interface-essential-lock",
  "mingcute:unlock": "streamline-pixel:interface-essential-key-lock",
  "mingcute:undo-2": "streamline-pixel:interface-essential-reflect-down-up",
  "mingcute:redo-2": "streamline-pixel:interface-essential-synchronize-arrows-square-2",
  "mingcute:grid-2": "streamline-pixel:interface-essential-hierarchy-1",
  "mingcute:layers": "streamline-pixel:design-layer",
  "mingcute:question": "streamline-pixel:interface-essential-question-help-circle-1",
  "mingcute:sparkles-2": "streamline-pixel:design-magic-wand",
  "mingcute:file-new": "streamline-pixel:content-files-draw-content",
  "mingcute:folder-open-2": "streamline-pixel:content-files-folder-open",
  "mingcute:image-2": "streamline-pixel:photography-file-picture",
  "mingcute:save-2": "streamline-pixel:interface-essential-floppy-disk",
  "mingcute:game-2": "streamline-pixel:entertainment-events-hobbies-game-machines-arcade-1",
  "mingcute:box-3": "streamline-pixel:shopping-shipping-box",
  "mingcute:gallery": "streamline-pixel:photography-picture-polaroid",
  "mingcute:back-2": "streamline-pixel:interface-essential-navigation-left-circle-1",
  "mingcute:forward-2": "streamline-pixel:interface-essential-navigation-right-circle-1",
  "mingcute:pause-fill": "streamline-pixel:video-movies-square-off",
  "mingcute:play-fill": "streamline-pixel:video-movies-play",
  "mingcute:add": "streamline-pixel:interface-essential-edit-fill",
  "mingcute:mouse": "streamline-pixel:computers-devices-electronics-mouse",
  "mingcute:picture": "streamline-pixel:photography-file-picture",
  "mingcute:palette": "streamline-pixel:design-color-painting-palette",
  "mingcute:movie": "streamline-pixel:video-movies-video-square",
  "mingcute:map": "streamline-pixel:interface-essential-map",
  "mingcute:bulb": "streamline-pixel:interface-essential-light-bulb",
  "mingcute:bot": "streamline-pixel:technology-robot-ai",
  "mingcute:group": "streamline-pixel:multiple-user",
  "mingcute:heart": "streamline-pixel:interface-essential-heart-favorite",
  "mingcute:bulb-2": "streamline-pixel:interface-essential-light-bulb",
  "mingcute:close-circle": "streamline-pixel:phone-actions-remove-1",
  "mingcute:alert": "streamline-pixel:interface-essential-alert",
  "mingcute:information": "streamline-pixel:interface-essential-information-circle-1",
  "mingcute:lightbulb": "streamline-pixel:interface-essential-light-bulb",
  "mingcute:cursor": "streamline-pixel:interface-essential-cursor-select",
  "mingcute:magic-2": "streamline-pixel:design-magic-wand",
  "mingcute:sun": "streamline-pixel:weather-cloud-sun-fine",
  "mingcute:cross": "streamline-pixel:phone-actions-remove-1",
  "mingcute:more-2": "streamline-pixel:interface-essential-navigation-menu-1",
  "mingcute:refresh": "streamline-pixel:interface-essential-refresh",
};

const FALLBACK_ICON = "streamline-pixel:interface-essential-question-help-circle-1";

export function Icon({ icon, className }: { icon: string; className?: string }) {
  const iconName = ICON_NAMES[icon] ?? (icon.startsWith("streamline-pixel:") ? icon : FALLBACK_ICON);
  return (
    <IconifyIcon
      icon={iconName}
      className={className ? `pixel-icon ${className}` : "pixel-icon"}
      width={16}
      height={16}
      aria-hidden="true"
      style={{ shapeRendering: "crispEdges" }}
    />
  );
}
