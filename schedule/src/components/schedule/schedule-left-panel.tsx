"use client";

import { useState, useRef, useEffect } from "react";
import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Appointment, AppointmentStatus } from "../../pages/schedule/types";
import { Skeleton } from "../ui/skeleton";
import { AppointmentDetailSheet } from "./appointment-detail-sheet";
import { MassActionsDropdown } from "./mass-actions-dropdown";
import { Filter, CalendarIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { format } from "date-fns";
import { cn } from "../../lib/utils";

const STATUS_OPTIONS: AppointmentStatus[] = [
  "Open",
  "Scheduled",
  "Dispatched",
  "In Progress",
  "Completed",
  "Cancelled"
];

const getStatusColor = (status: AppointmentStatus): string => {
  const colors: Record<AppointmentStatus, string> = {
    Open: "bg-blue-100 text-blue-800 border-blue-300",
    Scheduled: "bg-blue-100 text-blue-800 border-blue-300",
    Dispatched: "bg-orange-100 text-orange-800 border-orange-300",
    "In Progress": "bg-orange-100 text-orange-800 border-orange-300",
    Completed: "bg-green-100 text-green-800 border-green-300",
    Cancelled: "bg-gray-100 text-gray-800 border-gray-300",
  };
  return colors[status] || "bg-gray-100 text-gray-800 border-gray-300";
};

interface ScheduleLeftPanelProps {
  appointments: Appointment[];
  loading: boolean;
  selectedAppointments: string[];
  statusFilter: string;
  appointmentDateRange: { startDate: Date | null; endDate: Date | null };
  onStatusFilterChange: (status: string) => void;
  onDateRangeChange: (range: { startDate: Date | null; endDate: Date | null }) => void;
  onAppointmentSelect: (appointmentId: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onAppointmentClick: (appointment: Appointment) => void;
  onMassActionComplete: () => void;
}

export function ScheduleLeftPanel({
  appointments,
  loading,
  selectedAppointments,
  statusFilter,
  appointmentDateRange,
  onStatusFilterChange,
  onDateRangeChange,
  onAppointmentSelect,
  onSelectAll,
  onAppointmentClick,
  onMassActionComplete,
}: ScheduleLeftPanelProps) {
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [filtersPopoverOpen, setFiltersPopoverOpen] = useState(false);
  const [startDatePickerOpen, setStartDatePickerOpen] = useState(false);
  const [endDatePickerOpen, setEndDatePickerOpen] = useState(false);
  const selectAllCheckboxRef = useRef<HTMLButtonElement>(null);

  const allSelected = appointments.length > 0 && selectedAppointments.length === appointments.length;
  const someSelected = selectedAppointments.length > 0 && selectedAppointments.length < appointments.length;

  // Handle indeterminate visual state - use CSS to show a dash when partially selected
  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      if (someSelected) {
        // Set a custom attribute for styling
        selectAllCheckboxRef.current.setAttribute('data-indeterminate', 'true');
      } else {
        selectAllCheckboxRef.current.removeAttribute('data-indeterminate');
      }
    }
  }, [someSelected, allSelected]);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  const getShortDescription = (appointment: Appointment): string => {
    if (appointment.description) {
      return appointment.description.length > 60
        ? appointment.description.substring(0, 60) + "..."
        : appointment.description;
    }
    if (appointment.service_type) {
      return appointment.service_type;
    }
    return "No description";
  };

  const handleAppointmentClick = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    onAppointmentClick(appointment);
  };

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Service Appointments</h2>
            <Badge variant="secondary">{appointments.length}</Badge>
          </div>

          {/* Filter Section */}
          <div className="flex items-center gap-2 mb-3">
            {/* Filter Menu Button */}
            <Popover open={filtersPopoverOpen} onOpenChange={setFiltersPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  title="More Filters"
                >
                  <Filter className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="start">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Date Range Filter</h4>

                    {/* Start Date */}
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">From Date</label>
                      <Popover open={startDatePickerOpen} onOpenChange={setStartDatePickerOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !appointmentDateRange.startDate && "text-muted-foreground"
                            )}
                            size="sm"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {appointmentDateRange.startDate ? (
                              format(appointmentDateRange.startDate, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={appointmentDateRange.startDate || undefined}
                            onSelect={(date) => {
                              if (date) {
                                onDateRangeChange({
                                  ...appointmentDateRange,
                                  startDate: date,
                                });
                                setStartDatePickerOpen(false);
                              }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* End Date */}
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">To Date</label>
                      <Popover open={endDatePickerOpen} onOpenChange={setEndDatePickerOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !appointmentDateRange.endDate && "text-muted-foreground"
                            )}
                            size="sm"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {appointmentDateRange.endDate ? (
                              format(appointmentDateRange.endDate, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={appointmentDateRange.endDate || undefined}
                            onSelect={(date) => {
                              if (date) {
                                onDateRangeChange({
                                  ...appointmentDateRange,
                                  endDate: date,
                                });
                                setEndDatePickerOpen(false);
                              }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Status Filter - Always Visible */}
            <div className="flex-1">
              <Select value={statusFilter} onValueChange={onStatusFilterChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Mass Actions */}
          {selectedAppointments.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <MassActionsDropdown
                selectedAppointmentIds={selectedAppointments}
                onComplete={onMassActionComplete}
              />
            </div>
          )}
        </div>

        {/* Appointments List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {/* Select All Checkbox */}
            {appointments.length > 0 && (
              <div className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-md">
                <div className="relative">
                  <Checkbox
                    ref={selectAllCheckboxRef}
                    checked={allSelected}
                    onCheckedChange={onSelectAll}
                    className={someSelected ? "data-[indeterminate=true]:bg-primary/50" : ""}
                  />
                  {someSelected && !allSelected && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-2 h-0.5 bg-primary-foreground rounded"></div>
                    </div>
                  )}
                </div>
                <span className="text-sm text-muted-foreground">
                  {selectedAppointments.length > 0
                    ? `${selectedAppointments.length} selected`
                    : "Select all"}
                </span>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="space-y-2 p-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-2 p-3 border rounded-md">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            )}

            {/* Appointments */}
            {!loading && appointments.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                <p>No appointments found</p>
              </div>
            )}

            {!loading &&
              appointments.map((appointment) => {
                const isSelected = selectedAppointments.includes(appointment.name);
                const isCompleted = appointment.status === "Completed";
                return (
                  <div
                    key={appointment.name}
                    className={`
                      group relative p-3 border rounded-md cursor-pointer transition-colors
                      ${isSelected ? "bg-primary/5 border-primary" : "hover:bg-muted/50"}
                      ${isCompleted ? "opacity-80" : ""}
                    `}
                    onClick={() => handleAppointmentClick(appointment)}
                    draggable={!isCompleted}
                    onDragStart={(e) => {
                      if (isCompleted) {
                        e.preventDefault();
                        return;
                      }
                      // Package minimal data for drop target: id, duration, current start
                      const start = appointment.scheduled_start_datetime
                        ? new Date(appointment.scheduled_start_datetime).toISOString()
                        : null;
                      const end = appointment.scheduled_finish_datetime
                        ? new Date(appointment.scheduled_finish_datetime).toISOString()
                        : null;
                      const durationMin = start && end ? Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)) : 60;
                      e.dataTransfer.setData(
                        "application/json",
                        JSON.stringify({
                          type: "appointment",
                          id: appointment.name,
                          durationMinutes: durationMin,
                        })
                      );
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isSelected}
                        disabled={isCompleted}
                        onCheckedChange={(checked) =>
                          onAppointmentSelect(appointment.name, checked as boolean)
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium truncate">
                            {appointment.service_order || appointment.name}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${getStatusColor(appointment.status)}`}
                          >
                            {appointment.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                          {getShortDescription(appointment)}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {appointment.customer && (
                            <span className="truncate">{appointment.customer}</span>
                          )}
                          {appointment.scheduled_start_datetime && (
                            <>
                              <span>•</span>
                              <span>{formatDate(appointment.scheduled_start_datetime)}</span>
                            </>
                          )}
                        </div>
                        {appointment.service_technicians &&
                          appointment.service_technicians.length > 0 && (
                            <div className="mt-2 text-xs text-muted-foreground">
                              <span>
                                {appointment.service_technicians
                                  .map((t) => t.full_name)
                                  .join(", ")}
                              </span>
                            </div>
                          )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </ScrollArea>
      </div>

      {/* Detail Sheet */}
      {selectedAppointment && (
        <AppointmentDetailSheet
          appointment={selectedAppointment}
          open={!!selectedAppointment}
          onOpenChange={(open) => !open && setSelectedAppointment(null)}
        />
      )}
    </>
  );
}
