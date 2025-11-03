"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "../ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Appointment } from "../../pages/schedule/types";
import { fetchTechnicians, reallocateAppointment } from "../../hooks/use-appointments";
import { toast } from "../ui/use-toast";
import { format, startOfDay, parse } from "date-fns";
import { cn } from "../../lib/utils";

interface GanttViewProps {
  appointments: Appointment[];
  selectedDate: Date;
  onAppointmentClick?: (appointment: Appointment) => void;
  technicianSearch?: string;
}

interface Technician {
  name: string;
  full_name: string;
}

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i); // 0-23
const DEFAULT_START_HOUR = 8; // 6am
const DEFAULT_END_HOUR = 20; // 6pm

const TECHNICIAN_ROW_HEIGHT = 60; // Fixed height per technician row (compact, shows 2 arrows worth)

export function GanttView({
  appointments,
  selectedDate,
  onAppointmentClick,
  technicianSearch = "",
}: GanttViewProps) {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleStartHour, setVisibleStartHour] = useState(DEFAULT_START_HOUR);
  const [visibleEndHour, setVisibleEndHour] = useState(DEFAULT_END_HOUR);

  useEffect(() => {
    loadTechnicians();
  }, []);

  const loadTechnicians = async () => {
    try {
      const data = await fetchTechnicians();
      setTechnicians(data);
    } catch (error) {
      console.error("Error loading technicians:", error);
    } finally {
      setLoading(false);
    }
  };

  // Parse backend datetime as local to avoid timezone drift
  const parseLocalDateTime = (value: string): Date => {
    try {
      const normalized = value.replace("T", " ").slice(0, 19);
      return parse(normalized, "yyyy-MM-dd HH:mm:ss", new Date());
    } catch {
      return new Date(value);
    }
  };

  // Filter technicians by search
  const filteredTechnicians = useMemo(() => {
    if (!technicianSearch.trim()) return technicians;
    const searchLower = technicianSearch.toLowerCase();
    return technicians.filter(
      (tech) =>
        tech.full_name.toLowerCase().includes(searchLower) ||
        tech.name.toLowerCase().includes(searchLower)
    );
  }, [technicians, technicianSearch]);

  // Filter appointments for the selected date (parse as local to avoid TZ drift)
  const appointmentsForSelectedDate = useMemo(() => {
    const selectedDateStr = format(selectedDate, "yyyy-MM-dd");

    return appointments.filter((apt) => {
      if (!apt.scheduled_start_datetime) return false;

      const appointmentDate = parseLocalDateTime(apt.scheduled_start_datetime);
      const appointmentDateStr = format(appointmentDate, "yyyy-MM-dd");

      return appointmentDateStr === selectedDateStr;
    });
  }, [appointments, selectedDate]);

  // Get technicians that have appointments for this date
  const techniciansWithAppointments = useMemo(() => {
    const techMap = new Map<string, Technician>();

    appointmentsForSelectedDate.forEach((apt) => {
      apt.service_technicians?.forEach((tech) => {
        if (!techMap.has(tech.service_technician)) {
          const techData = filteredTechnicians.find((t) => t.name === tech.service_technician);
          if (techData) {
            techMap.set(tech.service_technician, techData);
          }
        }
      });
    });

    // Include filtered technicians even if they don't have appointments
    filteredTechnicians.forEach((tech) => {
      if (!techMap.has(tech.name)) {
        techMap.set(tech.name, tech);
      }
    });

    return Array.from(techMap.values());
  }, [appointmentsForSelectedDate, filteredTechnicians]);

  const getAppointmentsForTechnician = (technicianName: string) => {
    return appointmentsForSelectedDate.filter(
      (apt) =>
        apt.service_technicians?.some(
          (tech) => tech.service_technician === technicianName
        )
    );
  };


  const visibleHours = ALL_HOURS.slice(visibleStartHour, visibleEndHour + 1);
  const visibleHoursCount = visibleEndHour - visibleStartHour + 1;

  const canScrollLeft = visibleStartHour > 0;
  const canScrollRight = visibleEndHour < 23;

  const scrollLeft = () => {
    if (canScrollLeft) {
      const newStart = Math.max(0, visibleStartHour - 3);
      const hoursToShow = visibleEndHour - newStart + 1;
      if (hoursToShow > 12) {
        setVisibleStartHour(newStart);
        setVisibleEndHour(newStart + 11);
      } else {
        setVisibleStartHour(newStart);
      }
    }
  };

  const scrollRight = () => {
    if (canScrollRight) {
      const newEnd = Math.min(23, visibleEndHour + 3);
      const hoursToShow = newEnd - visibleStartHour + 1;
      if (hoursToShow > 12) {
        setVisibleStartHour(newEnd - 11);
        setVisibleEndHour(newEnd);
      } else {
        setVisibleEndHour(newEnd);
      }
    }
  };

  const timelineRef = useRef<HTMLDivElement>(null);

  const hourColumnWidth = 80; // keep in sync with rendering

  const toFrappeDateTime = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    return `${y}-${m}-${d} ${hh}:${mm}:00`;
  };



  const handleDropOnTech = async (e: React.DragEvent, tech: Technician) => {
    try {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/json");
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.type !== "appointment" || !data.id) return;

      // Compute start time from pointer position within timeline grid
      const timeline = timelineRef.current;
      if (!timeline) return;
      const rect = timeline.getBoundingClientRect();
      const x = e.clientX - rect.left; // px from left of timeline
      const hoursFromVisibleStart = x / hourColumnWidth;
      const minutesFromVisibleStart = Math.max(0, Math.round(hoursFromVisibleStart * 60));
      const absoluteMinutes = visibleStartHour * 60 + minutesFromVisibleStart;

      // Snap to nearest 15 minutes
      const snappedMinutes = Math.round(absoluteMinutes / 15) * 15;
      const start = new Date(selectedDate);
      start.setHours(0, 0, 0, 0);
      start.setMinutes(snappedMinutes);

      const duration = Number(data.durationMinutes) || 60;
      const finish = new Date(start.getTime() + duration * 60000);

      await reallocateAppointment({
        name: data.id,
        scheduled_start_datetime: toFrappeDateTime(start),
        scheduled_finish_datetime: toFrappeDateTime(finish),
        service_technicians: [{ service_technician: tech.name, full_name: tech.full_name }],
        reschedule: true,
      });
      toast({ title: "Reassigned", description: `Appointment moved to ${tech.full_name}` });
      // simple refresh
      window.location.reload();
    } catch (err) {
      const message = (err as Error)?.message || "Failed to reassign appointment";
      toast({ title: "Schedule Conflict", description: message, variant: message.toLowerCase().includes("overlap") ? "warning" : "destructive" });
    }
  };

  // Current time indicator position
  const showNowLine = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const selectedStr = format(selectedDate, "yyyy-MM-dd");
    return todayStr === selectedStr;
  }, [selectedDate]);

  const nowLeftPx = useMemo(() => {
    if (!showNowLine) return null as number | null;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const visibleStartMinutes = visibleStartHour * 60;
    const adjusted = minutes - visibleStartMinutes;
    const leftPx = adjusted * (hourColumnWidth / 60);
    // Debug: current time and computed pixel position
    // eslint-disable-next-line no-console
    console.log(
      "[Gantt] Now:", now.toISOString(),
      "| HH:mm:", `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      "| visibleStartHour:", visibleStartHour,
      "| leftPx:", leftPx
    );
    return leftPx;
  }, [showNowLine, visibleStartHour]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Gantt Content */}
      <div className="flex-1 overflow-auto relative">

        <div className="flex h-full">
          {/* Technician Names Column - Narrow */}
          <div className="w-32 border-r border-border bg-card sticky left-0 z-10">
            <div className="sticky top-0 bg-card border-b border-border px-2 py-2 font-semibold text-xs h-[40px] flex items-center">
              Technicians
            </div>
            <div>
              {loading ? (
                <div className="p-2 text-xs text-muted-foreground">Loading...</div>
              ) : techniciansWithAppointments.length === 0 ? (
                <div className="p-2 text-xs text-muted-foreground">
                  {technicianSearch ? "No technicians found" : "No technicians"}
                </div>
              ) : (
                techniciansWithAppointments.map((tech, idx) => {
                  return (
                    <div
                      key={tech.name}
                      className={`px-2 py-2 border-r border-border ${idx === 0 ? 'border-t-0' : 'border-t border-border'} border-b-2 border-border`}
                      style={{ height: `${TECHNICIAN_ROW_HEIGHT}px` }}
                    >
                      <div className="font-medium text-xs leading-tight">{tech.full_name}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Timeline Grid */}
          <div className="flex-1 relative" ref={timelineRef}
            onDragOver={(e) => e.preventDefault()}
          >
            {/* Time Column Headers with Scroll Arrows */}
            <div className="sticky top-0 bg-card border-b border-border z-20 flex relative items-center h-[40px]">
              {/* Left Arrow Button */}
              {canScrollLeft && (
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute left-1 top-1/2 -translate-y-1/2 z-30 bg-background shadow-md hover:shadow-lg h-7 w-7"
                  onClick={scrollLeft}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}

              {/* Time Labels */}
              <div className={cn("flex flex-1", canScrollLeft && "ml-10", canScrollRight && "mr-10")}>
                {visibleHours.map((hour) => (
                  <div
                    key={hour}
                    className="flex-1 border-r border-border px-2 py-2 text-center text-xs font-medium"
                    style={{ minWidth: "80px" }}
                  >
                    {hour.toString().padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {/* Right Arrow Button */}
              {canScrollRight && (
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 z-30 bg-background shadow-md hover:shadow-lg h-7 w-7"
                  onClick={scrollRight}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Technician Rows with Appointments */}
            <div className="relative">
                {/* Current time vertical line */}
                {showNowLine && nowLeftPx !== null && (
                  <div
                    className="absolute top-0 bottom-0 z-10 border-r border-dashed"
                    style={{ left: `${nowLeftPx}px`, borderColor: "rgba(255, 165, 0, 0.9)" }}
                  />
                )}
              {techniciansWithAppointments.map((tech) => {
                const techAppointments = getAppointmentsForTechnician(tech.name);

                return (
                  <div
                    key={tech.name}
                    className="relative border-b-2 border-border"
                    style={{ height: `${TECHNICIAN_ROW_HEIGHT}px` }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDropOnTech(e, tech)}
                  >
                    {/* Hour Grid Lines - Scaled to fit row height */}
                    <div className="absolute inset-0">
                      {visibleHours.map((hour, idx) => {
                        // Scale hour positions to fit within technician row height
                        const scaledTop = (idx / visibleHoursCount) * TECHNICIAN_ROW_HEIGHT;
                        return (
                          <div
                            key={hour}
                            className="absolute border-t border-border/30"
                            style={{
                              top: `${scaledTop}px`,
                              width: "100%"
                            }}
                          />
                        );
                      })}
                    </div>

                    {/* Appointments */}
                    {techAppointments.map((appointment) => {
                      if (!appointment.scheduled_start_datetime || !appointment.scheduled_finish_datetime) {
                        return null;
                      }

                      // Check if appointment is in visible range
                      const startDt = parseLocalDateTime(appointment.scheduled_start_datetime);
                      const endDt = parseLocalDateTime(appointment.scheduled_finish_datetime);
                      const appointmentStartHour = startDt.getHours();
                      const appointmentEndHour = endDt.getHours();

                      // Skip if appointment is completely outside visible range
                      if (
                        (appointmentEndHour < visibleStartHour) ||
                        (appointmentStartHour > visibleEndHour)
                      ) {
                        return null;
                      }

                      const statusColors: Record<string, string> = {
                        Open: "bg-primary/70",
                        Scheduled: "bg-primary/70",
                        Dispatched: "bg-purple-500/70",
                        "In Progress": "bg-orange-500/70",
                        Completed: "bg-green-500/70",
                        Cancelled: "bg-gray-400/70",
                      };

                      const statusColor =
                        statusColors[appointment.status] || "bg-gray-500";

                      const startTime = format(startDt, "HH:mm");
                      const endTime = format(endDt, "HH:mm");

                      // Calculate position relative to visible hours
                      const dayStart = startOfDay(selectedDate);
                      const appointmentStart = startDt;
                      const appointmentEnd = endDt;

                      const startMinutes = (appointmentStart.getTime() - dayStart.getTime()) / (1000 * 60);
                      const endMinutes = (appointmentEnd.getTime() - dayStart.getTime()) / (1000 * 60);

                      // Adjust for visible hours offset - calculate position relative to visible start
                      const visibleStartMinutes = visibleStartHour * 60;

                      // Calculate position relative to visible start (can be negative if before visible range)
                      const adjustedStartMinutes = startMinutes - visibleStartMinutes;

                      const adjustedEndMinutes = endMinutes - visibleStartMinutes;

                      // Vertical position - center the appointment bar in the technician row
                      const top = (TECHNICIAN_ROW_HEIGHT - 40) / 2; // Center 40px bar in 60px row




                      const height = 40; // Fixed height in pixels (2 units)

                      // Calculate horizontal position and width using absolute pixel values
                      // Each hour is 80px wide, so we calculate based on that
                      const hourColumnWidth = 80;

                      // Calculate left position in pixels (relative to visible start)
                      // If start is before visible range, left will be negative (will be clipped naturally)
                      const leftPx = (adjustedStartMinutes / 60) * hourColumnWidth;

                      // Calculate width in pixels based on actual duration
                      // This allows the bar to extend beyond visible range
                      const durationHours = (adjustedEndMinutes - adjustedStartMinutes) / 60;
                      const widthPx = Math.max(durationHours * hourColumnWidth, 80); // Min 80px

                      const left = `${leftPx}px`;
                      const width = `${widthPx}px`;

                      return (
                        <div
                          key={appointment.name}
                          className={`absolute ${statusColor} text-white text-xs rounded px-2 py-0.5 cursor-pointer hover:opacity-90 hover:shadow-md transition-all border border-white/20 shadow-sm overflow-hidden`}
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            left: left,
                            width: width,
                            minWidth: "80px",
                          }}
                          title={`${appointment.service_type || appointment.service_order || appointment.name} (${startTime} - ${endTime})`}
                          onClick={() => onAppointmentClick?.(appointment)}
                        >
                          <div className="font-medium truncate text-[11px] leading-tight">
                            {appointment.service_type || appointment.service_order || appointment.name}
                          </div>
                          <div className="text-[10px] opacity-90 mt-0.5">
                            {startTime} - {endTime}
                          </div>
                          {appointment.customer && (
                            <div className="text-[10px] opacity-75 truncate mt-0.5">
                              {appointment.customer}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
