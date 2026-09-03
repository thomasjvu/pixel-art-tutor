import { TUTORIAL_STEPS } from "../engine/tutorial";
import { useUi } from "../store/uiStore";

export function TutorialOverlay() {
  const open = useUi((s) => s.tutorialOpen);
  const step = useUi((s) => s.tutorialStep);
  const setTutorialStep = useUi((s) => s.setTutorialStep);
  const closeTutorial = useUi((s) => s.closeTutorial);
  if (!open) return null;
  const total = TUTORIAL_STEPS.length;
  const current = TUTORIAL_STEPS[Math.max(0, Math.min(step, total - 1))];
  const last = step >= total - 1;
  return (
    <div className="tutorial-veil" role="dialog" aria-label="Guided tutorial">
      <div className="tutorial-box">
        <div className="tutorial-head">
          <span className="tutorial-kicker">GUIDED TOUR</span>
          <span className="tutorial-count">
            STEP {Math.min(step + 1, total)}/{total}
          </span>
        </div>
        <h3 className="tutorial-title">{current.title}</h3>
        <p className="tutorial-body">{current.body}</p>
        <div className="tutorial-progress" aria-hidden="true">
          {TUTORIAL_STEPS.map((s, i) => (
            <i key={s.id} className={i <= step ? "on" : ""} />
          ))}
        </div>
        <div className="tutorial-actions">
          <button
            className="text-btn"
            disabled={step <= 0}
            onClick={() => setTutorialStep(step - 1)}
          >
            ← Back
          </button>
          {!last && (
            <button className="primary-btn" onClick={() => setTutorialStep(step + 1)}>
              Next →
            </button>
          )}
          {last && (
            <button className="primary-btn" onClick={closeTutorial}>
              Start drawing!
            </button>
          )}
          <button className="text-btn danger" onClick={closeTutorial}>
            End tour
          </button>
        </div>
      </div>
    </div>
  );
}
