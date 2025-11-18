"use client";

import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import { CalendarIcon, BarChart3, Map, Calendar as CalendarIcon2, Search, Sun, Moon } from "lucide-react";
import { format, isToday, addMonths, subMonths } from "date-fns";
import { cn } from "../../lib/utils";
import { Appointment } from "../../pages/schedule/types";
import { GanttView } from "./gantt-view";
import { MapsView } from "./maps-view";
import { CalendarView } from "./calendar-view";
import { GridView } from "./grid-view";
import { AppointmentDetailSheet } from "./appointment-detail-sheet";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface ScheduleRightPanelProps {
  appointments: Appointment[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  viewType: "gantt" | "grid" | "maps" | "calendar";
  onViewTypeChange: (view: "gantt" | "grid" | "maps" | "calendar") => void;
  selectedAppointment: Appointment | null;
  onAppointmentSelect: (appointment: Appointment | null) => void;
  onRefresh: () => void;
  statusFilter?: string;
}

export function ScheduleRightPanel({
  appointments,
  selectedDate,
  onDateChange,
  viewType,
  onViewTypeChange,
  selectedAppointment,
  onAppointmentSelect,
  statusFilter,
}: ScheduleRightPanelProps) {
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [technicianSearch, setTechnicianSearch] = useState("");
  const [gridSearch, setGridSearch] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(selectedDate);
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [mapDurationFilter, setMapDurationFilter] = useState<"date" | "today" | "thisWeek" | "thisMonth" | "thisYear">("thisWeek");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
      if (savedTheme) return savedTheme;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  });

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("theme", theme);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };


  const formatDateDisplay = (date: Date): string => {
    if (isToday(date)) {
      return "Today";
    }

    const day = date.getDate();
    const month = format(date, "MMM"); // Nov, Jan, etc.
    const year = date.getFullYear();

    // Add ordinal suffix (st, nd, rd, th)
    const getOrdinalSuffix = (n: number): string => {
      if (n > 3 && n < 21) return "th";
      switch (n % 10) {
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
      }
    };

    return `${day}${getOrdinalSuffix(day)} ${month} ${year}`;
  };

  const handleDateNavigation = (direction: "prev" | "next") => {
    const newDate = new Date(selectedDate);
    if (direction === "prev") {
      newDate.setDate(newDate.getDate() - 1);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    onDateChange(newDate);
  };

  const shouldShowDateControls = viewType !== "maps" || mapDurationFilter === "date";

  return (
    <div className="flex flex-col h-full pr-3 sm:pr-4 lg:pr-6">
      {/* Section 1: View Type Switcher (Top) */}
      <div className="border-b border-border pl-4 pt-4 pb-4 pr-0 -mr-3 sm:-mr-4 lg:-mr-6 bg-gradient-to-b from-primary/60 via-primary/45 to-primary/30">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
            <Button
              variant={viewType === "gantt" ? "default" : "outline"}
              size="sm"
              onClick={() => onViewTypeChange("gantt")}
              className="gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              Gantt
            </Button>
            <Button
              variant={viewType === "maps" ? "default" : "outline"}
              size="sm"
              onClick={() => onViewTypeChange("maps")}
              className="gap-2"
            >
              <Map className="h-4 w-4" />
              Maps
            </Button>
            <Button
              variant={viewType === "calendar" ? "default" : "outline"}
              size="sm"
              onClick={() => onViewTypeChange("calendar")}
              className="gap-2"
            >
              <CalendarIcon2 className="h-4 w-4" />
              Calendar
            </Button>
            <Button
              variant={viewType === "grid" ? "default" : "outline"}
              size="sm"
              onClick={() => onViewTypeChange("grid")}
              className="gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              Grid
            </Button>
          </div>
          <div className="flex basis-full justify-start lg:basis-auto lg:justify-end pr-5">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleTheme}
              className="gap-2"
            >
              {theme === "light" ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Section 2: Date Selection and Options */}
      <div className="border-b border-border p-4 bg-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center lg:gap-4 lg:justify-between">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            {viewType === "maps" && (
              <Select
                value={mapDurationFilter}
                onValueChange={(
                  value:
                    | "date"
                    | "today"
                    | "thisWeek"
                    | "thisMonth"
                    | "thisYear"
                ) => {
                  setMapDurationFilter(value);
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Select Date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Select Date</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="thisWeek">This Week</SelectItem>
                  <SelectItem value="thisMonth">This Month</SelectItem>
                  <SelectItem value="thisYear">This Year</SelectItem>
                </SelectContent>
              </Select>
            )}
            {shouldShowDateControls &&
              (viewType === "calendar" ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCalendarMonth(subMonths(calendarMonth, 1))
                    }
                    className="h-8 w-8 p-0"
                  >
                    ←
                  </Button>
                  <h2 className="text-xl font-semibold min-w-[140px]">
                    {format(calendarMonth, "MMMM yyyy")}
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCalendarMonth(addMonths(calendarMonth, 1))
                    }
                    className="h-8 w-8 p-0"
                  >
                    →
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDateNavigation("prev")}
                  >
                    ←
                  </Button>
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-auto min-w-[140px] justify-start text-left font-normal px-3",
                          !selectedDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDate ? (
                          <span>{formatDateDisplay(selectedDate)}</span>
                        ) : (
                          <span>Pick a date</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => {
                          if (date) {
                            onDateChange(date);
                            setDatePickerOpen(false);
                          }
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDateNavigation("next")}
                  >
                    →
                  </Button>
                </>
              ))}
          </div>

          {/* Right side controls */}
          <div className="flex flex-1 flex-wrap items-center gap-3 min-w-0 lg:justify-end">
            {/* Map Search - Only show in maps view */}
            {viewType === "maps" && (
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search appointments or addresses..."
                  value={mapSearchQuery}
                  onChange={(e) => setMapSearchQuery(e.target.value)}
                  className="pl-9 w-full"
                />
              </div>
            )}
            {/* Grid appointment search (includes technicians) */}
            {viewType === "grid" ? (
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search appointments, customers, or technicians..."
                  value={gridSearch}
                  onChange={(e) => setGridSearch(e.target.value)}
                  className="pl-9 w-full"
                />
              </div>
            ) : (
              /* Technician search for gantt view */
              viewType !== "calendar" &&
              viewType !== "maps" && (
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search technicians..."
                    value={technicianSearch}
                    onChange={(e) => setTechnicianSearch(e.target.value)}
                    className="pl-9 w-full"
                  />
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Section 3: View Content */}
      <div className="flex-1 overflow-hidden">
        {viewType === "gantt" && (
          <GanttView
            appointments={appointments}
            selectedDate={selectedDate}
            onAppointmentClick={onAppointmentSelect}
            technicianSearch={technicianSearch}
          />
        )}
        {viewType === "maps" && (
          <MapsView
            appointments={appointments}
            selectedDate={selectedDate}
            onAppointmentClick={onAppointmentSelect}
            statusFilter={statusFilter}
            technicianSearch={technicianSearch}
            searchQuery={mapSearchQuery}
            durationFilter={mapDurationFilter}
          />
        )}
        {viewType === "grid" && (
          <GridView
            appointments={appointments}
            selectedDate={selectedDate}
            onAppointmentClick={onAppointmentSelect}
            searchQuery={gridSearch}
          />
        )}
        {viewType === "calendar" && (
          <CalendarView
            appointments={appointments}
            selectedDate={selectedDate}
            onDateChange={onDateChange}
            onAppointmentClick={onAppointmentSelect}
            currentMonth={calendarMonth}
            onMonthChange={setCalendarMonth}
          />
        )}
      </div>

      {/* Detail Sheet */}
      {selectedAppointment && (
        <AppointmentDetailSheet
          appointment={selectedAppointment}
          open={!!selectedAppointment}
          onOpenChange={(open) => !open && onAppointmentSelect(null)}
        />
      )}
    </div>
  );
}
