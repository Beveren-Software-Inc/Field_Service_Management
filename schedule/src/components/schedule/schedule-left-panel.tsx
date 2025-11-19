"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  Appointment,
  AppointmentStatus,
  ServiceOrderDetail,
  ServiceOrderSummary,
} from "../../pages/schedule/types";
import { Skeleton } from "../ui/skeleton";
import { ServiceOrderDetailSheet } from "./service-order-detail-sheet";
import { MassActionsDropdown } from "./mass-actions-dropdown";
import { Filter, CalendarIcon, XCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { format } from "date-fns";
import { cn } from "../../lib/utils";
import { fetchServiceOrderDetail } from "../../hooks/use-appointments";
import { Input } from "../ui/input";

const STATUS_OPTIONS: AppointmentStatus[] = [
  "Open",
  "Quotation",
  "Converted",
  "Due Soon",
  "Overdue",
  "On Hold",
  "Closed",
];

const getStatusColor = (status: AppointmentStatus): string => {
  const colors: Record<AppointmentStatus, string> = {
    Open: "bg-blue-100 text-blue-800 border-blue-300",
    Quotation: "bg-indigo-100 text-indigo-800 border-indigo-300",
    Converted: "bg-emerald-100 text-emerald-800 border-emerald-300",
    "Due Soon": "bg-amber-100 text-amber-800 border-amber-300",
    Overdue: "bg-red-100 text-red-800 border-red-300",
    "On Hold": "bg-gray-200 text-gray-800 border-gray-300",
    Closed: "bg-slate-100 text-slate-800 border-slate-300",
    Scheduled: "bg-blue-100 text-blue-800 border-blue-300",
    Dispatched: "bg-purple-100 text-purple-800 border-purple-300",
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
  serviceOrderStatusFilter: string;
  appointmentDateRange: { startDate: Date | null; endDate: Date | null };
  onStatusFilterChange: (status: string) => void;
  onServiceOrderFilterChange: (status: string) => void;
  onDateRangeChange: (range: { startDate: Date | null; endDate: Date | null }) => void;
  onAppointmentSelect: (appointmentId: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onAppointmentClick: (appointment: Appointment) => void;
  onMassActionComplete: () => void;
  mode: "orders" | "appointments";
  onModeToggle: () => void;
  serviceOrders: ServiceOrderSummary[];
  serviceOrdersLoading: boolean;
}

export function ScheduleLeftPanel({
  appointments,
  loading,
  selectedAppointments,
  statusFilter,
  serviceOrderStatusFilter,
  appointmentDateRange,
  onStatusFilterChange,
  onServiceOrderFilterChange,
  onDateRangeChange,
  onAppointmentSelect,
  onSelectAll,
  onAppointmentClick,
  onMassActionComplete,
  mode,
  onModeToggle,
  serviceOrders,
  serviceOrdersLoading,
}: ScheduleLeftPanelProps) {
  const [selectedServiceOrder, setSelectedServiceOrder] = useState<ServiceOrderDetail | null>(null);
  const [serviceOrderSheetOpen, setServiceOrderSheetOpen] = useState(false);
  const [serviceOrderDetailLoading, setServiceOrderDetailLoading] = useState(false);
  const [filtersPopoverOpen, setFiltersPopoverOpen] = useState(false);
  const [startDatePickerOpen, setStartDatePickerOpen] = useState(false);
  const [endDatePickerOpen, setEndDatePickerOpen] = useState(false);
  const [appointmentSearchTerm, setAppointmentSearchTerm] = useState("");
  const [serviceOrderSearchTerm, setServiceOrderSearchTerm] = useState("");
  const [serviceOrderDateRange, setServiceOrderDateRange] = useState<{
    startDate: Date | null;
    endDate: Date | null;
  }>({ startDate: null, endDate: null });
  const [serviceOrderStartPickerOpen, setServiceOrderStartPickerOpen] = useState(false);
  const [serviceOrderEndPickerOpen, setServiceOrderEndPickerOpen] = useState(false);
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

  const formatOrderDate = (dateString?: string) => {
    if (!dateString) return null;
    try {
      return format(new Date(dateString), "MMM d, yyyy");
    } catch {
      return dateString;
    }
  };

const getOrderStatusColor = (status?: string) => {
  if (!status) return "border-border text-muted-foreground";
  const normalized = status.toLowerCase();
  if (normalized === "open") return "bg-cyan-50 text-cyan-700 border-cyan-200";
  if (normalized === "scheduled") return "bg-blue-50 text-blue-700 border-blue-200";
  if (normalized === "dispatched") return "bg-purple-50 text-purple-700 border-purple-200";
  if (normalized === "in progress") return "bg-orange-50 text-orange-700 border-orange-200";
  if (normalized === "review") return "bg-pink-50 text-pink-700 border-pink-200";
  if (normalized === "completed") return "bg-green-50 text-green-700 border-green-200";
  if (normalized === "cancelled") return "bg-gray-100 text-gray-700 border-gray-200";
  return "border-border text-muted-foreground";
};

  const getOrderPriorityColor = (priority?: string) => {
    if (!priority) return "border-border text-muted-foreground";
    const normalized = priority.toLowerCase();
    if (normalized === "high") {
      return "bg-red-50 text-red-700 border-red-200";
    }
    if (normalized === "medium") {
      return "bg-amber-50 text-amber-700 border-amber-200";
    }
    if (normalized === "low") {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }
    return "border-border text-muted-foreground";
  };

  const orderStatusOptions = Array.from(
    new Set(
      serviceOrders
        .map((order) => (order.status || "").trim())
        .filter((status) => !!status)
    )
  ).sort();

  const filteredServiceOrders = useMemo(() => {
    const statusFiltered = serviceOrders.filter((order) => {
      if (serviceOrderStatusFilter === "all") return true;
      const status = (order.status || "").toLowerCase();
      return status === serviceOrderStatusFilter.toLowerCase();
    });

    const normalizedStart = serviceOrderDateRange.startDate
      ? new Date(serviceOrderDateRange.startDate)
      : null;
    if (normalizedStart) normalizedStart.setHours(0, 0, 0, 0);
    const normalizedEnd = serviceOrderDateRange.endDate
      ? new Date(serviceOrderDateRange.endDate)
      : null;
    if (normalizedEnd) normalizedEnd.setHours(23, 59, 59, 999);

    const dateFiltered = statusFiltered.filter((order) => {
      if (!normalizedStart && !normalizedEnd) return true;
      if (!order.posting_date) return false;
      const postingDate = new Date(order.posting_date);
      if (normalizedStart && postingDate < normalizedStart) return false;
      if (normalizedEnd && postingDate > normalizedEnd) return false;
      return true;
    });

    if (!serviceOrderSearchTerm.trim()) {
      return dateFiltered;
    }

    const term = serviceOrderSearchTerm.toLowerCase();
    return dateFiltered.filter((order) => {
      const nameMatch = order.name?.toLowerCase().includes(term);
      const customerMatch = order.customer?.toLowerCase().includes(term);
      return nameMatch || customerMatch;
    });
  }, [
    serviceOrders,
    serviceOrderStatusFilter,
    serviceOrderSearchTerm,
    serviceOrderDateRange.startDate,
    serviceOrderDateRange.endDate,
  ]);

  const filteredAppointments = useMemo(() => {
    if (!appointmentSearchTerm.trim()) {
      return appointments;
    }
    const term = appointmentSearchTerm.toLowerCase();
    return appointments.filter((appointment) => {
      const idMatch = appointment.name?.toLowerCase().includes(term);
      const customerMatch = appointment.customer?.toLowerCase().includes(term);
      return idMatch || customerMatch;
    });
  }, [appointments, appointmentSearchTerm]);

  const isOrderMode = mode === "orders";

  useEffect(() => {
    setFiltersPopoverOpen(false);
    setStartDatePickerOpen(false);
    setEndDatePickerOpen(false);
    setServiceOrderStartPickerOpen(false);
    setServiceOrderEndPickerOpen(false);
  }, [isOrderMode]);

  const handleServiceOrderClick = async (orderName: string) => {
    try {
      setServiceOrderDetailLoading(true);
      setServiceOrderSheetOpen(true);
      const detail = await fetchServiceOrderDetail(orderName);
      setSelectedServiceOrder(detail);
    } catch (error) {
      console.error("Failed to load service order detail", error);
    } finally {
      setServiceOrderDetailLoading(false);
    }
  };

  const renderServiceOrders = () => {
    if (serviceOrdersLoading) {
      return (
        <div className="space-y-2 p-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2 p-3 border rounded-md">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      );
    }

    if (!serviceOrdersLoading && filteredServiceOrders.length === 0) {
      return (
        <div className="p-8 text-center text-muted-foreground">
          <p>
            {serviceOrderSearchTerm.trim() ||
            serviceOrderDateRange.startDate ||
            serviceOrderDateRange.endDate
              ? "No service orders match your filters"
              : "No service orders found"}
          </p>
        </div>
      );
    }

    return (
      <div className="p-2 space-y-2">
        {filteredServiceOrders.map((order) => (
          <div
            key={order.name}
            className="p-3 border rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={() => handleServiceOrderClick(order.name)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{order.name}</p>
                {order.customer && (
                  <p className="text-xs text-muted-foreground truncate">{order.customer}</p>
                )}
              </div>
              {order.status && (
                <Badge
                  variant="outline"
                  className={`text-xs border ${getOrderStatusColor(order.status)}`}
                >
                  {order.status}
                </Badge>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {order.priority && (
                <span
                  className={`px-2 py-0.5 rounded-full border ${getOrderPriorityColor(
                    order.priority
                  )}`}
                >
                  Priority: {order.priority}
                </span>
              )}
              {order.type && (
                <span className="px-2 py-0.5 rounded-full border border-border">
                  {order.type}
                </span>
              )}
              {formatOrderDate(order.posting_date) && (
                <span>Created {formatOrderDate(order.posting_date)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-border space-y-3">
          <div>

            <div className="flex items-center justify-between mt-1">
              <h2 className="text-lg font-semibold">
                {isOrderMode ? "Service Orders" : "Service Appointments"}
              </h2>
              <Badge variant="secondary">
                {isOrderMode ? filteredServiceOrders.length : filteredAppointments.length}
              </Badge>
            </div>
          </div>
          <Button
            variant={isOrderMode ? "outline" : "default"}
            size="sm"
            className={cn(
              "w-full justify-center text-sm font-medium transition-colors",
              isOrderMode
                ? "border-primary text-primary hover:bg-primary/5 hover:text-primary"
                : "bg-primary text-primary-foreground"
            )}
            onClick={onModeToggle}
          >
            {isOrderMode ? "View Service Appointments" : "View Service Orders"}
          </Button>

          <div className="flex items-center gap-2 mb-3">
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
                {isOrderMode ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Search Orders</h4>
                      <Input
                        placeholder="Search by ID or customer"
                        value={serviceOrderSearchTerm}
                        onChange={(event) => setServiceOrderSearchTerm(event.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">Date Range Filter</h4>
                        {(serviceOrderDateRange.startDate || serviceOrderDateRange.endDate) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            title="Clear date range"
                            onClick={() =>
                              setServiceOrderDateRange({ startDate: null, endDate: null })
                            }
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">From Date</label>
                        <Popover
                          open={serviceOrderStartPickerOpen}
                          onOpenChange={setServiceOrderStartPickerOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !serviceOrderDateRange.startDate && "text-muted-foreground"
                              )}
                              size="sm"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {serviceOrderDateRange.startDate ? (
                                format(serviceOrderDateRange.startDate, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={serviceOrderDateRange.startDate || undefined}
                              onSelect={(date) => {
                                setServiceOrderDateRange((prev) => ({
                                  ...prev,
                                  startDate: date || null,
                                }));
                                setServiceOrderStartPickerOpen(false);
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">To Date</label>
                        <Popover
                          open={serviceOrderEndPickerOpen}
                          onOpenChange={setServiceOrderEndPickerOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !serviceOrderDateRange.endDate && "text-muted-foreground"
                              )}
                              size="sm"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {serviceOrderDateRange.endDate ? (
                                format(serviceOrderDateRange.endDate, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={serviceOrderDateRange.endDate || undefined}
                              onSelect={(date) => {
                                setServiceOrderDateRange((prev) => ({
                                  ...prev,
                                  endDate: date || null,
                                }));
                                setServiceOrderEndPickerOpen(false);
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Search Appointments</h4>
                      <Input
                        placeholder="Search by ID or customer"
                        value={appointmentSearchTerm}
                        onChange={(event) => setAppointmentSearchTerm(event.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">Date Range Filter</h4>
                        {(appointmentDateRange.startDate || appointmentDateRange.endDate) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            title="Clear date range"
                            onClick={() => onDateRangeChange({ startDate: null, endDate: null })}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

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
                )}
              </PopoverContent>
            </Popover>

            <div className="flex-1">
              {isOrderMode ? (
                <Select
                  value={serviceOrderStatusFilter}
                  onValueChange={onServiceOrderFilterChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {orderStatusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
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
              )}
            </div>
          </div>

          {!isOrderMode && selectedAppointments.length > 0 && (
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
          {isOrderMode ? (
            renderServiceOrders()
          ) : (
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
              {!loading && filteredAppointments.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  <p>
                    {appointmentSearchTerm.trim()
                      ? "No appointments match your search"
                      : "No appointments found"}
                  </p>
                </div>
              )}

              {!loading &&
                filteredAppointments.map((appointment) => {
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
                      onClick={() => onAppointmentClick(appointment)}
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
                            <span className="text-sm font-medium truncate">{appointment.name}</span>
                            <Badge
                              variant="outline"
                              className={`text-xs ${getStatusColor(appointment.status)}`}
                            >
                              {appointment.status}
                            </Badge>
                          </div>
                          {appointment.service_order && (
                            <p className="text-[11px] text-muted-foreground mb-1">
                              Order: {appointment.service_order}
                            </p>
                          )}
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
          )}
        </ScrollArea>
      </div>

      {/* Detail Sheet */}
      <ServiceOrderDetailSheet
        order={selectedServiceOrder}
        open={serviceOrderSheetOpen}
        loading={serviceOrderDetailLoading}
        onOpenChange={(open) => {
          setServiceOrderSheetOpen(open);
          if (!open) {
            setSelectedServiceOrder(null);
          }
        }}
      />
    </>
  );
}
