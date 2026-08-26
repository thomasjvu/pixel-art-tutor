import { useState } from "react";
import { Icon } from "./Icon";
import { critiqueSprite } from "../engine/critique";
import type { CritiqueReport } from "../types";
import { useStore } from "../store/projectStore";
import { useUi } from "../store/uiStore";

export function CritiquePanel() {
  const sprite = useStore((s) => s.activeSprite());
  const palette = useStore((s) => s.project.palette);
  const [lastReport, setLastReport] = useState<CritiqueReport | null>(null);
  const report = sprite && lastReport?.spriteId === sprite.id ? lastReport : null;

  function runCritique() {
    if (!sprite) return;
    const next = critiqueSprite(sprite, palette);
    setLastReport(next);
    useUi.getState().pushLog({
      tool: "critique_artwork",
      summary: `${sprite.name}: ${next.score}/100`,
      source: "app",
    });
  }

  if (!sprite) return null;

  return (
    <div className="panel critique-panel">
      <div className="critique-intro">
        <div className="critique-spark"><Icon icon="mingcute:bulb-2" /></div>
        <div>
          <span className="eyebrow">Friendly feedback</span>
          <h2>Studio check</h2>
        </div>
      </div>
      <p className="hint">
        Get a tiny art lesson on {sprite.name}: shape, color, contrast, and animation readiness.
      </p>
      <button className="primary-btn critique-run" onClick={runCritique}>
        <Icon icon="mingcute:sparkles-2" />
        {report ? "Check again" : "Run studio check"}
      </button>

      {report && (
        <>
          <div className="critique-score-card">
            <div
              className="score-ring"
              style={{ background: `conic-gradient(var(--mint) ${report.score}%, var(--panel-3) 0)` }}
            >
              <div className="score-ring-inner">
                <strong>{report.score}</strong>
                <span>/100</span>
              </div>
            </div>
            <div>
              <span className="eyebrow">Pixel vibe</span>
              <strong>{report.score >= 80 ? "Super cozy" : report.score >= 60 ? "Good bones" : "Ready to tune"}</strong>
              <p>{report.findings.length ? `${report.findings.length} little notes to explore` : "No notes — ship this tiny hero!"}</p>
            </div>
          </div>
          <div className="critique-stats">
            <Stat label="Canvas" value={String(report.stats.size)} />
            <Stat label="Colors" value={String(report.stats.colorsUsed)} />
            <Stat label="Frames" value={String(report.stats.frameCount)} />
            <Stat label="Silhouette" value={`${report.stats.outlineCoveragePct}%`} />
          </div>
          <div className="critique-findings">
            {report.findings.map((finding) => (
              <article className={`critique-card severity-${finding.severity}`} key={`${finding.title}-${finding.detail}`}>
                <div className="critique-card-heading">
                  <span className="severity-icon"><Icon icon={finding.severity === "error" ? "mingcute:close-circle" : finding.severity === "warn" ? "mingcute:alert" : "mingcute:information"} /></span>
                  <strong>{finding.title}</strong>
                </div>
                <p>{finding.detail}</p>
                <div className="critique-tip"><Icon icon="mingcute:lightbulb" /> {finding.tip}</div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="critique-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
