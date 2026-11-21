import { ChevronRight, Clock, Volume2 } from "lucide-react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { workHoursSummary, type EyeSettings } from "@/lib/eye-timer";
import { DEBUG_TOOLS_ENABLED } from "@/lib/debug";
import { SOUNDS } from "@/lib/sounds";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: EyeSettings;
  onChange: (patch: Partial<EyeSettings>) => void;
  askNotifications: () => Promise<NotificationPermission | "unsupported" | "prompt">;
  onOpenWorkHours: () => void;
  onOpenSound: () => void;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-primary">{title}</h3>
      {children}
    </section>
  );
}

function Row({ id, title, hint, children }: { id: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div>
        <Label htmlFor={id} className="text-sm font-semibold">
          {title}
        </Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function LinkRow({
  icon,
  title,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition-colors hover:bg-muted"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{value}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function SliderField(props: {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-semibold">{props.label}</Label>
        <span className="font-display tabular text-lg">
          {props.value} {props.suffix}
        </span>
      </div>
      <Slider
        className="mt-3"
        min={props.min}
        max={props.max}
        step={props.step}
        value={[props.value]}
        onValueChange={(v) => props.onChange(v[0] ?? props.value)}
        aria-label={props.label}
      />
    </div>
  );
}

export function SettingsSheet({
  open,
  onOpenChange,
  settings,
  onChange,
  askNotifications,
  onOpenWorkHours,
  onOpenSound,
}: Props) {
  const soundLabel = SOUNDS.find((s) => s.id === settings.soundKind)?.label ?? "Chime";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-md overflow-y-auto bg-background sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl font-normal">Your rhythm</SheetTitle>
          <SheetDescription>The defaults follow the 20-20-20 rule. Adjust only if you need to.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-8 pb-6">
          <Group title="Timing">
            <div className="space-y-6">
              {DEBUG_TOOLS_ENABLED ? (
                <>
                  <SliderField
                    label="Screen time before a break"
                    value={Math.round(settings.focusMinutes * 60)}
                    suffix="sec"
                    min={10}
                    max={60}
                    step={5}
                    onChange={(v) => onChange({ focusMinutes: v / 60 })}
                  />
                  <SliderField
                    label="Look-away time"
                    value={settings.breakSeconds}
                    suffix="sec"
                    min={5}
                    max={30}
                    step={5}
                    onChange={(v) => onChange({ breakSeconds: v })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Debug build: timing sliders use seconds so you can test the full cycle quickly.
                  </p>
                </>
              ) : (
                <>
                  <SliderField
                    label="Screen time before a break"
                    value={settings.focusMinutes}
                    suffix="min"
                    min={5}
                    max={60}
                    step={5}
                    onChange={(v) => onChange({ focusMinutes: v })}
                  />
                  <SliderField
                    label="Look-away time"
                    value={settings.breakSeconds}
                    suffix="sec"
                    min={20}
                    max={60}
                    step={5}
                    onChange={(v) => onChange({ breakSeconds: v })}
                  />
                </>
              )}
            </div>
          </Group>

          <Group title="Schedule & sound">
            <div className="space-y-2">
              <LinkRow
                icon={<Clock className="h-4 w-4" />}
                title="Working hours"
                value={workHoursSummary(settings)}
                onClick={onOpenWorkHours}
              />
              <LinkRow
                icon={<Volume2 className="h-4 w-4" />}
                title="Sound & volume"
                value={settings.sound ? `${soundLabel} · ${settings.volume}%` : "Off"}
                onClick={onOpenSound}
              />
            </div>
          </Group>

          <Group title="Reminders">
            <div className="divide-y rounded-2xl border bg-card px-4">
              <Row id="notify" title="Pop-up alerts" hint="Get reminded even when this tab is hidden">
                <Switch
                  id="notify"
                  checked={settings.notifications}
                  onCheckedChange={async (v) => {
                    onChange({ notifications: v });
                    if (v) {
                      const p = await askNotifications();
                      if (p === "denied") toast.error("Alerts are blocked in your browser settings.");
                      if (p === "unsupported") toast("This browser doesn't support pop-up alerts.");
                    }
                  }}
                />
              </Row>
              <Row id="blink" title="Blink nudges" hint="A quiet reminder to blink fully">
                <Switch id="blink" checked={settings.blinkNudges} onCheckedChange={(v) => onChange({ blinkNudges: v })} />
              </Row>
            </div>
            {settings.blinkNudges && (
              <div className="mt-4">
                <SliderField
                  label="Blink nudge every"
                  value={settings.blinkEveryMinutes}
                  suffix="min"
                  min={2}
                  max={10}
                  step={1}
                  onChange={(v) => onChange({ blinkEveryMinutes: v })}
                />
              </div>
            )}
          </Group>
        </div>
      </SheetContent>
    </Sheet>
  );
}
