"use client";

import { useState, useEffect } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { Appointment } from "../../pages/schedule/types";
import { fetchTechnicians } from "../../hooks/use-appointments";
import { format } from "date-fns";
import { TechnicianDetailSheet } from "./technician-detail-sheet";

interface Technician {
  name: string;
  full_name: string;
  employee?: string;
  service_area?: string;
  specialization?: string;
}

interface TechniciansViewProps {
  appointments: Appointment[];
  onAppointmentClick: (appointment: Appointment) => void;
}

export function TechniciansView({
  appointments,
  onAppointmentClick,
}: TechniciansViewProps) {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  useEffect(() => {
    loadTechnicians();
  }, []);

  const loadTechnicians = async () => {
    try {
      setLoading(true);
      const data = await fetchTechnicians();
      setTechnicians(data);
    } catch (error) {
      console.error("Error loading technicians:", error);
    } finally {
      setLoading(false);
    }
  };

  const getTechnicianAppointments = (technicianName: string): Appointment[] => {
    return appointments.filter((apt) =>
      apt.service_technicians?.some((tech) => tech.service_technician === technicianName)
    );
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, "MMM d, HH:mm");
    } catch {
      return dateString;
    }
  };

  const handleTechnicianClick = (technician: Technician) => {
    setSelectedTechnician(technician);
    setDetailSheetOpen(true);
  };

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Technicians</h2>
            <Badge variant="secondary">{technicians.length}</Badge>
          </div>
        </div>

        {/* Technicians List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-3">
            {/* Loading State */}
            {loading && (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-2 p-3 border rounded-md">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            )}

            {/* Technicians */}
            {!loading && technicians.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                <p>No technicians found</p>
              </div>
            )}

            {!loading &&
              technicians.map((technician) => {
                const techAppointments = getTechnicianAppointments(technician.name);
                const upcomingAppointments = techAppointments
                  .filter((apt) => {
                    if (!apt.scheduled_start_datetime) return false;
                    const aptDate = new Date(apt.scheduled_start_datetime);
                    return aptDate >= new Date();
                  })
                  .sort((a, b) => {
                    const dateA = a.scheduled_start_datetime ? new Date(a.scheduled_start_datetime).getTime() : 0;
                    const dateB = b.scheduled_start_datetime ? new Date(b.scheduled_start_datetime).getTime() : 0;
                    return dateA - dateB;
                  })
                  .slice(0, 3); // Show only first 3 upcoming appointments

                return (
                  <div
                    key={technician.name}
                    className="p-3 border rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleTechnicianClick(technician)}
                  >
                    {/* Technician Info */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-medium text-foreground">{technician.full_name}</h3>
                        {techAppointments.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {techAppointments.length} {techAppointments.length === 1 ? "appt" : "appts"}
                          </span>
                        )}
                      </div>
                      {technician.service_area && (
                        <p className="text-xs text-muted-foreground mb-1">
                          Area: {technician.service_area}
                        </p>
                      )}
                      {technician.specialization && (
                        <p className="text-xs text-muted-foreground">
                          Specialization: {technician.specialization}
                        </p>
                      )}
                    </div>

                    {/* Upcoming Appointments */}
                    {upcomingAppointments.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Upcoming Appointments:
                        </p>
                        <div className="space-y-2">
                          {upcomingAppointments.map((appointment) => (
                            <div
                              key={appointment.name}
                              className="p-2 bg-muted/30 rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                onAppointmentClick(appointment);
                              }}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium truncate text-foreground">
                                  {appointment.service_order || appointment.name}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-xs ml-2"
                                >
                                  {appointment.status}
                                </Badge>
                              </div>
                              {appointment.scheduled_start_datetime && (
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(appointment.scheduled_start_datetime)}
                                </p>
                              )}
                              {appointment.customer && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {appointment.customer}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {upcomingAppointments.length === 0 && techAppointments.length === 0 && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground">No upcoming appointments</p>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </ScrollArea>
      </div>

      {/* Technician Detail Sheet */}
      <TechnicianDetailSheet
        technician={selectedTechnician}
        appointments={appointments}
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
        onAppointmentClick={onAppointmentClick}
      />
    </>
  );
}
