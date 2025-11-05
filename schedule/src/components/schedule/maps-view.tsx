"use client";

import { useMemo, useEffect, useRef } from "react";
import { format, parse } from "date-fns";
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
}

const STATUS_COLORS: Record<string, { bg: string; border: string; dot: string; hex: string }> = {
  Open: { bg: "bg-blue-100", border: "border-blue-300", dot: "bg-blue-500", hex: "#3b82f6" },
  Scheduled: { bg: "bg-blue-100", border: "border-blue-300", dot: "bg-blue-500", hex: "#3b82f6" },
  Dispatched: { bg: "bg-orange-100", border: "border-orange-300", dot: "bg-orange-500", hex: "#f97316" },
  "In Progress": { bg: "bg-orange-100", border: "border-orange-300", dot: "bg-orange-500", hex: "#f97316" },
  Completed: { bg: "bg-green-100", border: "border-green-300", dot: "bg-green-500", hex: "#22c55e" },
  Cancelled: { bg: "bg-gray-100", border: "border-gray-300", dot: "bg-gray-400", hex: "#9ca3af" },
};

// Generate random coordinates for appointments (for demo purposes)
// In production, this would use actual address geocoding
const generateRandomCoordinates = (appointmentId: string): [number, number] => {
  // Use appointment ID as seed for consistent random location
  const seed = appointmentId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const random = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  // Random coordinates around a central point (e.g., a city center)
  // Adjust these center coordinates to your service area
  const centerLat = 40.7128; // Example: New York City
  const centerLng = -74.0060;
  const radius = 0.5; // ~50km radius

  const lat = centerLat + (random(seed) - 0.5) * radius;
  const lng = centerLng + (random(seed + 1000) - 0.5) * radius;

  return [lat, lng];
};

// Fix Leaflet default icon issue
if (typeof window !== "undefined") {
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
}: MapsViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  // Filter appointments based on props
  const filteredAppointments = useMemo(() => {
    return appointments.filter((apt) => {
      // Status filter
      if (statusFilter && statusFilter !== "all" && apt.status !== statusFilter) {
        return false;
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
        const matches =
          apt.name?.toLowerCase().includes(query) ||
          apt.service_order?.toLowerCase().includes(query) ||
          apt.customer?.toLowerCase().includes(query) ||
          apt.service_type?.toLowerCase().includes(query) ||
          apt.location?.toLowerCase().includes(query);
        if (!matches) return false;
      }

      return true;
    });
  }, [appointments, statusFilter, technicianSearch, searchQuery]);

  const parseLocalDateTime = (value: string): Date => {
    try {
      const normalized = value.replace("T", " ").slice(0, 19);
      return parse(normalized, "yyyy-MM-dd HH:mm:ss", new Date());
    } catch {
      return new Date(value);
    }
  };

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
      const coordinates = generateRandomCoordinates(appointment.name);
      const colors = STATUS_COLORS[appointment.status] || STATUS_COLORS.Open;

      // Create custom icon with status color
      const customIcon = L.divIcon({
        className: "custom-marker",
        html: `<div style="background-color: ${colors.hex}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      const marker = L.marker(coordinates, { icon: customIcon }).addTo(map);

      // Create popup content
      const startDateTime = appointment.scheduled_start_datetime
        ? parseLocalDateTime(appointment.scheduled_start_datetime)
        : null;

      const popupContent = `
        <div style="min-width: 200px;">
          <div style="font-weight: 600; margin-bottom: 8px;">
            ${appointment.service_order || appointment.name}
          </div>
          ${appointment.customer ? `<div style="font-size: 12px; color: #666; margin-bottom: 4px;">${appointment.customer}</div>` : ""}
          ${startDateTime ? `<div style="font-size: 12px; color: #666; margin-bottom: 4px;">${format(startDateTime, "MMM d, yyyy HH:mm")}</div>` : ""}
          <div style="margin-top: 8px;">
            <span style="padding: 2px 8px; border-radius: 4px; font-size: 11px; ${colors.bg.replace('bg-', 'background-color: ')}; ${colors.border.replace('border-', 'border: 1px solid ')};">
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

    // Fit map to show all markers
    if (markersRef.current.length > 0) {
      const group = new L.FeatureGroup(markersRef.current);
      map.fitBounds(group.getBounds().pad(0.1));
    }
  }, [filteredAppointments, onAppointmentClick]);

  // Handle custom event for popup button clicks
  useEffect(() => {
    const handleOpenAppointment = (event: CustomEvent) => {
      const appointment = filteredAppointments.find((apt) => apt.name === event.detail);
      if (appointment) {
        onAppointmentClick?.(appointment);
      }
    };

    window.addEventListener("openAppointment" as any, handleOpenAppointment as EventListener);
    return () => {
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
