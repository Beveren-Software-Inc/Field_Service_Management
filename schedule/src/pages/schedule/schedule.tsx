"use client";

import { ScheduleLeftPanel } from "../../components/schedule/schedule-left-panel";
import { ScheduleRightPanel } from "../../components/schedule/schedule-right-panel";
import { SidebarMenu } from "../../components/layout/sidebar-menu";
import { useScheduleStore } from "../../store";
import { fetchAppointmentsWithFilter } from "../../hooks/use-appointments";
import { Toaster } from "../../components/ui/sonner";
import { useEffect } from "react";

export default function SchedulePage() {
  const {
    appointments,
    loading,
    selectedAppointments,
    selectedDate,
    appointmentDateRange,
    statusFilter,
    viewType,
    selectedAppointment,
    setAppointments,
    setLoading,
    setSelectedAppointments,
    setSelectedDate,
    setAppointmentDateRange,
    setStatusFilter,
    setViewType,
    setSelectedAppointment,
    toggleAppointmentSelection,
    selectAllAppointments,
    clearSelectedAppointments,
  } = useScheduleStore();

  useEffect(() => {
    loadAppointments();
  }, [appointmentDateRange.startDate, appointmentDateRange.endDate, statusFilter]);

  const loadAppointments = async () => {
    try {
      setLoading(true);
      const data = await fetchAppointmentsWithFilter(
        appointmentDateRange.startDate,
        appointmentDateRange.endDate,
        statusFilter !== "all" ? statusFilter : undefined
      );
      setAppointments(data);
    } catch (error) {
      console.error("Error loading appointments:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAppointmentSelect = (appointmentId: string, checked: boolean) => {
    if (checked) {
      if (!selectedAppointments.includes(appointmentId)) {
        setSelectedAppointments([...selectedAppointments, appointmentId]);
      }
    } else {
      setSelectedAppointments(selectedAppointments.filter(id => id !== appointmentId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      selectAllAppointments(appointments.map(apt => apt.name));
    } else {
      clearSelectedAppointments();
    }
  };

  const handleMassActionComplete = () => {
    clearSelectedAppointments();
    loadAppointments();
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Left Sidebar Menu */}
      <SidebarMenu />

      {/* Left Panel - 20% */}
      <div className="w-[20%] border-r border-border flex flex-col">
        <ScheduleLeftPanel
          appointments={appointments}
          loading={loading}
          selectedAppointments={selectedAppointments}
          statusFilter={statusFilter}
          appointmentDateRange={appointmentDateRange}
          onStatusFilterChange={setStatusFilter}
          onDateRangeChange={setAppointmentDateRange}
          onAppointmentSelect={handleAppointmentSelect}
          onSelectAll={handleSelectAll}
          onAppointmentClick={setSelectedAppointment}
          onMassActionComplete={handleMassActionComplete}
        />
      </div>

      {/* Right Panel - 75% */}
      <div className="flex-1 flex flex-col">
        <ScheduleRightPanel
          appointments={appointments}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          viewType={viewType}
          onViewTypeChange={setViewType}
          selectedAppointment={selectedAppointment}
          onAppointmentSelect={setSelectedAppointment}
          onRefresh={loadAppointments}
          statusFilter={statusFilter}
        />
      </div>

      <Toaster />
    </div>
  );
}
