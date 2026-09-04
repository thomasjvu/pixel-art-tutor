import { useRef, useState, type CSSProperties } from "react";

interface SegmentedRangeProps {
  id?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  segments?: number;
  className?: string;
  ariaLabel: string;
  onStart?: () => void;
  onChange: (value: number) => void;
  onEnd?: () => void;
}

/**
 * A tactile segmented range control. The draft moves immediately, while the
 * project callback is coalesced to animation frames and closed as one edit.
 * That keeps large pixel projects responsive without making the control feel
 * disconnected from the canvas.
 */
export function SegmentedRange({
  id,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  segments = 24,
  className,
  ariaLabel,
  onStart,
  onChange,
  onEnd,
}: SegmentedRangeProps) {
  const [draft, setDraft] = useState(value);
  const [active, setActive] = useState(false);
  const draftRef = useRef(value);
  const activeRef = useRef(false);
  const pendingRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  function begin() {
    if (activeRef.current) return;
    draftRef.current = value;
    setDraft(value);
    activeRef.current = true;
    setActive(true);
    onStart?.();
  }

  function publish(next: number, flush = false) {
    pendingRef.current = next;
    if (flush) {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      pendingRef.current = null;
      onChange(next);
      return;
    }
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending !== null) onChange(pending);
    });
  }

  function finish() {
    if (!activeRef.current) return;
    const next = draftRef.current;
    publish(next, true);
    activeRef.current = false;
    setActive(false);
    onEnd?.();
  }

  function update(next: number) {
    draftRef.current = next;
    setDraft(next);
    publish(next);
  }

  const displayValue = active ? draft : value;
  const progress = max === min ? 0 : Math.max(0, Math.min(1, (displayValue - min) / (max - min)));
  const filled = Math.round(progress * segments);

  return (
    <span
      className={className ? `fire-slider ${className}` : "fire-slider"}
      style={{ "--range-progress": `${Math.round(progress * 100)}%` } as CSSProperties}
      onPointerDown={begin}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      <span className="fire-slider-bars" aria-hidden="true">
        {Array.from({ length: segments }, (_, index) => (
          <span
            className={index < filled ? "fire-slider-segment filled" : "fire-slider-segment"}
            key={index}
          />
        ))}
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={displayValue}
        onFocus={begin}
        onChange={(event) => update(Number(event.target.value))}
        onBlur={finish}
        aria-label={ariaLabel}
      />
    </span>
  );
}
