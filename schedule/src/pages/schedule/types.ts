export interface Appointment {
  name: string;
  service_order?: string;
  customer?: string;
  status: "Open" | "Scheduled" | "Dispatched" | "In Progress" | "Completed" | "Cancelled";
  scheduled_start_datetime: string;
  scheduled_finish_datetime: string;
  posting_date: string;
  service_technicians?: Array<{
    service_technician: string;
    full_name: string;
  }>;
  service_type?: string;
  description?: string;
  location?: string | {
    lat: number;
    lng: number;
    service_area?: string;
  };
  service_area?: string;
}

export interface Technician {
  name: string;
  full_name: string;
  employee?: string;
  service_area?: string;
  specialization?: string;
}

export type ViewType = "gantt" | "grid" | "maps" | "calendar";

export type AppointmentStatus =
  | "Open"
  | "Scheduled"
  | "Dispatched"
  | "In Progress"
  | "Completed"
  | "Cancelled";
