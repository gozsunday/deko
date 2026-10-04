import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const pad = (n: number) => String(n).padStart(2, "0");

// datetime-local wants a bare local-time string; anything else is rejected by
// the input, and the zone suffix it accepts is not the browser's zone
const toInputValue = (iso: string | undefined) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// an input value is local wall-clock, so let the Date constructor localise it
const toIso = (value: string) =>
  value ? new Date(value).toISOString() : undefined;

const localZone = () => {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
};

const PRESETS = [
  { label: "15m", ms: 15 * 60_000 },
  { label: "1h", ms: 60 * 60_000 },
  { label: "6h", ms: 6 * 60 * 60_000 },
] as const;

type Preset = (typeof PRESETS)[number]["label"];

type LogTimeRangeProps = {
  from: string | undefined;
  to: string | undefined;
  activePreset: Preset | undefined;
  onChange: (next: { from?: string; to?: string; preset?: Preset }) => void;
};

/**
 * Absolute time range for the log feed. When set it overrides the period
 * selector, because the API prefers an explicit range over a relative period.
 */
export function LogTimeRange({
  from,
  to,
  activePreset,
  onChange,
}: LogTimeRangeProps) {
  const [fromValue, setFromValue] = useState(toInputValue(from));
  const [toValue, setToValue] = useState(toInputValue(to));

  // the URL is the source of truth; presets and external links change it
  useEffect(() => setFromValue(toInputValue(from)), [from]);
  useEffect(() => setToValue(toInputValue(to)), [to]);

  const isActive = Boolean(from || to);

  // typing over a range means it no longer matches any quick range
  const commit = (nextFrom: string, nextTo: string) => {
    onChange({ from: toIso(nextFrom), to: toIso(nextTo), preset: undefined });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="logs-from" className="text-xs text-muted-foreground">
            From (local)
          </label>
          <Input
            id="logs-from"
            type="datetime-local"
            value={fromValue}
            className="h-8 w-56"
            onChange={(event) => {
              setFromValue(event.target.value);
              commit(event.target.value, toValue);
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="logs-to" className="text-xs text-muted-foreground">
            To (local)
          </label>
          <Input
            id="logs-to"
            type="datetime-local"
            value={toValue}
            className="h-8 w-56"
            onChange={(event) => {
              setToValue(event.target.value);
              commit(fromValue, event.target.value);
            }}
          />
        </div>

        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => {
              const end = new Date();
              const start = new Date(end.getTime() - preset.ms);
              setFromValue(toInputValue(start.toISOString()));
              setToValue(toInputValue(end.toISOString()));
              onChange({
                from: start.toISOString(),
                to: end.toISOString(),
                preset: preset.label,
              });
            }}
          >
            Last {preset.label}
            {activePreset === preset.label && (
              <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />
            )}
          </Button>
        ))}

        {isActive && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => {
              setFromValue("");
              setToValue("");
              onChange({ from: undefined, to: undefined, preset: undefined });
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* the wire format is UTC, so show it: a mistyped local time would
          otherwise silently query the wrong window */}
      {isActive && (
        <p className="text-xs text-muted-foreground">
          Showing {localZone()}
          {from && to && (
            <>
              {" · "}
              {new Date(from).toISOString().slice(0, 16).replace("T", " ")}Z to{" "}
              {new Date(to).toISOString().slice(0, 16).replace("T", " ")}Z
            </>
          )}
          {from && !to && " · open-ended to now"}
          {!from && to && " · everything up to this time"}
        </p>
      )}
    </div>
  );
}
