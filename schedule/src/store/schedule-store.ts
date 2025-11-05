import { create } from "zustand";
import { Appointment } from "../pages/schedule/types";

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

  // Filters
  selectedDate: Date; // For right panel (Gantt view)
  appointmentDateRange: { startDate: Date | null; endDate: Date | null }; // For left panel appointments list
  statusFilter: string;
  viewType: "gantt" | "grid" | "maps" | "calendar";

  // Actions
  setAppointments: (appointments: Appointment[]) => void;
  setLoading: (loading: boolean) => void;
  setSelectedAppointments: (selectedAppointments: string[]) => void;
  toggleAppointmentSelection: (appointmentId: string) => void;
  selectAllAppointments: (appointmentIds: string[]) => void;
  clearSelectedAppointments: () => void;
  setSelectedAppointment: (appointment: Appointment | null) => void;
  setSelectedDate: (date: Date) => void;
  setAppointmentDateRange: (range: { startDate: Date | null; endDate: Date | null }) => void;
  setStatusFilter: (filter: string) => void;
  setViewType: (view: "gantt" | "grid" | "maps" | "calendar") => void;

  // Helper getters
  isAppointmentSelected: (appointmentId: string) => boolean;
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  // Initial state
  appointments: [],
  selectedAppointments: [],
  selectedAppointment: null,
  loading: false,
  selectedDate: new Date(),
  appointmentDateRange: {
    startDate: new Date(new Date().getFullYear(), 0, 1), // Start of year
    endDate: new Date(), // Today
  },
  statusFilter: "all",
  viewType: getInitialViewType(),

  // Actions
  setAppointments: (appointments) => set({ appointments }),
  setLoading: (loading) => set({ loading }),
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
  setViewType: (view) => {
    set({ viewType: view });
    // Save to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("schedule-view-type", view);
    }
  },

  // Helper getters
  isAppointmentSelected: (appointmentId) => {
    return get().selectedAppointments.includes(appointmentId);
  },
}));
