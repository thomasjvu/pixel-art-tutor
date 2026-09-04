import type { CSSProperties } from "react";
import type { CodexPet } from "../pets/codexPets";

interface PetAvatarProps {
  pet: CodexPet;
  size?: number;
  className?: string;
}

export function PetAvatar({ pet, size = 42, className = "" }: PetAvatarProps) {
  const style = {
    "--pet-accent": pet.accent,
    width: size,
    height: size,
  } as CSSProperties;

  return (
    <span className={`pet-avatar ${pet.spriteSheet ? "pet-avatar-sheet" : ""} ${className}`.trim()} style={style} aria-hidden="true">
      {pet.imageUrl ? (
        <img src={pet.imageUrl} alt="" draggable={false} />
      ) : (
        <svg viewBox="0 0 16 16" shapeRendering="crispEdges">
          <rect width="16" height="16" fill="#090909" />
          {pet.variant === "sprout" && <rect x="6" y="1" width="4" height="3" fill="var(--pet-accent)" />}
          {pet.variant === "star" && (
            <>
              <rect x="6" y="1" width="4" height="2" fill="var(--pet-accent)" />
              <rect x="3" y="4" width="10" height="2" fill="var(--pet-accent)" />
            </>
          )}
          {pet.variant === "cat" && (
            <>
              <rect x="2" y="2" width="3" height="4" fill="var(--pet-accent)" />
              <rect x="11" y="2" width="3" height="4" fill="var(--pet-accent)" />
            </>
          )}
          <rect x="4" y="4" width="8" height="9" fill="var(--pet-accent)" />
          <rect x="2" y="7" width="2" height="4" fill="var(--pet-accent)" />
          <rect x="12" y="7" width="2" height="4" fill="var(--pet-accent)" />
          <rect x="5" y="7" width="2" height="2" fill="#090909" />
          <rect x="9" y="7" width="2" height="2" fill="#090909" />
          <rect x="6" y="10" width="4" height="1" fill="#090909" />
          <rect x="5" y="13" width="2" height="2" fill="var(--pet-accent)" />
          <rect x="9" y="13" width="2" height="2" fill="var(--pet-accent)" />
        </svg>
      )}
    </span>
  );
}
