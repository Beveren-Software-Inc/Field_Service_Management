"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { Badge } from "../ui/badge";
import { Appointment } from "../../pages/schedule/types";
import { Separator } from "../ui/separator";
import { Button } from "../ui/button";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { fetchTechnicians, reallocateAppointment, fetchPaidInvoicesForAppointment, updateAppointmentStatus, InvoiceSummary } from "../../hooks/use-appointments";
import { useToast } from "../../hooks/use-toast";
import { formatWall } from "../../lib/company-time";

interface AppointmentDetailSheetProps {
  appointment: Appointment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}

const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    Open: "bg-blue-100 text-blue-800 border-blue-300",
    Scheduled: "bg-blue-100 text-blue-800 border-blue-300",
    Unassigned: "bg-slate-100 text-slate-800 border-slate-300",
    Dispatched: "bg-violet-100 text-violet-800 border-violet-300",
    "En route": "bg-amber-100 text-amber-800 border-amber-300",
    "On site": "bg-orange-100 text-orange-800 border-orange-300",
    Paused: "bg-zinc-100 text-zinc-800 border-zinc-300",
    "In Progress": "bg-orange-100 text-orange-800 border-orange-300",
    Completed: "bg-green-100 text-green-800 border-green-300",
    Cancelled: "bg-gray-100 text-gray-800 border-gray-300",
  };
  return colors[status] || "bg-gray-100 text-gray-800 border-gray-300";
};

// Helper to convert ISO datetime to datetime-local format (YYYY-MM-DDTHH:mm)
const isoToDateTimeLocal = (value: string): string => {
  if (!value) return "";
  return value.trim().replace(" ", "T").slice(0, 16);
};

const formatDateOnly = (value: string): string => {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
};

export function AppointmentDetailSheet({
  appointment,
  open,
  onOpenChange,
  onUpdated,
}: AppointmentDetailSheetProps) {
  const { toast } = useToast();
  const [reallocateOpen, setReallocateOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [technicians, setTechnicians] = useState<Array<{ name: string; full_name: string }>>([]);
  const [selectedTechIds, setSelectedTechIds] = useState<string[]>(
    (appointment.service_technicians || []).map((t) => t.service_technician)
  );
  const [startValue, setStartValue] = useState<string>(isoToDateTimeLocal(appointment.scheduled_start_datetime));
  const [finishValue, setFinishValue] = useState<string>(isoToDateTimeLocal(appointment.scheduled_finish_datetime));
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);

  useEffect(() => {
    // refresh values if appointment changes
    setSelectedTechIds((appointment.service_technicians || []).map((t) => t.service_technician));
    setStartValue(isoToDateTimeLocal(appointment.scheduled_start_datetime));
    setFinishValue(isoToDateTimeLocal(appointment.scheduled_finish_datetime));
    // load invoices
    fetchPaidInvoicesForAppointment(appointment.name, appointment.service_order)
      .then(setInvoices)
      .catch(() => setInvoices([]));
  }, [appointment]);

  useEffect(() => {
    let mounted = true;
    fetchTechnicians()
      .then((list) => {
        if (!mounted) return;
        setTechnicians(list.map((t: { name: string; full_name: string }) => ({ name: t.name, full_name: t.full_name })));
      })
      .catch(() => {
        // ignore; toast on open if necessary
      });
    return () => {
      mounted = false;
    };
  }, []);

  const selectedTechnicians = useMemo(() => {
    return technicians.filter((t) => selectedTechIds.includes(t.name));
  }, [technicians, selectedTechIds]);

  const onToggleTech = (techId: string, checked: boolean) => {
    setSelectedTechIds((prev) => {
      if (checked) return Array.from(new Set([...prev, techId]));
      return prev.filter((id) => id !== techId);
    });
  };

  const handleReallocate = async () => {
    try {
      if (selectedTechIds.length === 0) {
        toast({ title: "Select at least one technician", variant: "destructive" });
        return;
      }
      setLoading(true);
      const techPayload = selectedTechnicians.map((t) => ({ service_technician: t.name, full_name: t.full_name }));

      // Convert datetime-local (YYYY-MM-DDTHH:mm) to Frappe datetime string (YYYY-MM-DD HH:mm:ss)
      const toFrappeDateTime = (localDateTime: string) => {
        if (!localDateTime) return "";
        // Expecting 'YYYY-MM-DDTHH:mm' from input; split and rebuild
        const [datePart, timePart] = localDateTime.split("T");
        if (!datePart || !timePart) return "";
        const [hh, mm] = timePart.split(":");
        const safeH = hh?.padStart(2, "0") || "00";
        const safeM = mm?.padStart(2, "0") || "00";
        return `${datePart} ${safeH}:${safeM}:00`;
      };

      await reallocateAppointment({
        name: appointment.name,
        scheduled_start_datetime: toFrappeDateTime(startValue),
        scheduled_finish_datetime: toFrappeDateTime(finishValue),
        service_technicians: techPayload,
        reschedule: true,
      });
      toast({ title: "Appointment re-allocated", description: "Technicians and schedule updated." });
      setReallocateOpen(false);
      if (onUpdated) onUpdated();
      else window.location.reload();
    } catch (e) {
      const errorMessage = (e as Error).message;
      const isOverlapError = errorMessage.includes("overlap");
      toast({
        title: isOverlapError ? "Schedule Conflict" : "Failed to re-allocate",
        description: errorMessage,
        variant: "destructive",
        duration: isOverlapError ? 6000 : 5000, // Show overlap errors longer
      });
    } finally {
      setLoading(false);
    }
  };
  const [statusLoading, setStatusLoading] = useState(false);
  const formatDateTime = (dateString: string) => {
    try {
      return formatWall(dateString);
    } catch {
      return dateString;
    }
  };
  const changeStatus = async (status: "Dispatched" | "Cancelled") => {
    try {
      setStatusLoading(true);
      await updateAppointmentStatus(appointment.name, status);
      toast({
        title: status === "Dispatched" ? "Visit dispatched" : "Visit cancelled",
      });
      if (onUpdated) onUpdated();
      else window.location.reload();
    } catch (error) {
      toast({
        title: status === "Dispatched" ? "Could not dispatch" : "Could not cancel",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setStatusLoading(false);
    }
  };
  const canDispatch = appointment.status === "Scheduled";
  const canCancel = appointment.status !== "Completed" && appointment.status !== "Cancelled";

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle>Appointment Details</SheetTitle>
            <Badge
              variant="outline"
              className={getStatusColor(appointment.status)}
            >
              {appointment.status}
            </Badge>
          </div>
          <SheetDescription>
            {appointment.service_order || appointment.name}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Basic Information */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Basic Information</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Appointment ID:</span>
                <span className="font-medium">{appointment.name}</span>
              </div>
              {appointment.service_order && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service Order:</span>
                  <span className="font-medium">{appointment.service_order}</span>
                </div>
              )}
              {appointment.customer && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-medium">{appointment.customer}</span>
                </div>
              )}
              {appointment.service_type && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service Type:</span>
                  <span className="font-medium">{appointment.service_type}</span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Scheduling Information */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Scheduling</h3>
            <div className="space-y-2 text-sm">
              {appointment.scheduled_start_datetime && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scheduled Start:</span>
                  <span className="font-medium">
                    {formatDateTime(appointment.scheduled_start_datetime)}
                  </span>
                </div>
              )}
              {appointment.scheduled_finish_datetime && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scheduled Finish:</span>
                  <span className="font-medium">
                    {formatDateTime(appointment.scheduled_finish_datetime)}
                  </span>
                </div>
              )}
              {appointment.arrival_window_start && appointment.arrival_window_end && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Arrival Window:</span>
                  <span className="font-medium text-right">
                    {formatDateTime(appointment.arrival_window_start)} – {formatDateTime(appointment.arrival_window_end)}
                  </span>
                </div>
              )}
              {appointment.service_area && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service Area:</span>
                  <span className="font-medium">{appointment.service_area}</span>
                </div>
              )}
              {appointment.address_display && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Address:</span>
                  <span className="font-medium text-right">{appointment.address_display}</span>
                </div>
              )}
              {appointment.posting_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Posting Date:</span>
                  <span className="font-medium">
                    {formatDateOnly(appointment.posting_date)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Technicians */}
          {appointment.service_technicians && appointment.service_technicians.length > 0 && (
            <>
              <div>
                <h3 className="text-sm font-semibold mb-3">Assigned Technicians</h3>
                <div className="space-y-2">
                  {appointment.service_technicians.map((tech, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 bg-muted rounded-md"
                    >
                      <span className="text-sm font-medium">{tech.full_name}</span>
                      {tech.service_technician && (
                        <span className="text-xs text-muted-foreground">
                          ({tech.service_technician})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Description */}
          {appointment.description && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Description</h3>
              <p className="text-sm text-muted-foreground">{appointment.description}</p>
            </div>
          )}

        {/* Billing */}
        {invoices && invoices.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3">Billing</h3>
            <div className="space-y-2 text-sm">
              {invoices.map((inv) => (
                <div key={inv.name} className="flex justify-between items-center p-2 bg-muted rounded">
                  <span className="font-medium">{inv.name}</span>
                  <Badge variant={inv.status === "Paid" ? "outline" : "secondary"}>{inv.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>

        {appointment.status !== "Completed" && appointment.status !== "Cancelled" && (
          <div className="mt-6 space-y-2">
            <div className="flex gap-2">
              {canDispatch && (
                <Button className="flex-1" onClick={() => changeStatus("Dispatched")} disabled={statusLoading}>
                  Dispatch
                </Button>
              )}
              {canCancel && (
                <Button
                  className="flex-1"
                  variant="outline"
                  onClick={() => changeStatus("Cancelled")}
                  disabled={statusLoading}
                >
                  Cancel visit
                </Button>
              )}
            </div>
            <Button className="w-full" variant="secondary" onClick={() => setReallocateOpen(true)}>
              Re-allocate
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>

    <Dialog open={reallocateOpen} onOpenChange={setReallocateOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Re-allocate Appointment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="scheduled_start">Scheduled Start</Label>
              <Input
                id="scheduled_start"
                type="datetime-local"
                value={startValue || ""}
                onChange={(e) => setStartValue(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="scheduled_finish">Scheduled Finish</Label>
              <Input
                id="scheduled_finish"
                type="datetime-local"
                value={finishValue || ""}
                onChange={(e) => setFinishValue(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Select Technicians</h4>
            <div className="max-h-64 overflow-auto rounded-md border p-2">
              {technicians.length === 0 ? (
                <div className="text-sm text-muted-foreground">Loading technicians...</div>
              ) : (
                <div className="space-y-1">
                  {technicians.map((t) => {
                    const checked = selectedTechIds.includes(t.name);
                    return (
                      <label key={t.name} className="flex items-center gap-3 p-2 hover:bg-muted rounded">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(val) => onToggleTech(t.name, Boolean(val))}
                        />
                        <span className="text-sm">{t.full_name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{t.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setReallocateOpen(false)} disabled={loading}>Cancel</Button>
          <Button onClick={handleReallocate} disabled={loading}>{loading ? "Saving..." : "Complete"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
