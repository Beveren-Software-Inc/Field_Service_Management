import { Appointment, ServiceOrderDetail } from "../pages/schedule/types";

export async function fetchAppointmentsWithFilter(
  startDate: Date | null,
  endDate: Date | null,
  status?: string
): Promise<Appointment[]> {
  try {
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csrfToken = (window as any).csrf_token;

    // Build query parameters
    const params = new URLSearchParams();

    if (startDate) {
      params.append("start_date", startDate.toISOString().split("T")[0]);
    }
    if (endDate) {
      params.append("end_date", endDate.toISOString().split("T")[0]);
    }

    if (status && status !== "all") {
      params.append("status", status);
    }

    const url = `/api/method/beveren_fsm.field_service_management.api.service_appointment.get_appointments?${params.toString()}`;

    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Frappe-CSRF-Token": csrfToken,
    };

    const response = await fetch(url, {
      headers,
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch appointments: ${response.statusText}`);
    }

    const result = await response.json();

    // Frappe API methods return data in result.message
    const appointments = result.message || [];

        //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped = appointments.map((apt: any) => ({
      ...apt,
      service_technicians: apt.service_technicians || [],
    }));

    return mapped;
  } catch (error) {
    console.error("Error fetching appointments:", error);
    throw error;
  }
}

/**
 * Fetch a single appointment by name
 */
export async function fetchAppointment(name: string): Promise<Appointment> {
  try {
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csrfToken = (window as any).csrf_token;
    const url = `/api/method/beveren_fsm.field_service_management.api.service_appointment.get_appointment?name=${encodeURIComponent(name)}`;

    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Frappe-CSRF-Token": csrfToken,
    };

    const response = await fetch(url, {
      headers,
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch appointment: ${response.statusText}`);
    }

    const result = await response.json();

    // Frappe API methods return data in result.message
    return result.message || null;
  } catch (error) {
    console.error("Error fetching appointment:", error);
    throw error;
  }
}

/**
 * Get available appointment statuses
 */
export async function fetchAppointmentStatuses(): Promise<string[]> {
  try {
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csrfToken = (window as any).csrf_token;
    const url = `/api/method/beveren_fsm.field_service_management.api.service_appointment.get_appointment_statuses`;

    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Frappe-CSRF-Token": csrfToken,
    };

    const response = await fetch(url, {
      headers,
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch statuses: ${response.statusText}`);
    }

    const result = await response.json();

    // Frappe API methods return data in result.message
    return result.message || [];
  } catch (error) {
    console.error("Error fetching appointment statuses:", error);
    throw error;
  }
}

    //eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchTechnicians(): Promise<any[]> {
  try {
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csrfToken = (window as any).csrf_token;
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Frappe-CSRF-Token": csrfToken,
    };

    const response = await fetch(
      '/api/resource/Service Technician?fields=["name","full_name","employee","service_area","specialization"]&limit_page_length=0',
      {
        headers,
        credentials: "include",
      }
    );
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error("Error fetching technicians:", error);
    throw error;
  }
}

export interface InvoiceSummary {
  name: string;
  status: string;
  docstatus: number;
  custom_reference_service_doctype?: string;
  custom_reference_service_document?: string;
}


export interface CreateAppointmentItem {
  item_code: string;
  qty: number;
  rate: number;
  amount?: number;
}

export interface CreateAppointmentTechnician {
  service_technician: string;
  full_name: string;
}

// Master data fetchers (basic lists)
//eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchServiceOrders(): Promise<any[]> {
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  const csrfToken = (window as any).csrf_token;

  const params = new URLSearchParams({
    fields: JSON.stringify(["name", "customer", "status", "priority", "posting_date", "type"]),
    filters: JSON.stringify([["docstatus", "=", 1]]),
    order_by: "posting_date desc",
    limit_page_length: "50",
  });

  const url = `/api/resource/Service Order?${params.toString()}`;

  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Frappe-CSRF-Token": csrfToken,
    },
    credentials: "include",
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch service orders: ${resp.statusText}`);
  }

  const json = await resp.json();
  return json.data || [];
}

export async function fetchServiceOrderDetail(name: string): Promise<ServiceOrderDetail> {
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  const csrfToken = (window as any).csrf_token;

  const url = `/api/resource/Service Order/${encodeURIComponent(name)}`;

  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Frappe-CSRF-Token": csrfToken,
    },
    credentials: "include",
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch service order: ${resp.statusText}`);
  }

  const json = await resp.json();
  return json.data || json.data?.data || json;
}

export async function fetchAvailableServiceOrders(): Promise<any[]> {
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  const csrfToken = (window as any).csrf_token;
  const resp = await fetch(
    "/api/method/beveren_fsm.field_service_management.api.schedule.get_unassigned_service_orders",
    {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Frappe-CSRF-Token": csrfToken,
      },
      credentials: "include",
    }
  );
  if (!resp.ok) {
    throw new Error(`Failed to fetch available service orders: ${resp.statusText}`);
  }
  const json = await resp.json();
  return json.message || [];
}

//eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchCustomers(): Promise<any[]> {
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  const csrfToken = (window as any).csrf_token;
  const url = '/api/resource/Customer?fields=["name","customer_name"]&limit_page_length=50';
  const resp = await fetch(url, {
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Frappe-CSRF-Token": csrfToken },
    credentials: "include",
  });
  const json = await resp.json();
  return json.data || [];
}

//eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchServiceTypes(): Promise<any[]> {
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  const csrfToken = (window as any).csrf_token;
  const url = '/api/resource/Service Type?fields=["name"]&limit_page_length=100';
  const resp = await fetch(url, {
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Frappe-CSRF-Token": csrfToken },
    credentials: "include",
  });
  const json = await resp.json();
  return json.data || [];
}

//eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchItems(): Promise<any[]> {
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  const csrfToken = (window as any).csrf_token;
  const url = '/api/resource/Item?fields=["name","item_name","standard_rate"]&limit_page_length=100';
  const resp = await fetch(url, {
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Frappe-CSRF-Token": csrfToken },
    credentials: "include",
  });
  const json = await resp.json();
  return json.data || [];
}

export async function createAppointment(params: {
  posting_date?: string;
  service_order?: string;
  customer: string;
  scheduled_start_datetime: string;
  scheduled_finish_datetime: string;
  service_technicians: CreateAppointmentTechnician[];
  items: CreateAppointmentItem[];
  changed_status?: string | null;
}): Promise<string> {
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  const csrfToken = (window as any).csrf_token;
  const payload = {
    posting_date: params.posting_date || new Date().toISOString().slice(0, 10),
    service_order: params.service_order || null,
    customer: params.customer,
    scheduled_start_datetime: params.scheduled_start_datetime,
    scheduled_finish_datetime: params.scheduled_finish_datetime,
    service_technicians: params.service_technicians,
    items: params.items.map((it) => ({
      item_code: it.item_code,
      qty: it.qty,
      rate: it.rate,
      amount: it.amount ?? it.qty * it.rate,
    })),
    changed_status: params.changed_status ?? null,
  };

  const resp = await fetch(
    "/api/method/beveren_fsm.field_service_management.api.schedule.create_appointment_from_api",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Frappe-CSRF-Token": csrfToken,
      },
      body: JSON.stringify(payload),
      credentials: "include",
    }
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to create appointment: ${text}`);
  }
  const json = await resp.json();
  return json.message as string;
}

export async function fetchPaidInvoicesForAppointment(
  appointmentName: string,
  serviceOrder?: string
): Promise<InvoiceSummary[]> {
  try {
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csrfToken = (window as any).csrf_token;
    const params = new URLSearchParams();
    params.append("appointment_name", appointmentName);
    if (serviceOrder) params.append("service_order", serviceOrder);
    params.append("paid_only", "1");

    const resp = await fetch(
      `/api/method/beveren_fsm.field_service_management.api.service_appointment.get_invoices_for_appointment?${params.toString()}`,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Frappe-CSRF-Token": csrfToken,
        },
        credentials: "include",
      }
    );
    if (!resp.ok) return [];
    const json = await resp.json();
    return (json.message || []) as InvoiceSummary[];
  } catch (error) {
    console.error("Error fetching invoices for appointment:", error);
    return [];
  }
}

export async function bulkAssignTechnicians(
  appointmentIds: string[],
  technicianIds: string[]
): Promise<void> {
  try {

    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csrfToken = (window as any).csrf_token;
    const payload = {
      appointment_ids: appointmentIds,
      technician_ids: technicianIds,
    };

    const response = await fetch(
      "/api/method/beveren_fsm.field_service_management.api.schedule.bulk_assign_technicians",
      {
        method: "POST",
        headers: {
          "X-Frappe-CSRF-Token": csrfToken,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        credentials: "include",
      }
    );

    if (!response.ok) {
      const text = await response.text();

      const parseFrappeErrorMessage = (raw: string): string => {
        try {
          const data = JSON.parse(raw);
          if (data.error && data.error.message) return data.error.message;
          if (Array.isArray(data.errors) && data.errors[0]?.message) return data.errors[0].message;
          if (data._server_messages) {
            const msgs = typeof data._server_messages === "string" ? JSON.parse(data._server_messages) : data._server_messages;
            if (Array.isArray(msgs) && msgs[0]) {
              try {
                const first = JSON.parse(msgs[0]);
                if (first.message) return first.message;
              } catch {
                // ignore JSON parse errors
              }
            }
          }
          if (data.exception) return data.exception;
        } catch {
          // ignore JSON parse errors
        }
        return raw;
      };

      const msg = parseFrappeErrorMessage(text);

      const normalized = msg.toLowerCase().includes("overlap")
        ? msg
        : msg || "Failed to assign technicians";
      throw new Error(normalized);
    }
  } catch (error) {
    console.error("Error assigning technicians:", error);
    throw error;
  }
}

export async function bulkRemoveTechnicians(appointmentIds: string[]): Promise<void> {
  try {
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csrfToken = (window as any).csrf_token;
    const payload = {
      appointment_ids: appointmentIds,
    };
    console.log("Removing technicians with payload:", payload);
    const response = await fetch(
      "/api/method/beveren_fsm.field_service_management.api.schedule.bulk_remove_technicians",
      {
        method: "POST",
        headers: {
          "X-Frappe-CSRF-Token": csrfToken,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        credentials: "include",
      }
    );

    if (!response.ok) {
      throw new Error("Failed to remove technicians");
    }
  } catch (error) {
    console.error("Error removing technicians:", error);
    throw error;
  }
}

export interface ReallocateTechnicianInput {
  service_technician: string;
  full_name: string;
}

export async function reallocateAppointment(params: {
  name: string;
  scheduled_start_datetime: string;
  scheduled_finish_datetime: string;
  service_technicians: ReallocateTechnicianInput[];
  reschedule?: boolean;
}): Promise<string> {
  try {
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csrfToken = (window as any).csrf_token;

    // Fetch the appointment to get its items (required by the API)
    const appointment = await fetchAppointment(params.name);

    // Extract items from the appointment
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (appointment as any).items || [];

    const payload = {
      name: params.name,
      scheduled_start_datetime: params.scheduled_start_datetime,
      scheduled_finish_datetime: params.scheduled_finish_datetime,
      service_technicians: params.service_technicians,
      items: items,
      changed_status: null,
      reschedule: params.reschedule ?? true,
      edit_item_list: false,
      edit_technician_list: true,
    };

    const response = await fetch(
      "/api/method/beveren_fsm.field_service_management.api.schedule.update_appointment_from_api",
      {
        method: "POST",
        headers: {
          "X-Frappe-CSRF-Token": csrfToken,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        credentials: "include",
      }
    );

    if (!response.ok) {
      const text = await response.text();
      try {
        // Try to parse the error response
        const errorData = JSON.parse(text);

        // Check for overlap validation error in exception message
        if (errorData.exception && errorData.exception.includes("overlap")) {
          throw new Error("There is an overlap with another appointment. Please adjust the scheduled dates or technicians.");
        }

        // Check for server messages (Frappe format: array of JSON strings)
        if (errorData._server_messages) {
          let serverMessages: string[];
          // _server_messages might be a string representation of an array, or already an array
          if (typeof errorData._server_messages === "string") {
            serverMessages = JSON.parse(errorData._server_messages);
          } else {
            serverMessages = errorData._server_messages;
          }

          if (serverMessages.length > 0) {
            // Each element is a JSON string, parse it
            const messageObj = JSON.parse(serverMessages[0]);
            const messageText = messageObj.message || messageObj.title || "";

            // Check if it's an overlap error
            if (messageText.toLowerCase().includes("overlap")) {
              throw new Error("There is an overlap with another appointment. Please adjust the scheduled dates or technicians.");
            }

            throw new Error(messageText || "Validation error occurred. Please check the details.");
          }
        }

        // Fallback to exception message or generic error
        throw new Error(errorData.exception || `Failed to reallocate appointment: ${text}`);
      } catch (parseError) {
        // If parsing fails, check if the text itself contains overlap message
        if (text.toLowerCase().includes("overlap")) {
          throw new Error("There is an overlap with another appointment. Please adjust the scheduled dates or technicians.");
        }
        // If it's already an Error, rethrow it
        if (parseError instanceof Error) {
          throw parseError;
        }
        throw new Error(`Failed to reallocate appointment: ${text}`);
      }
    }

    const result = await response.json();
    // Frappe usually returns message with doc name
    return result.message;
  } catch (error) {
    console.error("Error reallocating appointment:", error);
    throw error;
  }
}
