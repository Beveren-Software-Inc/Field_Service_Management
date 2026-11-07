"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Timeline, {
  DateHeader,
  SidebarHeader,
  TimelineHeaders,
  type TimelineGroupBase,
  type TimelineItemBase,
} from "react-calendar-timeline";
import "react-calendar-timeline/style.css";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useToast } from "../../hooks/use-toast";
import {
  assignVisit,
  boardVisitToAppointment,
  fetchBoard,
  fetchBoardOptions,
} from "../../hooks/use-appointments";
import type { Appointment, BoardPayload, BoardTechnician, BoardVisit } from "../../pages/schedule/types";
import {
  addDaysKey,
  epochToWall,
  formatDayHeading,
  formatShortDay,
  formatTime,
  getCompanyTimeZone,
  startOfWeekKey,
  todayKey,
  wallToEpoch,
} from "../../lib/company-time";

const LINE_HEIGHT = 76;
const SNAP_MS = 15 * 60 * 1000;
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 19;
const PALETTE = ["#0f766e", "#1d4ed8", "#7c3aed", "#c2410c", "#be123c", "#0369a1", "#4d7c0f", "#a16207"];

const STATUSES = [
  "Unassigned",
  "Scheduled",
  "Dispatched",
  "En route",
  "On site",
  "Paused",
  "Completed",
  "Cancelled",
];

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  Unassigned: { bg: "#e2e8f0", fg: "#0f172a" },
  Scheduled: { bg: "#dbeafe", fg: "#1e3a8a" },
  Dispatched: { bg: "#ede9fe", fg: "#4c1d95" },
  "En route": { bg: "#fef3c7", fg: "#92400e" },
  "On site": { bg: "#ffedd5", fg: "#9a3412" },
  Paused: { bg: "#e5e7eb", fg: "#111827" },
  Completed: { bg: "#dcfce7", fg: "#14532d" },
  Cancelled: { bg: "#f3f4f6", fg: "#4b5563" },
};

interface TechGroup extends TimelineGroupBase {
  color: string;
  serviceArea?: string | null;
}

interface VisitItem extends TimelineItemBase<number> {
  kind: "visit" | "blocked";
  appointment: string;
  technician: string;
  status?: string;
  techColor?: string;
  headline?: string;
  detail?: string;
  windowLabel?: string;
}

interface FilterChoice {
  value: string;
  label: string;
}

interface DispatchBoardProps {
  onAppointmentClick: (appointment: Appointment) => void;
  refreshToken?: number;
}

function snap(ms: number): number {
  return Math.round(ms / SNAP_MS) * SNAP_MS;
}

function technicianColor(tech: BoardTechnician, index: number): string {
  return tech.color || PALETTE[index % PALETTE.length];
}

function visitDuration(visit: BoardVisit, timeZone: string): number {
  const start = wallToEpoch(visit.scheduled_start_datetime, timeZone);
  const end = wallToEpoch(visit.scheduled_finish_datetime, timeZone);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 60 * 60 * 1000;
  return end - start;
}

function arrivalLabel(visit: BoardVisit, timeZone: string): string {
  if (!visit.arrival_window_start || !visit.arrival_window_end) return "";
  return `${formatTime(visit.arrival_window_start, timeZone)}–${formatTime(visit.arrival_window_end, timeZone)}`;
}

function mergeRanges(ranges: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  const sorted = ranges.filter((range) => range.end > range.start).sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) merged.push({ ...range });
    else last.end = Math.max(last.end, range.end);
  }
  return merged;
}

function blockedRanges(
  tech: BoardTechnician,
  windowStart: number,
  windowEnd: number,
  timeZone: string
): Array<{ start: number; end: number }> {
  const shifts = mergeRanges(
    (tech.shifts || [])
      .map((block) => ({
        start: wallToEpoch(block.start, timeZone),
        end: wallToEpoch(block.end, timeZone),
      }))
      .map((block) => ({
        start: Math.max(block.start, windowStart),
        end: Math.min(block.end, windowEnd),
      }))
  );
  const blocks: Array<{ start: number; end: number }> = [];
  if (shifts.length) {
    let cursor = windowStart;
    for (const shift of shifts) {
      if (shift.start > cursor) blocks.push({ start: cursor, end: shift.start });
      cursor = Math.max(cursor, shift.end);
    }
    if (cursor < windowEnd) blocks.push({ start: cursor, end: windowEnd });
  }
  for (const leave of tech.leaves || []) {
    const start = Math.max(wallToEpoch(leave.start, timeZone), windowStart);
    const end = Math.min(wallToEpoch(leave.end, timeZone), windowEnd);
    if (end > start) blocks.push({ start, end });
  }
  return blocks;
}

export function DispatchBoard({ onAppointmentClick, refreshToken = 0 }: DispatchBoardProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"day" | "week">("day");
  const [timeZone, setTimeZone] = useState(getCompanyTimeZone);
  const [anchor, setAnchor] = useState(() => todayKey(getCompanyTimeZone()));
  const [filters, setFilters] = useState({
    team: "all",
    skill: "all",
    service_area: "all",
    status: "all",
    service_type: "all",
  });
  const [choices, setChoices] = useState({
    teams: [] as FilterChoice[],
    skills: [] as FilterChoice[],
    areas: [] as FilterChoice[],
    types: [] as FilterChoice[],
  });
  const [board, setBoard] = useState<BoardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const draggingName = useRef<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const query = useMemo(() => {
    if (mode === "week") {
      const startKey = startOfWeekKey(anchor, timeZone);
      const endKey = addDaysKey(startKey, 6, timeZone);
      return { start: `${startKey} 00:00:00`, end: `${endKey} 23:59:59`, startKey, endKey };
    }
    return { start: `${anchor} 00:00:00`, end: `${anchor} 23:59:59`, startKey: anchor, endKey: anchor };
  }, [anchor, mode, timeZone]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await fetchBoard({
        start: query.start,
        end: query.end,
        team: filters.team !== "all" ? filters.team : undefined,
        skill: filters.skill !== "all" ? filters.skill : undefined,
        service_area: filters.service_area !== "all" ? filters.service_area : undefined,
        status: filters.status !== "all" ? filters.status : undefined,
        service_type: filters.service_type !== "all" ? filters.service_type : undefined,
      });
      setBoard(payload);
      if (payload.time_zone) setTimeZone(payload.time_zone);
    } catch (error) {
      toast({
        title: "Could not load the board",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [filters, query.end, query.start, toast]);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [teams, skills, areas, types] = await Promise.all([
        fetchBoardOptions("Service Team", ["name", "team_name"]),
        fetchBoardOptions("Service Technician Skill", ["name", "skill"]),
        fetchBoardOptions("Service Area", ["name"]),
        fetchBoardOptions("Service Type", ["name"]),
      ]);
      if (cancelled) return;
      setChoices({
        teams: teams.map((row) => ({ value: row.name, label: row.team_name || row.name })),
        skills: skills.map((row) => ({ value: row.name, label: row.skill || row.name })),
        areas: areas.map((row) => ({ value: row.name, label: row.name })),
        types: types.map((row) => ({ value: row.name, label: row.name })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const windowRange = useMemo(() => {
    if (mode === "week") {
      const startKey = startOfWeekKey(anchor, timeZone);
      const endKey = addDaysKey(startKey, 7, timeZone);
      return {
        start: wallToEpoch(`${startKey} 00:00:00`, timeZone),
        end: wallToEpoch(`${endKey} 00:00:00`, timeZone),
      };
    }
    let start = wallToEpoch(`${anchor} ${String(DAY_START_HOUR).padStart(2, "0")}:00:00`, timeZone);
    let end = wallToEpoch(`${anchor} ${String(DAY_END_HOUR).padStart(2, "0")}:00:00`, timeZone);
    const dayStart = wallToEpoch(`${anchor} 00:00:00`, timeZone);
    const dayEnd = wallToEpoch(`${addDaysKey(anchor, 1, timeZone)} 00:00:00`, timeZone);
    for (const visit of board?.visits || []) {
      const visitStart = wallToEpoch(visit.scheduled_start_datetime, timeZone);
      const visitEnd = wallToEpoch(visit.scheduled_finish_datetime, timeZone);
      if (visitEnd <= dayStart || visitStart >= dayEnd) continue;
      if (visitStart < start) start = visitStart;
      if (visitEnd > end) end = visitEnd;
    }
    return { start, end };
  }, [anchor, board?.visits, mode, timeZone]);

  const groups: TechGroup[] = useMemo(
    () =>
      (board?.technicians || []).map((tech, index) => ({
        id: tech.name,
        title: tech.full_name || tech.name,
        color: technicianColor(tech, index),
        serviceArea: tech.service_area,
      })),
    [board?.technicians]
  );

  const colorByTech = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((group) => map.set(String(group.id), group.color));
    return map;
  }, [groups]);

  const items: VisitItem[] = useMemo(() => {
    const next: VisitItem[] = [];
    (board?.technicians || []).forEach((tech) => {
      blockedRanges(tech, windowRange.start, windowRange.end, timeZone).forEach((block, index) => {
        next.push({
          id: `blocked:${tech.name}:${index}`,
          group: tech.name,
          appointment: "",
          technician: tech.name,
          kind: "blocked",
          title: "Unavailable",
          start_time: block.start,
          end_time: block.end,
          canMove: false,
          canResize: false,
          canChangeGroup: false,
          className: "blocked-time",
        });
      });
    });
    for (const visit of board?.visits || []) {
      const crew = visit.service_technicians?.length
        ? visit.service_technicians
        : visit.primary_technician
          ? [{ service_technician: visit.primary_technician, full_name: "" }]
          : [];
      const visibleCrew = crew.filter((tech) => groups.some((group) => group.id === tech.service_technician));
      const headline = visit.customer_name || visit.customer || visit.name;
      const detail = [visit.service_type, visit.service_area].filter(Boolean).join(" · ");
      const windowLabel = arrivalLabel(visit, timeZone);
      for (const tech of visibleCrew) {
        next.push({
          id: `${visit.name}:${tech.service_technician}`,
          group: tech.service_technician,
          appointment: visit.name,
          technician: tech.service_technician,
          kind: "visit",
          status: visit.status,
          techColor: colorByTech.get(tech.service_technician),
          headline,
          detail,
          windowLabel,
          title: [headline, detail, windowLabel].filter(Boolean).join(" · "),
          start_time: wallToEpoch(visit.scheduled_start_datetime, timeZone),
          end_time: wallToEpoch(visit.scheduled_finish_datetime, timeZone),
          canMove: true,
          canResize: "both",
          canChangeGroup: true,
          className: "visit-block",
        });
      }
    }
    return next;
  }, [board?.technicians, board?.visits, colorByTech, groups, timeZone, windowRange.end, windowRange.start]);

  const visitByName = useMemo(() => {
    const map = new Map<string, BoardVisit>();
    for (const visit of [...(board?.visits || []), ...(board?.unassigned || [])]) map.set(visit.name, visit);
    return map;
  }, [board]);

  const saveVisit = useCallback(
    async (name: string, startMs: number, endMs: number, technician?: string) => {
      const start = snap(startMs);
      let end = snap(endMs);
      if (end <= start) end = start + SNAP_MS;
      setSaving(true);
      try {
        await assignVisit({
          name,
          scheduled_start_datetime: epochToWall(start, timeZone),
          scheduled_finish_datetime: epochToWall(end, timeZone),
          service_technician: technician,
        });
        await load();
      } catch (error) {
        toast({
          title: "That time is already booked",
          description: (error as Error).message,
          variant: "destructive",
          duration: 6500,
        });
        await load();
      } finally {
        setSaving(false);
      }
    },
    [load, timeZone, toast]
  );

  const onItemMove = (itemId: string | number, dragTime: number, newGroupOrder: number) => {
    const item = items.find((entry) => entry.id === itemId);
    const group = groups[newGroupOrder];
    if (!item || item.kind !== "visit" || !group) return;
    const duration = item.end_time - item.start_time;
    const technician = String(group.id) === item.technician ? undefined : String(group.id);
    void saveVisit(item.appointment, dragTime, dragTime + duration, technician);
  };

  const onItemResize = (itemId: string | number, time: number, edge: "left" | "right") => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item || item.kind !== "visit") return;
    if (edge === "left") void saveVisit(item.appointment, time, item.end_time);
    else void saveVisit(item.appointment, item.start_time, time);
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const name = draggingName.current || event.dataTransfer.getData("text/plain");
    draggingName.current = null;
    const visit = name ? visitByName.get(name) : undefined;
    const canvas = canvasRef.current?.querySelector(".rct-scroll");
    if (!visit || !(canvas instanceof HTMLElement)) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width) return;
    const index = Math.floor((y + canvas.scrollTop) / LINE_HEIGHT);
    const group = groups[index];
    if (!group) return;
    const ratio = Math.min(1, Math.max(0, x / rect.width));
    const start = windowRange.start + ratio * (windowRange.end - windowRange.start);
    void saveVisit(visit.name, start, start + visitDuration(visit, timeZone), String(group.id));
  };

  const heading =
    mode === "week"
      ? `${formatShortDay(query.startKey, timeZone)} – ${formatShortDay(query.endKey, timeZone)}`
      : formatDayHeading(anchor, timeZone);

  const step = (direction: -1 | 1) => {
    setAnchor((current) => addDaysKey(current, direction * (mode === "week" ? 7 : 1), timeZone));
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
          <Button
            size="sm"
            variant={mode === "day" ? "default" : "ghost"}
            onClick={() => setMode("day")}
          >
            Day
          </Button>
          <Button
            size="sm"
            variant={mode === "week" ? "default" : "ghost"}
            onClick={() => setMode("week")}
          >
            Week
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(todayKey(timeZone))}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => step(1)} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
        {saving && <span className="text-sm text-muted-foreground">Saving schedule…</span>}
        {loading && !saving && <span className="text-sm text-muted-foreground">Loading…</span>}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border bg-card/60 px-4 py-2">
        <FilterSelect
          label="Team"
          value={filters.team}
          options={choices.teams}
          onChange={(team) => setFilters((current) => ({ ...current, team }))}
        />
        <FilterSelect
          label="Skill"
          value={filters.skill}
          options={choices.skills}
          onChange={(skill) => setFilters((current) => ({ ...current, skill }))}
        />
        <FilterSelect
          label="Service area"
          value={filters.service_area}
          options={choices.areas}
          onChange={(service_area) => setFilters((current) => ({ ...current, service_area }))}
        />
        <FilterSelect
          label="Status"
          value={filters.status}
          options={STATUSES.map((status) => ({ value: status, label: status }))}
          onChange={(status) => setFilters((current) => ({ ...current, status }))}
        />
        <FilterSelect
          label="Service type"
          value={filters.service_type}
          options={choices.types}
          onChange={(service_type) => setFilters((current) => ({ ...current, service_type }))}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Unassigned</p>
              <p className="text-xs text-muted-foreground">Drag onto a person and time</p>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              {board?.unassigned.length || 0}
            </span>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-4">
            {(board?.unassigned || []).length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing waiting in this window.
              </p>
            )}
            {(board?.unassigned || []).map((visit) => (
              <button
                key={visit.name}
                type="button"
                draggable
                onDragStart={(event) => {
                  draggingName.current = visit.name;
                  event.dataTransfer.setData("text/plain", visit.name);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  draggingName.current = null;
                  setDragOver(false);
                }}
                onClick={() => onAppointmentClick(boardVisitToAppointment(visit))}
                className="w-full cursor-grab rounded-xl border border-border bg-background p-3 text-left shadow-sm transition hover:border-primary/50 active:cursor-grabbing"
              >
                <p className="truncate text-sm font-semibold">{visit.customer_name || visit.customer || visit.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[visit.service_type, visit.service_area].filter(Boolean).join(" · ") || "Unassigned visit"}
                </p>
                <p className="mt-1 text-xs">
                  {formatTime(visit.scheduled_start_datetime, timeZone)}
                  {" – "}
                  {formatTime(visit.scheduled_finish_datetime, timeZone)}
                  {arrivalLabel(visit, timeZone) ? ` · Arrive ${arrivalLabel(visit, timeZone)}` : ""}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <div
          ref={canvasRef}
          className={`dispatch-timeline min-w-0 flex-1 overflow-auto ${dragOver ? "ring-2 ring-inset ring-primary" : ""}`}
          onDragOver={(event) => {
            if (!draggingName.current) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {groups.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
              No active technicians match these filters.
            </div>
          ) : (
            <Timeline
              groups={groups}
              items={items}
              visibleTimeStart={windowRange.start}
              visibleTimeEnd={windowRange.end}
              onTimeChange={(_start, _end, update) => update(windowRange.start, windowRange.end)}
              onItemMove={onItemMove}
              onItemResize={onItemResize}
              onItemClick={(itemId) => {
                const item = items.find((entry) => entry.id === itemId);
                if (!item || item.kind !== "visit") return;
                const visit = visitByName.get(item.appointment);
                if (visit) onAppointmentClick(boardVisitToAppointment(visit));
              }}
              lineHeight={LINE_HEIGHT}
              itemHeightRatio={0.72}
              sidebarWidth={220}
              dragSnap={SNAP_MS}
              canMove
              canResize="both"
              canChangeGroup
              stackItems={false}
              traditionalZoom={false}
              className="dispatch-timeline"
              groupRenderer={({ group }) => (
                <div className="flex h-full items-center gap-2 px-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: group.color }} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{group.title}</span>
                    {group.serviceArea ? (
                      <span className="block truncate text-[11px] text-muted-foreground">{group.serviceArea}</span>
                    ) : null}
                  </span>
                </div>
              )}
              itemRenderer={({ item, getItemProps, getResizeProps }) => {
                if (item.kind === "blocked") {
                  return <div {...getItemProps({ className: "blocked-time" })} />;
                }
                const style = STATUS_STYLE[item.status || ""] || STATUS_STYLE.Scheduled;
                const { left, right } = getResizeProps();
                return (
                  <div
                    {...getItemProps({
                      className: "visit-block",
                      style: {
                        background: style.bg,
                        color: style.fg,
                        borderLeft: `4px solid ${item.techColor || "#2563eb"}`,
                        borderRadius: 8,
                        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
                      },
                    })}
                  >
                    <div {...left} />
                    <div className="flex h-full flex-col justify-center overflow-hidden px-2 leading-tight">
                      <span className="truncate text-[12px] font-semibold">{item.headline}</span>
                      {item.detail ? <span className="truncate text-[11px] opacity-80">{item.detail}</span> : null}
                      {item.windowLabel ? (
                        <span className="truncate text-[10px] opacity-70">Arrive {item.windowLabel}</span>
                      ) : null}
                    </div>
                    <div {...right} />
                  </div>
                );
              }}
            >
              <TimelineHeaders>
                <SidebarHeader>
                  {({ getRootProps }) => (
                    <div
                      {...getRootProps({
                        style: { display: "flex", alignItems: "flex-end", padding: "0 12px 8px" },
                      })}
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Technician
                      </span>
                    </div>
                  )}
                </SidebarHeader>
                <DateHeader
                  unit="day"
                  intervalRenderer={({ intervalContext, getIntervalProps }) => (
                    <div
                      {...getIntervalProps({
                        style: { display: "flex", alignItems: "flex-end", padding: "0 8px 4px" },
                      })}
                    >
                      <span className="text-xs font-medium">
                        {new Intl.DateTimeFormat("en-US", {
                          timeZone,
                          weekday: mode === "week" ? "short" : "long",
                          month: "short",
                          day: "numeric",
                        }).format(new Date(intervalContext.interval.startTime.valueOf()))}
                      </span>
                    </div>
                  )}
                />
                <DateHeader
                  unit="hour"
                  intervalRenderer={({ intervalContext, getIntervalProps }) => {
                    const hour = Number(
                      epochToWall(intervalContext.interval.startTime.valueOf(), timeZone).slice(11, 13)
                    );
                    const show = mode === "day" || hour % 6 === 0;
                    return (
                      <div {...getIntervalProps({ style: { padding: "2px 4px" } })}>
                        {show ? (
                          <span className="text-[11px] text-muted-foreground">
                            {new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric" }).format(
                              new Date(intervalContext.interval.startTime.valueOf())
                            )}
                          </span>
                        ) : null}
                      </div>
                    );
                  }}
                />
              </TimelineHeaders>
            </Timeline>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterChoice[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[160px] bg-background" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">
          {label === "Status" ? "All statuses" : `All ${label.toLowerCase()}s`}
        </SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
