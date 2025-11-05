"use client";

import { useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths } from "date-fns";
import { Appointment } from "../../pages/schedule/types";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";

interface CalendarViewProps {
  appointments: Appointment[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onAppointmentClick?: (appointment: Appointment) => void;
}

const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    Open: "bg-blue-100 text-blue-800 border-blue-300",
    Scheduled: "bg-blue-100 text-blue-800 border-blue-300",
    Dispatched: "bg-orange-100 text-orange-800 border-orange-300",
    "In Progress": "bg-orange-100 text-orange-800 border-orange-300",
    Completed: "bg-green-100 text-green-800 border-green-300",
    Cancelled: "bg-gray-100 text-gray-800 border-gray-300",
  };
  return colors[status] || "bg-gray-100 text-gray-800 border-gray-300";
};

const getStatusDotColor = (status: string): string => {
  const colors: Record<string, string> = {
    Open: "bg-blue-500",
    Scheduled: "bg-blue-500",
    Dispatched: "bg-orange-500",
    "In Progress": "bg-orange-500",
    Completed: "bg-green-500",
    Cancelled: "bg-gray-400",
  };
  return colors[status] || "bg-gray-400";
};

export function CalendarView({
  appointments,
  selectedDate,
  onDateChange,
  onAppointmentClick,
  currentMonth,
  onMonthChange,
}: CalendarViewProps & {
  currentMonth: Date;
  onMonthChange: (month: Date) => void;
}) {

  // Group appointments by posting_date
  const appointmentsByDate = useMemo(() => {
    const grouped: Record<string, Appointment[]> = {};
    appointments.forEach((apt) => {
      if (apt.posting_date) {
        const dateKey = format(new Date(apt.posting_date), "yyyy-MM-dd");
        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(apt);
      }
    });
    return grouped;
  }, [appointments]);

  // Get appointments for selected date
  const selectedDateAppointments = useMemo(() => {
    const dateKey = format(selectedDate, "yyyy-MM-dd");
    return appointmentsByDate[dateKey] || [];
  }, [selectedDate, appointmentsByDate]);

  // Get calendar days
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get first day of month to pad calendar
  const firstDayOfWeek = monthStart.getDay();
  const paddingDays = Array.from({ length: firstDayOfWeek }, (_, i) => i);

  const handlePreviousMonth = () => {
    onMonthChange(subMonths(currentMonth, 1));
  };

  const handleNextMonth = () => {
    onMonthChange(addMonths(currentMonth, 1));
  };

  const handleDateClick = (date: Date) => {
    onDateChange(date);
  };

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border border-border shadow-sm p-4">
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="text-center text-sm font-medium text-muted-foreground py-2"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-1">
              {/* Padding days */}
              {paddingDays.map((day) => (
                <div key={`pad-${day}`} className="aspect-square" />
              ))}

              {/* Calendar days */}
              {calendarDays.map((day) => {
                const dateKey = format(day, "yyyy-MM-dd");
                const dayAppointments = appointmentsByDate[dateKey] || [];
                const isSelected = isSameDay(day, selectedDate);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isTodayDate = isToday(day);

                // Get status counts for this day
                const statusCounts: Record<string, number> = {};
                dayAppointments.forEach((apt) => {
                  statusCounts[apt.status] = (statusCounts[apt.status] || 0) + 1;
                });

                // Get primary status (most appointments or priority status)
                const primaryStatus = dayAppointments.length > 0
                  ? dayAppointments[0].status
                  : null;

                return (
                  <button
                    key={dateKey}
                    onClick={() => handleDateClick(day)}
                    className={cn(
                      "aspect-square relative rounded-md border transition-all hover:bg-accent/50",
                      isSelected && "bg-primary/10 border-primary ring-2 ring-primary/20",
                      !isSelected && "border-border hover:border-primary/50",
                      !isCurrentMonth && "opacity-40",
                      isTodayDate && !isSelected && "bg-accent/30 border-primary/30"
                    )}
                  >
                    <div className="flex flex-col h-full p-1">
                      <span
                        className={cn(
                          "text-sm font-medium text-right",
                          isSelected && "text-primary",
                          isTodayDate && !isSelected && "text-primary",
                          !isTodayDate && !isSelected && "text-foreground"
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      {dayAppointments.length > 0 && (
                        <div className="flex flex-col gap-0.5 mt-auto">
                          {/* Status dots */}
                          <div className="flex flex-wrap gap-0.5 justify-center">
                            {Object.entries(statusCounts).slice(0, 3).map(([status, count]) => (
                              <div
                                key={status}
                                className={cn(
                                  "w-1.5 h-1.5 rounded-full",
                                  getStatusDotColor(status)
                                )}
                                title={`${count} ${status}`}
                              />
                            ))}
                            {Object.keys(statusCounts).length > 3 && (
                              <div className="w-1.5 h-1.5 rounded-full bg-gray-400" title="More..." />
                            )}
                          </div>
                          {/* Appointment count */}
                          <span className="text-[10px] text-muted-foreground text-center mt-0.5">
                            {dayAppointments.length} {dayAppointments.length === 1 ? "apt" : "apts"}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Appointments List for Selected Date */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-border shadow-sm p-4 h-full flex flex-col">
            <h3 className="text-lg font-semibold mb-4">
              {format(selectedDate, "EEEE, MMMM d")}
            </h3>
            <div className="flex-1 overflow-y-auto">
              {selectedDateAppointments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <p className="text-sm">No appointments scheduled</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedDateAppointments.map((appointment) => {
                    const startTime = appointment.scheduled_start_datetime
                      ? format(new Date(appointment.scheduled_start_datetime), "HH:mm")
                      : "";
                    const endTime = appointment.scheduled_finish_datetime
                      ? format(new Date(appointment.scheduled_finish_datetime), "HH:mm")
                      : "";

                    return (
                      <div
                        key={appointment.name}
                        onClick={() => onAppointmentClick?.(appointment)}
                        className="p-3 border rounded-md cursor-pointer hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {appointment.service_order || appointment.service_type || appointment.name}
                            </div>
                            {appointment.customer && (
                              <div className="text-xs text-muted-foreground truncate mt-0.5">
                                {appointment.customer}
                              </div>
                            )}
                          </div>
                          <Badge
                            variant="outline"
                            className={cn("text-xs shrink-0", getStatusColor(appointment.status))}
                          >
                            {appointment.status}
                          </Badge>
                        </div>
                        {(startTime || endTime) && (
                          <div className="text-xs text-muted-foreground">
                            {startTime} - {endTime}
                          </div>
                        )}
                        {appointment.service_technicians && appointment.service_technicians.length > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {appointment.service_technicians
                              .map((t) => t.full_name)
                              .join(", ")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
