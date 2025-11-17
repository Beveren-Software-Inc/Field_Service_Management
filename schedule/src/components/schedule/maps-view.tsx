"use client";

import { useMemo, useEffect, useRef } from "react";
import { format, parse, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { MapPin } from "lucide-react";
import { Appointment } from "../../pages/schedule/types";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapsViewProps {
  appointments: Appointment[];
  selectedDate: Date;
  onAppointmentClick?: (appointment: Appointment) => void;
  statusFilter?: string;
  technicianSearch?: string;
  searchQuery?: string;
  durationFilter?: "date" | "today" | "thisWeek" | "thisMonth" | "thisYear";
}

const STATUS_COLORS: Record<string, { bg: string; border: string; dot: string; hex: string; bgHex: string; borderHex: string }> = {
  Open: { bg: "bg-blue-100", border: "border-blue-300", dot: "bg-blue-500", hex: "#3b82f6", bgHex: "#dbeafe", borderHex: "#93c5fd" },
  Scheduled: { bg: "bg-blue-100", border: "border-blue-300", dot: "bg-blue-500", hex: "#3b82f6", bgHex: "#dbeafe", borderHex: "#93c5fd" },
  Dispatched: { bg: "bg-orange-100", border: "border-orange-300", dot: "bg-orange-500", hex: "#f97316", bgHex: "#ffedd5", borderHex: "#fdba74" },
  "In Progress": { bg: "bg-orange-100", border: "border-orange-300", dot: "bg-orange-500", hex: "#f97316", bgHex: "#ffedd5", borderHex: "#fdba74" },
  Completed: { bg: "bg-green-100", border: "border-green-300", dot: "bg-green-500", hex: "#22c55e", bgHex: "#dcfce7", borderHex: "#86efac" },
  Cancelled: { bg: "bg-gray-100", border: "border-gray-300", dot: "bg-gray-400", hex: "#9ca3af", bgHex: "#f3f4f6", borderHex: "#d1d5db" },
};

// Get coordinates from appointment location data
const getCoordinates = (appointment: Appointment): [number, number] | null => {
	if (appointment.location && typeof appointment.location === "object" && "lat" in appointment.location && "lng" in appointment.location) {
		const coords: [number, number] = [appointment.location.lat, appointment.location.lng];
		if (isNaN(coords[0]) || isNaN(coords[1]) || coords[0] === 0 || coords[1] === 0) {
			return null;
		}
		return coords;
	}
	return null;
};

// Parse local datetime helper function
const parseLocalDateTime = (value: string): Date => {
  try {
    const normalized = value.replace("T", " ").slice(0, 19);
    return parse(normalized, "yyyy-MM-dd HH:mm:ss", new Date());
  } catch {
    return new Date(value);
  }
};

// Fix Leaflet default icon issue
if (typeof window !== "undefined") {

  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  });
}

export function MapsView({
  appointments,
  selectedDate,
  onAppointmentClick,
  statusFilter = "all",
  technicianSearch = "",
  searchQuery = "",
  durationFilter = "thisWeek",
}: MapsViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  // Calculate date range based on duration filter or selected date
  const dateRange = useMemo(() => {
    if (!durationFilter || durationFilter === "date") {
      return {
        start: startOfDay(selectedDate),
        end: endOfDay(selectedDate),
      };
    }

    // Otherwise use duration filter
    const today = new Date();
    switch (durationFilter) {
      case "today":
        return {
          start: startOfDay(today),
          end: endOfDay(today),
        };
      case "thisWeek":
        return {
          start: startOfWeek(today, { weekStartsOn: 1 }),
          end: endOfWeek(today, { weekStartsOn: 1 }),
        };
      case "thisMonth":
        return {
          start: startOfMonth(today),
          end: endOfMonth(today),
        };
      case "thisYear":
        return {
          start: startOfYear(today),
          end: endOfYear(today),
        };
      default:
        return {
          start: startOfDay(selectedDate),
          end: endOfDay(selectedDate),
        };
    }
  }, [durationFilter, selectedDate]);

  // Filter appointments based on props
  const filteredAppointments = useMemo(() => {
    return appointments.filter((apt) => {
      // Status filter
      if (statusFilter && statusFilter !== "all" && apt.status !== statusFilter) {
        return false;
      }

      if (apt.scheduled_start_datetime || apt.posting_date) {
        const appointmentDate = apt.scheduled_start_datetime
          ? parseLocalDateTime(apt.scheduled_start_datetime)
          : new Date(apt.posting_date);

        if (!isWithinInterval(appointmentDate, { start: dateRange.start, end: dateRange.end })) {
          return false;
        }
      }

      // Technician search filter
      if (technicianSearch.trim()) {
        const query = technicianSearch.toLowerCase();
        const hasMatchingTech = apt.service_technicians?.some(
          (tech) =>
            tech.full_name?.toLowerCase().includes(query) ||
            tech.service_technician?.toLowerCase().includes(query)
        );
        if (!hasMatchingTech) return false;
      }

      // Search query filter (appointments/addresses)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        // Handle location - can be string or object
        const locationStr = typeof apt.location === "string"
          ? apt.location
          : (apt.location && typeof apt.location === "object" && apt.location.service_area)
            ? apt.location.service_area
            : "";
        const matches =
          apt.name?.toLowerCase().includes(query) ||
          apt.service_order?.toLowerCase().includes(query) ||
          apt.customer?.toLowerCase().includes(query) ||
          apt.service_type?.toLowerCase().includes(query) ||
          apt.service_area?.toLowerCase().includes(query) ||
          locationStr.toLowerCase().includes(query);
        if (!matches) return false;
      }

      return true;
    });
  }, [appointments, statusFilter, technicianSearch, searchQuery, dateRange]);

  // Initialize map
  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current) {
      // Initialize map centered on a default location
      const map = L.map(mapContainerRef.current).setView([40.7128, -74.0060], 11);

      // Add OpenStreetMap tiles
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;

      return () => {
        map.remove();
        mapInstanceRef.current = null;
      };
    }
  }, []);

  // Update markers when filtered appointments change
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];


    // Add markers for filtered appointments
    filteredAppointments.forEach((appointment) => {
      const coordinates = getCoordinates(appointment);

      // Skip appointments without valid location data
      if (!coordinates) {
        return;
      }


      const colors = STATUS_COLORS[appointment.status] || STATUS_COLORS.Open;

      // Create custom icon with status color
      const customIcon = L.divIcon({
        className: "custom-marker",
        html: `<div style="background-color: ${colors.hex}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      const marker = L.marker(coordinates, { icon: customIcon }).addTo(map);

      // Create popup content with location name, appointment, and technicians
      const startDateTime = appointment.scheduled_start_datetime
        ? parseLocalDateTime(appointment.scheduled_start_datetime)
        : null;

      const techniciansList = appointment.service_technicians && appointment.service_technicians.length > 0
        ? appointment.service_technicians.map(t => t.full_name || t.service_technician).join(", ")
        : "No technicians assigned";

      const locationName = (typeof appointment.location === "object" && appointment.location?.service_area)
        || (typeof appointment.location === "string" ? appointment.location : null)
        || appointment.service_area
        || appointment.customer
        || "Location not specified";

      const popupContent = `
        <div style="min-width: 250px;">
          <div style="font-weight: 600; margin-bottom: 8px; font-size: 14px;">
            ${appointment.service_order || appointment.name}
          </div>
          <div style="font-size: 12px; color: #666; margin-bottom: 6px;">
            <strong>Location:</strong> ${locationName}
          </div>
          ${appointment.customer && appointment.customer !== locationName ? `<div style="font-size: 12px; color: #666; margin-bottom: 6px;"><strong>Customer:</strong> ${appointment.customer}</div>` : ""}
          ${startDateTime ? `<div style="font-size: 12px; color: #666; margin-bottom: 6px;"><strong>Date:</strong> ${format(startDateTime, "MMM d, yyyy HH:mm")}</div>` : ""}
          <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
            <strong>Technicians:</strong> ${techniciansList}
          </div>
          <div style="margin-top: 8px;">
            <span style="padding: 2px 8px; border-radius: 4px; font-size: 11px; background-color: ${colors.bgHex}; border: 1px solid ${colors.borderHex};">
              ${appointment.status}
            </span>
          </div>
          <button onclick="window.dispatchEvent(new CustomEvent('openAppointment', {detail: '${appointment.name}'}))" style="margin-top: 8px; padding: 4px 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            View Details
          </button>
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.on("click", () => {
        onAppointmentClick?.(appointment);
      });

      markersRef.current.push(marker);
    });

    // Fit map to show all markers (only if we have markers)
    if (markersRef.current.length > 0) {
      const group = new L.FeatureGroup(markersRef.current);
      map.fitBounds(group.getBounds().pad(0.1));
    } else {
      const firstWithLocation = filteredAppointments.find(apt => getCoordinates(apt));
      if (firstWithLocation) {
        const coords = getCoordinates(firstWithLocation);
        if (coords) {
          map.setView(coords, 11);
        }
      }
    }
  }, [filteredAppointments, onAppointmentClick]);

  useEffect(() => {
    const handleOpenAppointment = (event: CustomEvent) => {
      const appointment = filteredAppointments.find((apt) => apt.name === event.detail);
      if (appointment) {
        onAppointmentClick?.(appointment);
      }
    };

    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.addEventListener("openAppointment" as any, handleOpenAppointment as EventListener);
    return () => {
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.removeEventListener("openAppointment" as any, handleOpenAppointment as EventListener);
    };
  }, [filteredAppointments, onAppointmentClick]);

  return (
    <div className="flex h-full bg-background">
      {/* Main Map Area */}
      <div className="flex-1 flex flex-col relative">
        {/* Map Container */}
        <div className="flex-1 relative" ref={mapContainerRef}>
          {filteredAppointments.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/20 z-10">
              <div className="text-center space-y-2">
                <MapPin className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No appointments match your filters</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
