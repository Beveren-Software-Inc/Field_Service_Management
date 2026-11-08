export interface Appointment {
  name: string;
  service_order?: string;
  customer?: string;
  customer_name?: string;
  status: string;
  scheduled_start_datetime: string;
  scheduled_finish_datetime: string;
  posting_date: string;
  service_technicians?: Array<{
    service_technician: string;
    full_name: string;
    is_primary?: number | boolean;
  }>;
  service_type?: string;
  description?: string;
  location?: string | {
    lat: number;
    lng: number;
    service_area?: string;
  } | null;
  service_area?: string | null;
  arrival_window_start?: string | null;
  arrival_window_end?: string | null;
  primary_technician?: string | null;
  service_team?: string | null;
  address_display?: string | null;
}

export interface BoardBlock {
  start: string;
  end: string;
}

export interface BoardVisit extends Appointment {
  customer_name?: string;
}

export interface BoardTechnician {
  name: string;
  full_name: string;
  color?: string | null;
  service_area?: string | null;
  skills?: string[];
  shifts?: BoardBlock[];
  leaves?: BoardBlock[];
}

export interface BoardPayload {
  time_zone: string;
  visits: BoardVisit[];
  unassigned: BoardVisit[];
  technicians: BoardTechnician[];
}

export interface Technician {
  name: string;
  full_name: string;
  employee?: string;
  service_area?: string;
  specialization?: string;
}

export type ViewType = "board" | "maps";

export type AppointmentStatus =
  | "Open"
  | "Quotation"
  | "Converted"
  | "Due Soon"
  | "Overdue"
  | "On Hold"
  | "Closed"
  | "Scheduled"
  | "Dispatched"
  | "In Progress"
  | "Completed"
  | "Cancelled";

export interface ServiceRequestMovement {
  name: string;
  movement_type?: string;
  destination?: string;
  movement_date?: string;
  linked_document_type?: string;
  linked_document?: string;
  handled_by?: string;
  service_order?: string;
}

export interface ServiceOrderSummary {
  name: string;
  subject?: string;
  customer?: string;
  status?: string;
  priority?: string;
  posting_date?: string;
  due_date?: string;
  type?: string;
  serial_no?: string;
  item_code?: string;
  current_product_location?: string;
  product_location?: string;
  description?: string;
  product_movement?: ServiceRequestMovement[];
}

export interface ServiceOrderItem {
  item_code?: string;
  item_name?: string;
  qty?: number;
  uom?: string;
  invoice_status?: string;
  description?: string;
}

export interface ServiceOrderDetail extends ServiceOrderSummary {
  service_request?: string;
  service_quotation?: string;
  service_total?: number;
  spareparts_total?: number;
  grand_total?: number;
  company?: string;
  contact_person?: string;
  contact_email?: string;
  service_area?: string;
  items?: ServiceOrderItem[];
  notes?: string;
  customer_address?: string;
}
