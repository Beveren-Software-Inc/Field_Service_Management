"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Appointment } from "../../pages/schedule/types";
import { fetchTechnicians, reallocateAppointment, createAppointment, fetchServiceTypes, fetchItems, fetchAvailableServiceOrders } from "../../hooks/use-appointments";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { toast } from "../ui/use-toast";
import { format, startOfDay, parse } from "date-fns";

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
const TECHNICIAN_ROW_HEIGHT = 60; // Fixed height per technician row (compact, shows 2 arrows worth)
const HOUR_COLUMN_WIDTH = 80;
const TIMELINE_WIDTH = ALL_HOURS.length * HOUR_COLUMN_WIDTH;

export function GanttView({
  appointments,
  selectedDate,
  onAppointmentClick,
  technicianSearch = "",
}: GanttViewProps) {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createStart, setCreateStart] = useState<Date | null>(null);
  const [createFinish, setCreateFinish] = useState<Date | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createCustomer, setCreateCustomer] = useState("");
  const [createServiceOrder, setCreateServiceOrder] = useState("");
  const [createServiceType, setCreateServiceType] = useState("");
  const [createTechnicianIds, setCreateTechnicianIds] = useState<string[]>([]);
  const [createItems, setCreateItems] = useState<Array<{ item_code: string; qty: number; rate: number }>>([]);
  const [optionsServiceOrders, setOptionsServiceOrders] = useState<Array<{name: string; customer?: string; type?: string}>>([]);
  const [optionsServiceTypes, setOptionsServiceTypes] = useState<Array<{name: string}>>([]);
  const [optionsItems, setOptionsItems] = useState<Array<{name: string; item_name?: string; standard_rate?: number}>>([]);

  useEffect(() => {
    // Load master data for create modal
    Promise.all([fetchAvailableServiceOrders(), fetchServiceTypes(), fetchItems()])
      .then(([so, st, it]) => {
        setOptionsServiceOrders(so);
        setOptionsServiceTypes(st);
        setOptionsItems(it);
      })
      .catch(() => {});
  }, []);

  // Auto-fill customer (and service type if present on SO) when selecting Service Order
  useEffect(() => {
    if (!createServiceOrder) return;
    const so = optionsServiceOrders.find((o) => o.name === createServiceOrder);
    if (so) {
      if (so.customer) setCreateCustomer(so.customer);
      if (so.type) setCreateServiceType(so.type);
    }
  }, [createServiceOrder, optionsServiceOrders]);

  useEffect(() => {
    loadTechnicians();
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ service_order: string; customer?: string }>).detail;
      if (!detail) return;
      setCreateServiceOrder(detail.service_order);
      if (detail.customer) {
        setCreateCustomer(detail.customer);
      }
      setCreateOpen(true);
    };

    window.addEventListener("open-create-appointment", handler);
    return () => window.removeEventListener("open-create-appointment", handler);
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


  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);


  const toFrappeDateTime = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    return `${y}-${m}-${d} ${hh}:${mm}:00`;
  };



  const getMinutesFromPointer = (clientX: number) => {
    const timeline = timelineContentRef.current;
    if (!timeline) return 0;
    const rect = timeline.getBoundingClientRect();
    const x = clientX - rect.left;
    const clampedX = Math.max(0, Math.min(x, TIMELINE_WIDTH));
    return Math.max(0, Math.round((clampedX / HOUR_COLUMN_WIDTH) * 60));
  };

  const handleDropOnTech = async (e: React.DragEvent, tech: Technician) => {
    try {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/json");
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.type !== "appointment" || !data.id) return;

      const absoluteMinutes = getMinutesFromPointer(e.clientX);

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
    return (minutes / 60) * HOUR_COLUMN_WIDTH;
  }, [showNowLine]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Gantt Content */}
      <div className="flex-1 overflow-auto relative" ref={scrollContainerRef}>

        <div className="flex h-full min-w-max">
          {/* Technician Names Column - Narrow */}
          <div className="w-32 border-r border-border bg-card sticky left-0 z-20">
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
          <div
            className="relative flex-shrink-0"
            style={{ width: `${TIMELINE_WIDTH}px` }}
          >
            {/* Time Column Headers */}
            <div className="sticky top-0 bg-card border-b border-border z-20 flex items-center h-[40px]">
              <div className="flex" style={{ width: `${TIMELINE_WIDTH}px` }}>
                {ALL_HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="flex-none border-r border-border px-2 py-2 text-center text-xs font-medium"
                    style={{ width: `${HOUR_COLUMN_WIDTH}px` }}
                  >
                    {hour.toString().padStart(2, "0")}:00
                  </div>
                ))}
              </div>
            </div>

            {/* Technician Rows with Appointments */}
            <div
              className="relative"
              ref={timelineContentRef}
              onDragOver={(e) => e.preventDefault()}
            >
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
                    onDoubleClick={(e) => {
                      const absoluteMinutes = getMinutesFromPointer(e.clientX);
                      const start = new Date(selectedDate);
                      start.setHours(0, 0, 0, 0);
                      start.setMinutes(Math.round(absoluteMinutes / 15) * 15);
                      const finish = new Date(start.getTime() + 60 * 60000);
                      setCreateStart(start);
                      setCreateFinish(finish);
                      setCreateTechnicianIds([tech.name]);
                      setCreateOpen(true);
                    }}
                  >
                    {/* Hour Grid Lines */}
                    <div className="absolute inset-0 pointer-events-none">
                      {[...ALL_HOURS, ALL_HOURS.length].map((hour) => (
                        <div
                          key={`grid-${hour}`}
                          className="absolute border-l border-border/30"
                          style={{
                            left: `${hour * HOUR_COLUMN_WIDTH}px`,
                            top: 0,
                            bottom: 0,
                          }}
                        />
                      ))}
                    </div>

                    {/* Appointments */}
                    {techAppointments.map((appointment) => {
                      if (!appointment.scheduled_start_datetime || !appointment.scheduled_finish_datetime) {
                        return null;
                      }

                      const startDt = parseLocalDateTime(appointment.scheduled_start_datetime);
                      const endDt = parseLocalDateTime(appointment.scheduled_finish_datetime);

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

                      // Vertical position - center the appointment bar in the technician row
                      const top = (TECHNICIAN_ROW_HEIGHT - 40) / 2; // Center 40px bar in 60px row




                      const height = 40; // Fixed height in pixels (2 units)

                      // Calculate horizontal position and width using absolute pixel values
                      // Each hour is 80px wide, so we calculate based on that
                      const leftPx = (startMinutes / 60) * HOUR_COLUMN_WIDTH;

                      const durationHours = (endMinutes - startMinutes) / 60;
                      const widthPx = Math.max(durationHours * HOUR_COLUMN_WIDTH, 40); // Min width

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

      {/* Create Appointment Dialog */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-auto animate-in fade-in duration-500">
          <div className="bg-background rounded-md shadow-2xl w-full max-w-5xl p-5 border border-border relative mt-20 animate-slide-down-slow">
            <div className="absolute inset-y-0 left-0 w-[6px] bg-gradient-to-b from-primary/90 to-primary/20 rounded-l" />
            <div className="absolute inset-x-0 top-0 h-[6px] bg-gradient-to-r from-primary/90 to-primary/20 rounded-t" />
            <div className="flex items-center justify-between mb-3">
              <div className="text-base font-semibold text-foreground">Create Appointment</div>
              <button className="text-sm text-foreground hover:text-muted-foreground" onClick={() => setCreateOpen(false)}>Close</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-1">
                <label className="text-xs text-muted-foreground">Service Order</label>
                <select className="w-full border border-input rounded px-2 py-1 text-sm bg-background text-foreground" value={createServiceOrder} onChange={(e) => setCreateServiceOrder(e.target.value)}>
                  <option value="">Select Service Order</option>
                  {optionsServiceOrders.map((so) => (
                    <option key={so.name} value={so.name}>{so.name}{so.customer ? ` - ${so.customer}` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-1">
                <label className="text-xs text-muted-foreground">Customer</label>
                <div className="w-full border border-input rounded px-2 py-1 text-sm bg-muted/50 text-foreground">
                  {createCustomer || "(auto from Service Order)"}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Service Type</label>
                <select className="w-full border border-input rounded px-2 py-1 text-sm bg-background text-foreground" value={createServiceType} onChange={(e) => setCreateServiceType(e.target.value)}>
                  <option value="">Select Service Type</option>
                  {optionsServiceTypes.map((st) => (
                    <option key={st.name} value={st.name}>{st.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Scheduled Start</label>
                <input
                  type="datetime-local"
                  className="w-full border border-input rounded px-2 py-1 text-sm bg-background text-foreground"
                  value={
                    createStart
                      ? `${createStart.getFullYear()}-${String(createStart.getMonth() + 1).padStart(2, "0")}-${String(createStart.getDate()).padStart(2, "0")}T${String(createStart.getHours()).padStart(2, "0")}:${String(createStart.getMinutes()).padStart(2, "0")}`
                      : ""
                  }
                  onChange={(e) => setCreateStart(new Date(e.target.value))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Scheduled Finish</label>
                <input
                  type="datetime-local"
                  className="w-full border border-input rounded px-2 py-1 text-sm bg-background text-foreground"
                  value={
                    createFinish
                      ? `${createFinish.getFullYear()}-${String(createFinish.getMonth() + 1).padStart(2, "0")}-${String(createFinish.getDate()).padStart(2, "0")}T${String(createFinish.getHours()).padStart(2, "0")}:${String(createFinish.getMinutes()).padStart(2, "0")}`
                      : ""
                  }
                  onChange={(e) => setCreateFinish(new Date(e.target.value))}
                />
              </div>
              <div className="sm:col-span-1">
                <label className="text-xs text-muted-foreground">Technicians</label>
                <div className="border border-input rounded p-2 max-h-40 overflow-auto space-y-1 bg-background">
                  {technicians.map((t) => (
                    <label key={t.name} className="flex items-center gap-2 text-sm text-foreground">
                      <input type="checkbox" checked={createTechnicianIds.includes(t.name)} onChange={(e) => {
                        setCreateTechnicianIds((prev) => e.target.checked ? Array.from(new Set([...prev, t.name])) : prev.filter((id) => id !== t.name));
                      }} />
                      <span>{t.full_name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-1">
                <label className="text-xs text-muted-foreground">Items</label>
                <div className="flex items-center gap-2 mb-2">
                  <select className="flex-1 border border-input rounded px-2 py-1 text-sm bg-background text-foreground" onChange={(e) => {
                    const code = e.target.value;
                    if (!code) return;
                    const exists = createItems.find((r) => r.item_code === code);
                    if (exists) return;
                    const item = optionsItems.find((i) => i.name === code);
                    setCreateItems((prev) => [...prev, { item_code: code, qty: 1, rate: Number(item?.standard_rate)||0 }]);
                    e.currentTarget.selectedIndex = 0;
                  }}>
                    <option value="">Add Item…</option>
                    {optionsItems.map((it) => (
                      <option key={it.name} value={it.name}>{it.item_name || it.name}</option>
                    ))}
                  </select>
                </div>
                <div className="border border-input rounded">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-1/3">Item</TableHead>
                        <TableHead className="w-1/6">Qty</TableHead>
                        <TableHead className="w-1/6">Rate</TableHead>
                        <TableHead className="w-1/6">Amount</TableHead>
                        <TableHead className="w-1/6"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {createItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-sm text-muted-foreground">No items added</TableCell>
                        </TableRow>
                      ) : (
                        createItems.map((row) => {
                          const meta = optionsItems.find((i) => i.name === row.item_code);
                          const amount = (row.qty || 0) * (row.rate || 0);
                          return (
                            <TableRow key={row.item_code}>
                              <TableCell className="text-sm">{meta?.item_name || row.item_code}</TableCell>
                              <TableCell>
                                <input type="number" className="w-20 border border-input rounded px-1 py-0.5 text-sm bg-background text-foreground" value={row.qty} onChange={(e) => {
                                  const v = Number(e.target.value)||0;
                                  setCreateItems((prev) => prev.map((r) => r.item_code === row.item_code ? { ...r, qty: v } : r));
                                }} />
                              </TableCell>
                              <TableCell>
                                <input type="number" className="w-24 border border-input rounded px-1 py-0.5 text-sm bg-background text-foreground" value={row.rate} onChange={(e) => {
                                  const v = Number(e.target.value)||0;
                                  setCreateItems((prev) => prev.map((r) => r.item_code === row.item_code ? { ...r, rate: v } : r));
                                }} />
                              </TableCell>
                              <TableCell className="text-sm">{amount.toFixed(2)}</TableCell>
                              <TableCell>
                                <button className="text-xs text-destructive hover:text-destructive/80" onClick={() => setCreateItems((prev) => prev.filter((r) => r.item_code !== row.item_code))}>Remove</button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-1 text-sm border border-input rounded bg-background text-foreground hover:bg-muted" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90" disabled={createLoading} onClick={async () => {
                try {
                  setCreateLoading(true);
                  if (!createStart || !createFinish) throw new Error('Start and finish are required');
                  if (!createCustomer) throw new Error('Customer is required (select a Service Order)');
                  const techs = createTechnicianIds.map((id) => ({ service_technician: id, full_name: id }));
                  await createAppointment({
                    service_order: createServiceOrder || undefined,
                    customer: createCustomer,
                    scheduled_start_datetime: toFrappeDateTime(createStart),
                    scheduled_finish_datetime: toFrappeDateTime(createFinish),
                    service_technicians: techs,
                    items: createItems,
                    changed_status: null,
                  });
                  toast({ title: 'Appointment created' });
                  setCreateOpen(false);
                  window.location.reload();
                } catch (err) {
                  const msg = (err as Error)?.message || 'Failed to create appointment';
                  toast({ title: 'Error', description: msg, variant: 'destructive' });
                } finally {
                  setCreateLoading(false);
                }
              }}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
