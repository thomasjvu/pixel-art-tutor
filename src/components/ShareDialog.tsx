import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import { projectHashFromJson } from "../engine/share";
import { useStore } from "../store/projectStore";
import { useUi } from "../store/uiStore";

type ShareTarget = "x" | "reddit" | "threads" | "instagram" | "whatsapp" | "email";

const SOCIAL_TARGETS: { id: ShareTarget; label: string; mark: string }[] = [
  { id: "x", label: "X", mark: "X" },
  { id: "reddit", label: "Reddit", mark: "R" },
  { id: "threads", label: "Threads", mark: "@" },
  { id: "instagram", label: "Instagram", mark: "◎" },
  { id: "whatsapp", label: "WhatsApp", mark: "W" },
  { id: "email", label: "Email", mark: "✉" },
];

function fallbackCopy(text: string): boolean {
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "true");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  input.remove();
  return copied;
}

export function ShareDialog() {
  const open = useUi((state) => state.shareOpen);
  const setOpen = useUi((state) => state.setShareOpen);
  const project = useStore((state) => state.project);
  const projectName = useStore((state) => state.project.name);
  const [caption, setCaption] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const closeDialog = useCallback(() => {
    setCaption(null);
    setNotice(null);
    setCopied(false);
    setOpen(false);
  }, [setOpen]);

  const shareUrl = useMemo(() => {
    if (!open) return null;
    const hash = projectHashFromJson(JSON.stringify(project));
    return hash ? `${location.origin}${location.pathname}${hash}` : null;
  }, [open, project]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeDialog]);

  if (!open) return null;

  const message = caption?.trim() || `I made “${projectName}” in Pixel Patch ✦`;
  const encodedUrl = shareUrl ? encodeURIComponent(shareUrl) : "";
  const encodedMessage = encodeURIComponent(message);
  const nativeShareAvailable = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copyLink(): Promise<boolean> {
    if (!shareUrl) return false;
    let didCopy = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        didCopy = true;
      }
    } catch {
      didCopy = false;
    }
    if (!didCopy) didCopy = fallbackCopy(shareUrl);
    if (didCopy) {
      setCopied(true);
      setNotice("Link copied — paste it anywhere.");
      window.setTimeout(() => setCopied(false), 1600);
    } else {
      setNotice("Copy was blocked by the browser. Select the link and copy it manually.");
    }
    return didCopy;
  }

  async function nativeShare() {
    if (!shareUrl || !nativeShareAvailable) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({ title: projectName, text: message, url: shareUrl });
      setNotice("Share sheet opened.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice("The share sheet could not open. The link is ready to copy.");
    }
  }

  async function shareTo(target: ShareTarget) {
    if (!shareUrl) return;
    if (target === "instagram") {
      const didCopy = await copyLink();
      if (didCopy) setNotice("Link copied — paste it into Instagram or use the device share sheet.");
      return;
    }
    const targetUrl =
      target === "x"
        ? `https://x.com/intent/tweet?text=${encodedMessage}&url=${encodedUrl}`
        : target === "reddit"
          ? `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodeURIComponent(projectName)}`
          : target === "threads"
            ? `https://www.threads.com/intent/post?text=${encodedMessage}&url=${encodedUrl}`
            : target === "whatsapp"
              ? `https://wa.me/?text=${encodeURIComponent(`${message} ${shareUrl}`)}`
              : `mailto:?subject=${encodeURIComponent(projectName)}&body=${encodeURIComponent(`${message}\n\n${shareUrl}`)}`;
    window.open(targetUrl, "_blank", "noopener,noreferrer");
    setNotice(`${SOCIAL_TARGETS.find((entry) => entry.id === target)?.label ?? "Share"} opened.`);
  }

  return (
    <div
      className="dialog-veil"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) closeDialog();
      }}
    >
      <section className="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className="dialog-heading">
          <div>
            <span className="dialog-kicker">SEND IT INTO THE WORLD</span>
            <h2 id="share-title">Share project</h2>
          </div>
          <button className="dialog-close" onClick={closeDialog} aria-label="Close share dialog" title="Close share dialog">
            <Icon icon="mingcute:close-circle" />
          </button>
        </div>
        <p className="dialog-intro">Share a lightweight snapshot link. Anyone with it can open this project in Pixel Patch.</p>

        <label className="share-caption-field">
          <span>Message</span>
          <textarea value={caption ?? `I made “${projectName}” in Pixel Patch ✦`} maxLength={280} onChange={(event) => setCaption(event.target.value)} rows={2} />
        </label>

        <div className="share-link-field">
          <span>Project link</span>
          <div className="share-link-row">
            <input
              readOnly
              value={shareUrl ?? "This project is too large for a share link."}
              aria-label="Project share link"
              onFocus={(event) => event.currentTarget.select()}
            />
            <button className="primary-btn" disabled={!shareUrl} onClick={() => void copyLink()}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {shareUrl ? (
          <>
            <button className="share-native" onClick={() => void nativeShare()}>
              <Icon icon="mingcute:group" />
              <span>{nativeShareAvailable ? "Share anywhere" : "Copy for other apps"}</span>
              <small>{nativeShareAvailable ? "device share sheet" : "Instagram, Discord, and more"}</small>
            </button>
            <div className="share-network-grid" aria-label="Social sharing options">
              {SOCIAL_TARGETS.map((target) => (
                <button className={`share-network share-network-${target.id}`} key={target.id} onClick={() => void shareTo(target.id)}>
                  <span className="share-network-mark" aria-hidden="true">{target.mark}</span>
                  <span>{target.label}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="share-unavailable" role="alert">
            This project is too large for a URL snapshot. Use File → Save project JSON instead.
          </div>
        )}

        <div className="dialog-footer">
          <p className="dialog-notice" role="status">{notice ?? "Nothing is posted until you confirm it on the destination."}</p>
          <button className="text-btn" onClick={closeDialog}>Done</button>
        </div>
      </section>
    </div>
  );
}
