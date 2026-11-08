"use client";

import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { CalendarIcon, Map, Sun, Moon, Search, Columns3 } from "lucide-react";
import { cn } from "../../lib/utils";
import { Appointment } from "../../pages/schedule/types";
import { MapsView } from "./maps-view";
import { DispatchBoard } from "./dispatch-board";
import { AppointmentDetailSheet } from "./appointment-detail-sheet";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { dateToKey, formatDayHeading, getCompanyTimeZone } from "../../lib/company-time";

interface ScheduleRightPanelProps {
  appointments: Appointment[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  viewType: "board" | "maps";
  onViewTypeChange: (view: "board" | "maps") => void;
  selectedAppointment: Appointment | null;
  onAppointmentSelect: (appointment: Appointment | null) => void;
  onRefresh: () => void;
  statusFilter?: string;
}

export function ScheduleRightPanel({
  selectedDate,
  onDateChange,
  viewType,
  onViewTypeChange,
  selectedAppointment,
  onAppointmentSelect,
  onRefresh,
  statusFilter,
}: ScheduleRightPanelProps) {
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [mapDurationFilter, setMapDurationFilter] = useState<
    "date" | "today" | "thisWeek" | "thisMonth" | "thisYear"
  >("today");
  const [refreshToken, setRefreshToken] = useState(0);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
      if (savedTheme) return savedTheme;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    if (typeof window !== "undefined") localStorage.setItem("theme", theme);
  }, [theme]);

  const bump = () => {
    setRefreshToken((value) => value + 1);
    onRefresh();
  };

  return (
    <div className="flex h-full flex-col pr-3 sm:pr-4 lg:pr-6">
      <div className="border-b border-border bg-gradient-to-b from-primary/60 via-primary/45 to-primary/30 py-3 pl-4 pr-0 dark:from-primary/25 dark:via-primary/15 dark:to-primary/10">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={viewType === "board" ? "default" : "outline"}
            size="sm"
            onClick={() => onViewTypeChange("board")}
            className="gap-2"
          >
            <Columns3 className="h-4 w-4" />
            Board
          </Button>
          <Button
            variant={viewType === "maps" ? "default" : "outline"}
            size="sm"
            onClick={() => onViewTypeChange("maps")}
            className="gap-2"
          >
            <Map className="h-4 w-4" />
            Map
          </Button>
          <div className="ml-auto pr-5">
            <Button variant="outline" size="sm" onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}>
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {viewType === "maps" && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card p-4">
          <Select
            value={mapDurationFilter}
            onValueChange={(value: "date" | "today" | "thisWeek" | "thisMonth" | "thisYear") =>
              setMapDurationFilter(value)
            }
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
          {mapDurationFilter === "date" && (
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start px-3 text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formatDayHeading(dateToKey(selectedDate), getCompanyTimeZone())}
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
          )}
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search appointments or addresses..."
              value={mapSearchQuery}
              onChange={(event) => setMapSearchQuery(event.target.value)}
              className="w-full pl-9"
            />
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {viewType === "board" && (
          <DispatchBoard
            onAppointmentClick={onAppointmentSelect}
            refreshToken={refreshToken}
          />
        )}
        {viewType === "maps" && (
          <MapsView
            selectedDate={selectedDate}
            onAppointmentClick={onAppointmentSelect}
            statusFilter={statusFilter}
            searchQuery={mapSearchQuery}
            durationFilter={mapDurationFilter}
            refreshToken={refreshToken}
          />
        )}
      </div>

      {selectedAppointment && (
        <AppointmentDetailSheet
          appointment={selectedAppointment}
          open={!!selectedAppointment}
          onOpenChange={(open) => !open && onAppointmentSelect(null)}
          onUpdated={() => {
            onAppointmentSelect(null);
            bump();
          }}
        />
      )}
    </div>
  );
}
