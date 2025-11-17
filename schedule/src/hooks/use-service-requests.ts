import { ServiceRequest } from "../pages/schedule/types";

interface ServiceRequestFilters {
  status?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  search?: string;
  limit?: number;
}

export async function fetchServiceRequests(filters: ServiceRequestFilters = {}): Promise<ServiceRequest[]> {
  try {
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csrfToken = (window as any).csrf_token;
    const params = new URLSearchParams();

    if (filters.status && filters.status !== "all") {
      params.append("status", filters.status);
    }

    if (filters.startDate) {
      params.append("start_date", filters.startDate.toISOString().split("T")[0]);
    }

    if (filters.endDate) {
      params.append("end_date", filters.endDate.toISOString().split("T")[0]);
    }

    if (filters.search) {
      params.append("search", filters.search);
    }

    if (filters.limit) {
      params.append("limit_page_length", String(filters.limit));
    }

    const url = `/api/method/beveren_fsm.field_service_management.api.service_request.get_service_requests?${
      params.toString()
    }`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Frappe-CSRF-Token": csrfToken,
      },
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch service requests: ${response.statusText}`);
    }

    const result = await response.json();
    return result.message || [];
  } catch (error) {
    console.error("Error fetching service requests:", error);
    throw error;
  }
}
