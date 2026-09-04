import { TUTORIAL_STEPS } from "../engine/tutorial";
import { useUi } from "../store/uiStore";
import { DEFAULT_CODEX_PET } from "../pets/codexPets";
import { PetAvatar } from "./PetAvatar";

export function TutorialOverlay() {
  const open = useUi((s) => s.tutorialOpen);
  const step = useUi((s) => s.tutorialStep);
  const setTutorialStep = useUi((s) => s.setTutorialStep);
  const closeTutorial = useUi((s) => s.closeTutorial);
  const selectedPet = useUi((s) => s.selectedPet);
  if (!open) return null;
  const total = TUTORIAL_STEPS.length;
  const current = TUTORIAL_STEPS[Math.max(0, Math.min(step, total - 1))];
  const last = step >= total - 1;
  const speaker = selectedPet ?? DEFAULT_CODEX_PET;
  const body = current.body.replaceAll("your companion", selectedPet?.name ?? "your studio guide");
  const title = current.title.replace("PIXEL BOT", speaker.name.toUpperCase());
  return (
    <div className="tutorial-veil" role="dialog" aria-modal="true" aria-label={`${speaker.name} guided tutorial`} aria-describedby="tutorial-body">
      <div className="tutorial-box">
        <div className="tutorial-pet-rail">
          <div className="tutorial-pet-frame">
            <PetAvatar pet={speaker} size={124} className="tutorial-pet" />
          </div>
          <div>
            <strong>{speaker.name}</strong>
            <span>{selectedPet ? "studio companion" : "studio guide"}</span>
          </div>
        </div>
        <div className="tutorial-main">
          <div className="tutorial-head">
            <span className="tutorial-kicker">GUIDED TOUR</span>
            <span className="tutorial-count">
              STEP {Math.min(step + 1, total)}/{total}
            </span>
            <button className="tutorial-close" type="button" onClick={closeTutorial} aria-label="End tour" title="End tour">×</button>
          </div>
          <h3 className="tutorial-title">{title}</h3>
          <p className="tutorial-body" id="tutorial-body">{body}</p>
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
                Start drawing
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
