import { FlaskConical } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  onSeedStreak: () => void;
  onSeedToday: () => void;
  onClear: () => void;
}

/** Debug-only controls, rendered only when DEBUG_TOOLS_ENABLED is true. */
export function DebugPanel({ onSeedStreak, onSeedToday, onClear }: Props) {
  return (
    <section className="rounded-3xl border border-dashed border-accent bg-accent/10 p-4 text-left">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        <FlaskConical className="h-4 w-4" /> Debug tools
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Seeded days are real localStorage stats. Clear them before a release build.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="soft" size="sm" onClick={onSeedStreak}>
          Seed 5-day streak
        </Button>
        <Button variant="soft" size="sm" onClick={onSeedToday}>
          Add today&apos;s break
        </Button>
        <Button variant="outline" size="sm" onClick={onClear}>
          Clear stats
        </Button>
      </div>
    </section>
  );
}
