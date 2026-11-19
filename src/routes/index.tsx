import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Clock,
  Coffee,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Smartphone,
  Smile,
  Star,
  TimerReset,
} from "lucide-react";

import { BlinkCue } from "@/components/eye/BlinkCue";
import { BreakOverlay } from "@/components/eye/BreakOverlay";
import { EyeCareGuide } from "@/components/eye/EyeCareGuide";
import { InsightsDialog } from "@/components/eye/InsightsDialog";
import { InstallDialog, useInstallPrompt } from "@/components/eye/InstallDialog";
import { KidsDialog } from "@/components/eye/KidsDialog";
import { KidsTimeUp } from "@/components/eye/KidsTimeUp";
import { PinDialog } from "@/components/eye/PinDialog";
import { HowItWorks } from "@/components/eye/HowItWorks";
import { SettingsSheet } from "@/components/eye/SettingsSheet";
import { SoundDialog } from "@/components/eye/SoundDialog";
import { StreakCard } from "@/components/eye/StreakCard";
import { TimerRing } from "@/components/eye/TimerRing";
import { WorkHoursDialog } from "@/components/eye/WorkHoursDialog";
import { Button } from "@/components/ui/button";
import { useEyeTimer } from "@/hooks/use-eye-timer";
import {
  formatClock,
  formatDuration,
  formatTime12,
  isPaused,
  progress,
  workHoursSummary,
} from "@/lib/eye-timer";
import { allowanceLeftMs, starsFor } from "@/lib/kids-mode";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lookaway — 20-20-20 eye break reminder" },
      {
        name: "description",
        content:
          "A gentle timer for screen-time eye strain: every 20 minutes, look 20 feet away for 20 seconds, with streaks and working hours.",
      },
      { property: "og:title", content: "Lookaway — 20-20-20 eye break reminder" },
      {
        property: "og:description",
        content:
          "Every 20 minutes, look 20 feet away for 20 seconds. Rest tired eyes with gentle reminders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const {
    settings,
    updateSettings,
    state,
    now,
    remaining,
    stats,
    streak,
    week,
    insights,
    kids,
    updateKids,
    todayKey,
    timeUp,
    inHours,
    autoPaused,
    blinkCue,
    actions,
    askNotifications,
    nativePlatform,
    notificationPermission,
  } = useEyeTimer();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workHoursOpen, setWorkHoursOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [kidsOpen, setKidsOpen] = useState(false);
  const [pinFor, setPinFor] = useState<null | { reason: string; then: () => void }>(null);
  const install = useInstallPrompt();

  // In Kids mode, protected actions ask for the parent PIN first.
  const guarded = (reason: string, then: () => void) => () =>
    kids.enabled ? setPinFor({ reason, then }) : then();
  const openSettings = guarded("Enter the PIN to change settings.", () => setSettingsOpen(true));
  const openKids = guarded("Enter the PIN to open parent options.", () => setKidsOpen(true));
  const kidsLeft = allowanceLeftMs(kids, todayKey, stats.screenMs);

  const paused = isPaused(state);
  const idle = state.phase === "idle";
  const restSeconds = stats.breaks * settings.breakSeconds;

  const label = idle ? formatClock(settings.focusMinutes * 60_000) : formatClock(remaining);
  const caption = idle
    ? `of screen time, then a ${settings.breakSeconds}-second eye break`
    : autoPaused
      ? `resting until ${formatTime12(settings.workStart)}`
      : paused
        ? "paused"
        : "until your next eye break";

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-md items-center justify-between px-5 pt-6">
        <div className="flex items-center gap-2.5">
          <img src="/icon-192.png" alt="" width={36} height={36} className="h-9 w-9 rounded-xl" />
          <span className="font-display text-xl">Lookaway</span>
        </div>
        <Button variant="soft" size="icon" aria-label="Settings" onClick={openSettings}>
          <Settings2 />
        </Button>
      </header>

      <main className="mx-auto flex max-w-md flex-col items-center gap-6 px-5 pb-16 pt-6 text-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            20 · 20 · 20 eye care
          </p>
          <h1 className="mt-2 text-3xl font-light leading-tight sm:text-4xl">
            Give your eyes <em className="text-primary">a little distance.</em>
          </h1>
        </div>

        {kids.enabled && (
          <div className="flex w-full items-center gap-3 rounded-3xl bg-accent/20 p-4 text-left">
            <span className="text-3xl" aria-hidden>
              🦉
            </span>
            <div className="flex-1">
              <p className="font-display text-lg leading-tight">
                Kids mode · {formatDuration(kidsLeft)} left today
              </p>
              <p className="mt-1 flex gap-0.5" aria-label={`${stats.breaks} stars`}>
                {stats.breaks === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Finish an eye break to earn a star!
                  </span>
                ) : (
                  Array.from({ length: starsFor(stats.breaks) }, (_, i) => (
                    <Star key={i} className="h-4 w-4 fill-accent text-accent" />
                  ))
                )}
              </p>
            </div>
          </div>
        )}

        <TimerRing
          progress={progress(state, now)}
          label={label}
          caption={caption}
          tone={idle ? "idle" : "focus"}
          className="max-w-[280px]"
        />

        <div className="flex w-full max-w-xs flex-col gap-3">
          {idle && (
            <Button variant="hero" size="xl" onClick={actions.start}>
              <Play /> Start screen time
            </Button>
          )}
          {!idle && !paused && (
            <Button variant="hero" size="xl" onClick={actions.pause}>
              <Pause /> Pause
            </Button>
          )}
          {!idle && paused && (
            <Button variant="hero" size="xl" onClick={actions.resume}>
              <Play /> {autoPaused ? "Keep going anyway" : "Resume"}
            </Button>
          )}
          <button
            type="button"
            onClick={() => setWorkHoursOpen(true)}
            className="flex w-full items-center gap-3 rounded-full border bg-card py-2 pl-2 pr-4 text-left transition-colors hover:bg-muted"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
              <Clock className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                Working hours
                {settings.workHoursEnabled && (
                  <span
                    className={cn("h-1.5 w-1.5 rounded-full", inHours ? "bg-primary" : "bg-accent")}
                    aria-label={inHours ? "In working hours" : "Outside working hours"}
                  />
                )}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {workHoursSummary(settings)}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          {!idle && (
            <div className="grid grid-cols-3 gap-2">
              <Button variant="soft" onClick={actions.breakNow}>
                <Coffee /> Break
              </Button>
              <Button variant="soft" onClick={actions.snooze}>
                <TimerReset /> +5 min
              </Button>
              <Button
                variant="soft"
                onClick={guarded("Enter the PIN to stop the timer.", actions.stop)}
              >
                <RotateCcw /> Stop
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {nativePlatform
              ? "Android schedules reminders while Lookaway is closed. Battery-saving features may delay delivery."
              : "Keep this tab open. We'll play a sound and pop up an alert when it's time to look away."}
          </p>
        </div>

        <div className="w-full space-y-3">
          <StreakCard streak={streak} week={week} />

          <dl className="grid grid-cols-3 gap-2">
            {[
              { k: "Breaks today", v: stats.breaks },
              { k: "Skipped", v: stats.skipped },
              {
                k: "Eyes rested",
                v: restSeconds >= 60 ? `${Math.floor(restSeconds / 60)}m` : `${restSeconds}s`,
              },
            ].map((s) => (
              <div key={s.k} className="rounded-2xl border bg-card px-2 py-3">
                <dd className="font-display tabular text-2xl font-light">{s.v}</dd>
                <dt className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {s.k}
                </dt>
              </div>
            ))}
          </dl>

          <HowItWorks />

          <div className="grid grid-cols-3 gap-2">
            {[
              {
                icon: <BarChart3 className="h-5 w-5" />,
                label: "Your week",
                onClick: () => setInsightsOpen(true),
              },
              { icon: <Smile className="h-5 w-5" />, label: "Kids mode", onClick: openKids },
              ...(install.installed
                ? []
                : [
                    {
                      icon: <Smartphone className="h-5 w-5" />,
                      label: "Install app",
                      onClick: () => setInstallOpen(true),
                    },
                  ]),
            ].map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={b.onClick}
                className="flex flex-col items-center gap-1.5 rounded-2xl border bg-card px-2 py-3 text-xs font-semibold transition-colors hover:bg-muted"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-primary">
                  {b.icon}
                </span>
                {b.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="flex w-full items-center gap-4 rounded-3xl bg-primary p-5 text-left text-primary-foreground shadow-soft transition-transform active:scale-[0.99]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
              <BookOpen className="h-5 w-5" />
            </span>
            <span className="flex-1">
              <span className="block font-display text-xl">Eye-care tips</span>
              <span className="block text-xs opacity-80">
                Backed by eye doctors and published research
              </span>
            </span>
            <ChevronRight className="h-5 w-5 opacity-80" />
          </button>
        </div>
      </main>

      <footer className="mx-auto max-w-md px-5 pb-10 text-center text-xs text-muted-foreground">
        A habit helper, not medical advice. If eye pain, headaches or blurry vision persist, see an
        eye doctor.
      </footer>

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={updateSettings}
        askNotifications={askNotifications}
        nativePlatform={nativePlatform}
        notificationPermission={notificationPermission}
        onOpenWorkHours={() => setWorkHoursOpen(true)}
        onOpenSound={() => setSoundOpen(true)}
      />
      <WorkHoursDialog
        open={workHoursOpen}
        onOpenChange={setWorkHoursOpen}
        settings={settings}
        onChange={updateSettings}
      />
      <SoundDialog
        open={soundOpen}
        onOpenChange={setSoundOpen}
        settings={settings}
        onChange={updateSettings}
      />
      <EyeCareGuide open={guideOpen} onOpenChange={setGuideOpen} />
      <InsightsDialog open={insightsOpen} onOpenChange={setInsightsOpen} insights={insights} />
      <InstallDialog open={installOpen} onOpenChange={setInstallOpen} event={install.event} />
      <KidsDialog
        open={kidsOpen}
        onOpenChange={setKidsOpen}
        kids={kids}
        onChange={updateKids}
        todayKey={todayKey}
        stats={stats}
      />
      <PinDialog
        open={pinFor !== null}
        onOpenChange={(o) => !o && setPinFor(null)}
        pinHash={kids.pinHash}
        reason={pinFor?.reason ?? ""}
        onSuccess={() => pinFor?.then()}
      />
      {timeUp && <KidsTimeUp breaks={stats.breaks} onParent={openKids} />}

      {state.phase === "break" && (
        <BreakOverlay
          secondsLeft={Math.ceil(remaining / 1000)}
          totalSeconds={state.durationMs / 1000}
          onSkip={guarded("Enter the PIN to skip this break.", actions.skipBreak)}
          kids={kids.enabled}
        />
      )}
      {blinkCue && state.phase === "focus" && !timeUp && (
        <BlinkCue onClose={actions.dismissBlink} />
      )}
    </div>
  );
}
