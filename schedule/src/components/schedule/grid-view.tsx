"use client";

import { useMemo, useState } from "react";
import { format, parse } from "date-fns";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Appointment } from "../../pages/schedule/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";

interface GridViewProps {
  appointments: Appointment[];
  selectedDate: Date;
  onAppointmentClick?: (appointment: Appointment) => void;
  searchQuery?: string;
}

type SortField = "name" | "service_order" | "customer" | "status" | "posting_date" | "scheduled_start_datetime" | null;
type SortDirection = "asc" | "desc";

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

export function GridView({
  appointments,
  selectedDate,
  onAppointmentClick,
  searchQuery = "",
}: GridViewProps) {
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Parse backend datetime as local to avoid timezone drift
  const parseLocalDateTime = (value: string): Date => {
    try {
      const normalized = value.replace("T", " ").slice(0, 19);
      return parse(normalized, "yyyy-MM-dd HH:mm:ss", new Date());
    } catch {
      return new Date(value);
    }
  };

  // Filter and sort appointments
  const filteredAndSortedAppointments = useMemo(() => {
    let filtered = appointments;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((apt) => {
        const technicianMatch = (apt.service_technicians || []).some((tech) => {
          const fullName = tech.full_name || "";
          const code = tech.service_technician || "";
          return (
            fullName.toLowerCase().includes(query) || code.toLowerCase().includes(query)
          );
        });

        return (
          apt.name?.toLowerCase().includes(query) ||
          apt.service_order?.toLowerCase().includes(query) ||
          apt.customer?.toLowerCase().includes(query) ||
          apt.service_type?.toLowerCase().includes(query) ||
          apt.status?.toLowerCase().includes(query) ||
          technicianMatch
        );
      });
    }

    // Apply sorting
    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        let aValue: string | number | Date | null = null;
        let bValue: string | number | Date | null = null;

        switch (sortField) {
          case "name":
            aValue = a.name || "";
            bValue = b.name || "";
            break;
          case "service_order":
            aValue = a.service_order || "";
            bValue = b.service_order || "";
            break;
          case "customer":
            aValue = a.customer || "";
            bValue = b.customer || "";
            break;
          case "status":
            aValue = a.status || "";
            bValue = b.status || "";
            break;
          case "posting_date":
            aValue = a.posting_date ? new Date(a.posting_date) : new Date(0);
            bValue = b.posting_date ? new Date(b.posting_date) : new Date(0);
            break;
          case "scheduled_start_datetime":
            aValue = a.scheduled_start_datetime
              ? parseLocalDateTime(a.scheduled_start_datetime)
              : new Date(0);
            bValue = b.scheduled_start_datetime
              ? parseLocalDateTime(b.scheduled_start_datetime)
              : new Date(0);
            break;
        }

        if (aValue === null && bValue === null) return 0;
        if (aValue === null) return 1;
        if (bValue === null) return -1;

        if (aValue instanceof Date && bValue instanceof Date) {
          return sortDirection === "asc"
            ? aValue.getTime() - bValue.getTime()
            : bValue.getTime() - aValue.getTime();
        }

        const aStr = String(aValue).toLowerCase();
        const bStr = String(bValue).toLowerCase();

        if (sortDirection === "asc") {
          return aStr.localeCompare(bStr);
        } else {
          return bStr.localeCompare(aStr);
        }
      });
    }

    return filtered;
  }, [appointments, sortField, sortDirection, searchQuery]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="h-4 w-4 ml-1" />
    ) : (
      <ArrowDown className="h-4 w-4 ml-1" />
    );
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center">
                  Appointment ID
                  {getSortIcon("name")}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("service_order")}
              >
                <div className="flex items-center">
                  Service Order
                  {getSortIcon("service_order")}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("customer")}
              >
                <div className="flex items-center">
                  Customer
                  {getSortIcon("customer")}
                </div>
              </TableHead>
              <TableHead>Service Type</TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("status")}
              >
                <div className="flex items-center">
                  Status
                  {getSortIcon("status")}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("posting_date")}
              >
                <div className="flex items-center">
                  Posting Date
                  {getSortIcon("posting_date")}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("scheduled_start_datetime")}
              >
                <div className="flex items-center">
                  Scheduled Time
                  {getSortIcon("scheduled_start_datetime")}
                </div>
              </TableHead>
              <TableHead>Technicians</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedAppointments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {searchQuery ? "No appointments match your search" : "No appointments found"}
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedAppointments.map((appointment) => {
                const startDateTime = appointment.scheduled_start_datetime
                  ? parseLocalDateTime(appointment.scheduled_start_datetime)
                  : null;
                const endDateTime = appointment.scheduled_finish_datetime
                  ? parseLocalDateTime(appointment.scheduled_finish_datetime)
                  : null;

                return (
                  <TableRow
                    key={appointment.name}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => onAppointmentClick?.(appointment)}
                  >
                    <TableCell className="font-medium">
                      {appointment.name}
                    </TableCell>
                    <TableCell>
                      {appointment.service_order || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {appointment.customer || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {appointment.service_type || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("text-xs", getStatusColor(appointment.status))}
                      >
                        {appointment.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {appointment.posting_date ? (
                        format(new Date(appointment.posting_date), "MMM d, yyyy")
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {startDateTime && endDateTime ? (
                        <div className="text-sm">
                          <div>{format(startDateTime, "MMM d, yyyy")}</div>
                          <div className="text-xs text-muted-foreground">
                            {format(startDateTime, "HH:mm")} - {format(endDateTime, "HH:mm")}
                          </div>
                        </div>
                      ) : startDateTime ? (
                        <div className="text-sm">
                          <div>{format(startDateTime, "MMM d, yyyy")}</div>
                          <div className="text-xs text-muted-foreground">
                            {format(startDateTime, "HH:mm")}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {appointment.service_technicians && appointment.service_technicians.length > 0 ? (
                        <div className="text-sm">
                          {appointment.service_technicians.map((tech, idx) => (
                            <div key={tech.service_technician || idx} className="truncate">
                              {tech.full_name || tech.service_technician}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer with count */}
      {filteredAndSortedAppointments.length > 0 && (
        <div className="border-t border-border px-4 py-2 text-sm text-muted-foreground">
          Showing {filteredAndSortedAppointments.length} of {appointments.length} appointment{appointments.length !== 1 ? "s" : ""}
          {searchQuery && ` matching "${searchQuery}"`}
        </div>
      )}
    </div>
  );
}
