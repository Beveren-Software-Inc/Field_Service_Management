import { create } from "zustand";
import { Appointment, ServiceOrderSummary } from "../pages/schedule/types";

// Helper function to get initial viewType from localStorage
const getInitialViewType = (): "gantt" | "grid" | "maps" | "calendar" => {
  if (typeof window === "undefined") return "gantt";
  const saved = localStorage.getItem("schedule-view-type");
  if (saved && ["gantt", "grid", "maps", "calendar"].includes(saved)) {
    return saved as "gantt" | "grid" | "maps" | "calendar";
  }
  return "gantt";
};

interface ScheduleState {
  // Appointments
  appointments: Appointment[];
  selectedAppointments: string[];
  selectedAppointment: Appointment | null;
  loading: boolean;
  serviceOrders: ServiceOrderSummary[];
  serviceOrdersLoading: boolean;

  // Filters
  selectedDate: Date; // For right panel (Gantt view)
  appointmentDateRange: { startDate: Date | null; endDate: Date | null }; // For left panel appointments list
  statusFilter: string;
  serviceOrderStatusFilter: string;
  viewType: "gantt" | "grid" | "maps" | "calendar";
  leftPanelView: "appointments" | "technicians"; // Track left panel view mode
  leftListMode: "orders" | "appointments"; // Track list content within schedule view
  settingsView: boolean; // Track if settings view is open
  requestsView: boolean; // Track if service orders tracker view is active

  // Actions
  setAppointments: (appointments: Appointment[]) => void;
  setLoading: (loading: boolean) => void;
  setServiceOrders: (orders: ServiceOrderSummary[]) => void;
  setServiceOrdersLoading: (loading: boolean) => void;
  setSelectedAppointments: (selectedAppointments: string[]) => void;
  toggleAppointmentSelection: (appointmentId: string) => void;
  selectAllAppointments: (appointmentIds: string[]) => void;
  clearSelectedAppointments: () => void;
  setSelectedAppointment: (appointment: Appointment | null) => void;
  setSelectedDate: (date: Date) => void;
  setAppointmentDateRange: (range: { startDate: Date | null; endDate: Date | null }) => void;
  setStatusFilter: (filter: string) => void;
  setServiceOrderStatusFilter: (filter: string) => void;
  setViewType: (view: "gantt" | "grid" | "maps" | "calendar") => void;
  setLeftPanelView: (view: "appointments" | "technicians") => void;
  setLeftListMode: (mode: "orders" | "appointments") => void;
  setSettingsView: (open: boolean) => void;
  setRequestsView: (open: boolean) => void;

  // Helper getters
  isAppointmentSelected: (appointmentId: string) => boolean;
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  // Initial state
  appointments: [],
  selectedAppointments: [],
  selectedAppointment: null,
  loading: false,
  serviceOrders: [],
  serviceOrdersLoading: false,
  selectedDate: new Date(),
  appointmentDateRange: {
    startDate: new Date(new Date().getFullYear(), 0, 1), // Start of year
    endDate: new Date(), // Today
  },
  statusFilter: "all",
  serviceOrderStatusFilter: "all",
  viewType: getInitialViewType(),
  leftPanelView: ((): "appointments" | "technicians" => {
    if (typeof window === "undefined") return "appointments";
    const saved = localStorage.getItem("schedule-left-panel-view");
    return saved === "technicians" ? "technicians" : "appointments";
  })(),
  leftListMode:
    typeof window !== "undefined" && localStorage.getItem("schedule-left-list-mode")
      ? (localStorage.getItem("schedule-left-list-mode") as "orders" | "appointments")
      : "orders",
  settingsView:
    (typeof window !== "undefined" && localStorage.getItem("schedule-settings-view") === "1") ||
    false,
  requestsView:
    (typeof window !== "undefined" && localStorage.getItem("schedule-requests-view") === "1") ||
    false,

  // Actions
  setAppointments: (appointments) => set({ appointments }),
  setLoading: (loading) => set({ loading }),
  setServiceOrders: (orders) => set({ serviceOrders: orders }),
  setServiceOrdersLoading: (loading) => set({ serviceOrdersLoading: loading }),
  setSelectedAppointments: (selectedAppointments) => set({ selectedAppointments }),
  toggleAppointmentSelection: (appointmentId) =>
    set((state) => {
      const isSelected = state.selectedAppointments.includes(appointmentId);
      if (isSelected) {
        return {
          selectedAppointments: state.selectedAppointments.filter(id => id !== appointmentId),
        };
      } else {
        return {
          selectedAppointments: [...state.selectedAppointments, appointmentId],
        };
      }
    }),
  selectAllAppointments: (appointmentIds) =>
    set({ selectedAppointments: appointmentIds }),
  clearSelectedAppointments: () => set({ selectedAppointments: [] }),
  setSelectedAppointment: (appointment) => set({ selectedAppointment: appointment }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  setAppointmentDateRange: (range) => set({ appointmentDateRange: range }),
  setStatusFilter: (filter) => set({ statusFilter: filter }),
  setServiceOrderStatusFilter: (filter) => set({ serviceOrderStatusFilter: filter }),
  setViewType: (view) => {
    set({ viewType: view });
    // Save to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("schedule-view-type", view);
    }
  },
  setLeftPanelView: (view) =>
    set(() => {
      if (typeof window !== "undefined") {
        localStorage.setItem("schedule-left-panel-view", view);
      }
      return { leftPanelView: view };
    }),
  setLeftListMode: (mode) =>
    set(() => {
      if (typeof window !== "undefined") {
        localStorage.setItem("schedule-left-list-mode", mode);
      }
      return { leftListMode: mode };
    }),
  setSettingsView: (open) =>
    set(() => {
      if (typeof window !== "undefined") {
        localStorage.setItem("schedule-settings-view", open ? "1" : "0");
      }
      return { settingsView: open };
    }),
  setRequestsView: (open) =>
    set(() => {
      if (typeof window !== "undefined") {
        localStorage.setItem("schedule-requests-view", open ? "1" : "0");
      }
      return { requestsView: open };
    }),

  // Helper getters
  isAppointmentSelected: (appointmentId) => {
    return get().selectedAppointments.includes(appointmentId);
  },
}));
