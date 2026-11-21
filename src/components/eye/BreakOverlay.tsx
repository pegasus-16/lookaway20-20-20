import { useEffect, useState } from "react";
import { SkipForward } from "lucide-react";

import horizon from "@/assets/distant-horizon.jpg";
import { Button } from "@/components/ui/button";

import { BREAK_STEPS, KIDS_BREAK_GAMES, SOURCES } from "@/lib/eye-care-guide";

// Warm the photograph while focus time is running so the overlay does not have
// to decode it at the moment the phase changes.
if (typeof window !== "undefined") {
  const warm = new Image();
  warm.src = horizon;
}

interface Props {
  secondsLeft: number;
  totalSeconds: number;
  onSkip: () => void;
  kids?: boolean;
}

export function BreakOverlay({ secondsLeft, totalSeconds, onSkip, kids = false }: Props) {
  const count = kids ? KIDS_BREAK_GAMES.length : BREAK_STEPS.length;
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setI((n) => (n + 1) % count), 5000);
    return () => window.clearInterval(id);
  }, [count]);
  const step = BREAK_STEPS[i % BREAK_STEPS.length]!;
  const game = KIDS_BREAK_GAMES[i % KIDS_BREAK_GAMES.length]!;
  const stepSource = step.sources.map((id) => SOURCES.find((s) => s.id === id)?.short).filter(Boolean).join(", ");

  const pct = Math.max(0, Math.min(100, (1 - secondsLeft / totalSeconds) * 100));
  // The phase changes just after the deadline; hold on 1 instead of flashing 0.
  const displaySeconds = Math.max(1, secondsLeft);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Eye break"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-night text-night-foreground animate-in fade-in duration-500"
    >
      <img
        src={horizon}
        alt=""
        width={1024}
        height={1536}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-night-veil" />

      <div className="relative flex flex-1 flex-col items-center justify-end px-6 pb-10 text-center sm:justify-center sm:pb-0">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-night-foreground/70">
          Eye break
        </p>
        <h2 className="mt-3 font-display text-4xl font-light leading-tight sm:text-5xl">
          {kids ? "Eye adventure time!" : "Look into the distance"}
        </h2>

        <div className="relative my-10 flex h-44 w-44 items-center justify-center">
          <span className="absolute inset-0 rounded-full border border-night-foreground/40 animate-ripple" />
          <span
            className="absolute inset-0 rounded-full border border-night-foreground/30 animate-ripple"
            style={{ animationDelay: "2s" }}
          />
          <span className="absolute inset-4 rounded-full bg-night-foreground/10 animate-breathe" />
          <span className="relative font-display tabular text-7xl font-light">{displaySeconds}</span>
        </div>

        {kids ? (
          <p key={i} className="min-h-[3.5rem] max-w-xs text-xl text-night-foreground/90 animate-rise">
            <span className="mr-2 text-3xl" aria-hidden>{game.emoji}</span>
            {game.text}
          </p>
        ) : (
          <div key={i} className="min-h-[3.5rem] max-w-xs animate-rise">
            <p className="text-lg text-night-foreground/90">{step.text}</p>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-night-foreground/60">Source: {stepSource}</p>
          </div>
        )}
        {kids && <p className="mt-3 text-sm text-night-foreground/80">Finish to earn a ⭐</p>}

        <div className="mt-8 h-1 w-56 overflow-hidden rounded-full bg-night-foreground/20">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>

        <Button variant="veil" size="sm" className="mt-8" onClick={onSkip}>
          <SkipForward /> {kids ? "Parent: skip" : "Skip this break"}
        </Button>
      </div>
    </div>
  );
}
