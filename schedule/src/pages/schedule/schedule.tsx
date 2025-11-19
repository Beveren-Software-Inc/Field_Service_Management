"use client";

import { ScheduleLeftPanel } from "../../components/schedule/schedule-left-panel";
import { ScheduleRightPanel } from "../../components/schedule/schedule-right-panel";
import { TechniciansView } from "../../components/schedule/technicians-view";
import { SettingsView } from "../../components/schedule/settings-view";
import { SidebarMenu } from "../../components/layout/sidebar-menu";
import { useScheduleStore } from "../../store";
import { fetchAppointmentsWithFilter, fetchServiceOrders } from "../../hooks/use-appointments";
import { Toaster } from "../../components/ui/sonner";
import { useCallback, useEffect, useState } from "react";
import { ServiceOrdersView } from "../../components/service-request/product-tracking";

export default function SchedulePage() {
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');

  // Check document direction on mount and when it changes
  useEffect(() => {
    const updateDirection = () => {
      const dir = document.documentElement.dir || 'ltr';
      setDirection(dir as 'ltr' | 'rtl');
    };

    updateDirection();

    // Watch for changes to document direction
    const observer = new MutationObserver(updateDirection);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['dir'],
    });

    return () => observer.disconnect();
  }, []);

  const {
    appointments,
    loading,
    selectedAppointments,
    selectedDate,
    appointmentDateRange,
    statusFilter,
    serviceOrderStatusFilter,
    viewType,
    selectedAppointment,
    leftPanelView,
    leftListMode,
    settingsView,
    requestsView,
    serviceOrders,
    serviceOrdersLoading,
    setAppointments,
    setLoading,
    setSelectedAppointments,
    setSelectedDate,
    setAppointmentDateRange,
    setStatusFilter,
    setServiceOrderStatusFilter,
    setViewType,
    setSelectedAppointment,
    setLeftPanelView,
    setLeftListMode,
    setSettingsView,
    setRequestsView,
    setServiceOrders,
    setServiceOrdersLoading,
    selectAllAppointments,
    clearSelectedAppointments,
  } = useScheduleStore();

  const loadAppointments = useCallback(async () => {
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
  }, [
    appointmentDateRange.startDate,
    appointmentDateRange.endDate,
    statusFilter,
    setAppointments,
    setLoading,
  ]);

  const loadServiceOrders = useCallback(async () => {
    try {
      setServiceOrdersLoading(true);
      const data = await fetchServiceOrders();
      setServiceOrders(data);
    } catch (error) {
      console.error("Error loading service orders:", error);
    } finally {
      setServiceOrdersLoading(false);
    }
  }, [setServiceOrders, setServiceOrdersLoading]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    loadServiceOrders();
  }, [loadServiceOrders]);

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

  const activeMenu = settingsView
    ? "settings"
    : requestsView
    ? "requests"
    : leftPanelView === "technicians"
    ? "technicians"
    : "home";

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
      <div className="relative flex-1 overflow-hidden" dir={direction}>
        <div className="absolute inset-y-0 right-0 w-1 bg-primary/60 pointer-events-none" />
        <div className="flex h-full w-full bg-background overflow-hidden min-w-0">
          {/* Left Sidebar Menu */}
          <SidebarMenu
            activeMenu={activeMenu}
            onTechniciansClick={() => {
              setRequestsView(false);
              setLeftPanelView("technicians");
              setSettingsView(false);
            }}
            onScheduleClick={() => {
              setRequestsView(false);
              setLeftPanelView("appointments");
              setSettingsView(false);
            }}
            onRequestsClick={() => {
              setRequestsView(true);
              setSettingsView(false);
            }}
            onSettingsClick={() => {
              setRequestsView(false);
              setSettingsView(true);
            }}
          />

          {settingsView ? (
            /* Settings View - Full Width */
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              <SettingsView onBack={() => setSettingsView(false)} />
            </div>
      ) : requestsView ? (
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <ServiceOrdersView />
            </div>
          ) : (
            <>
              {/* Left Panel - 20% */}
              <div className="flex-shrink-0 flex-grow-0 flex-basis-[20%] border-r border-border flex flex-col min-w-0 overflow-hidden">
                {leftPanelView === "appointments" ? (
                  <ScheduleLeftPanel
                    appointments={appointments}
                    loading={loading}
                    selectedAppointments={selectedAppointments}
                    statusFilter={statusFilter}
                    serviceOrderStatusFilter={serviceOrderStatusFilter}
                    appointmentDateRange={appointmentDateRange}
                    onStatusFilterChange={setStatusFilter}
                    onServiceOrderFilterChange={setServiceOrderStatusFilter}
                    onDateRangeChange={setAppointmentDateRange}
                    onAppointmentSelect={handleAppointmentSelect}
                    onSelectAll={handleSelectAll}
                    onAppointmentClick={setSelectedAppointment}
                    onMassActionComplete={handleMassActionComplete}
                    mode={leftListMode}
                    onModeToggle={() =>
                      setLeftListMode(leftListMode === "orders" ? "appointments" : "orders")
                    }
                    serviceOrders={serviceOrders}
                    serviceOrdersLoading={serviceOrdersLoading}
                  />
                ) : (
                  <TechniciansView
                    appointments={appointments}
                    onAppointmentClick={setSelectedAppointment}
                  />
                )}
              </div>

              {/* Right Panel - 75% */}
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
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
            </>
          )}
        </div>
      </div>

      <div className="border-t border-primary text-right text-[0.65rem] tracking-[0.2em] uppercase text-primary px-4 py-2 bg-gradient-to-t from-primary/75 via-primary/10 to-transparent">
        Powered By Beveren Software
      </div>

      <Toaster />
    </div>
  );
}
