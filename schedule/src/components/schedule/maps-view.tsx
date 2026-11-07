"use client";

import { useMemo, useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { Appointment } from "../../pages/schedule/types";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchBoard, boardVisitToAppointment } from "../../hooks/use-appointments";
import {
  addDaysKey,
  dateToKey,
  formatWall,
  getCompanyTimeZone,
  monthBounds,
  startOfWeekKey,
  todayKey,
  yearBounds,
} from "../../lib/company-time";

interface MapsViewProps {
  selectedDate: Date;
  onAppointmentClick?: (appointment: Appointment) => void;
  statusFilter?: string;
  searchQuery?: string;
  durationFilter?: "date" | "today" | "thisWeek" | "thisMonth" | "thisYear";
  refreshToken?: number;
}

const STATUS_COLORS: Record<string, { bg: string; border: string; dot: string; hex: string; bgHex: string; borderHex: string }> = {
  Unassigned: { bg: "bg-slate-100", border: "border-slate-300", dot: "bg-slate-500", hex: "#64748b", bgHex: "#f1f5f9", borderHex: "#cbd5e1" },
  Scheduled: { bg: "bg-blue-100", border: "border-blue-300", dot: "bg-blue-500", hex: "#3b82f6", bgHex: "#dbeafe", borderHex: "#93c5fd" },
  Dispatched: { bg: "bg-violet-100", border: "border-violet-300", dot: "bg-violet-500", hex: "#7c3aed", bgHex: "#ede9fe", borderHex: "#c4b5fd" },
  "En route": { bg: "bg-amber-100", border: "border-amber-300", dot: "bg-amber-500", hex: "#d97706", bgHex: "#fef3c7", borderHex: "#fcd34d" },
  "On site": { bg: "bg-orange-100", border: "border-orange-300", dot: "bg-orange-500", hex: "#f97316", bgHex: "#ffedd5", borderHex: "#fdba74" },
  Paused: { bg: "bg-zinc-100", border: "border-zinc-300", dot: "bg-zinc-500", hex: "#71717a", bgHex: "#f4f4f5", borderHex: "#d4d4d8" },
  Completed: { bg: "bg-green-100", border: "border-green-300", dot: "bg-green-500", hex: "#22c55e", bgHex: "#dcfce7", borderHex: "#86efac" },
  Cancelled: { bg: "bg-gray-100", border: "border-gray-300", dot: "bg-gray-400", hex: "#9ca3af", bgHex: "#f3f4f6", borderHex: "#d1d5db" },
};

const getCoordinates = (appointment: Appointment): [number, number] | null => {
  if (appointment.location && typeof appointment.location === "object" && "lat" in appointment.location && "lng" in appointment.location) {
    const coords: [number, number] = [appointment.location.lat, appointment.location.lng];
    if (isNaN(coords[0]) || isNaN(coords[1]) || coords[0] === 0 || coords[1] === 0) return null;
    return coords;
  }
  return null;
};

if (typeof window !== "undefined") {
  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  });
}

function boardRange(
  durationFilter: MapsViewProps["durationFilter"],
  selectedDate: Date,
  timeZone: string
): { start: string; end: string } {
  const today = todayKey(timeZone);
  if (durationFilter === "thisWeek") {
    const start = startOfWeekKey(today, timeZone);
    const end = addDaysKey(start, 6, timeZone);
    return { start: `${start} 00:00:00`, end: `${end} 23:59:59` };
  }
  if (durationFilter === "thisMonth") return monthBounds(today, timeZone);
  if (durationFilter === "thisYear") return yearBounds(today);
  const key = durationFilter === "date" ? dateToKey(selectedDate) : today;
  return { start: `${key} 00:00:00`, end: `${key} 23:59:59` };
}

export function MapsView({
  selectedDate,
  onAppointmentClick,
  statusFilter = "all",
  searchQuery = "",
  durationFilter = "today",
  refreshToken = 0,
}: MapsViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const timeZone = getCompanyTimeZone();

  const range = useMemo(
    () => boardRange(durationFilter, selectedDate, timeZone),
    [durationFilter, selectedDate, timeZone]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const board = await fetchBoard({
          start: range.start,
          end: range.end,
          status: statusFilter && statusFilter !== "all" ? statusFilter : undefined,
        });
        if (!cancelled) {
          setAppointments([...(board.visits || []), ...(board.unassigned || [])].map(boardVisitToAppointment));
        }
      } catch (error) {
        console.error("Error loading map visits:", error);
        if (!cancelled) setAppointments([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, statusFilter, refreshToken]);

  const filteredAppointments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return appointments;
    return appointments.filter((apt) => {
      const locationStr =
        typeof apt.location === "string"
          ? apt.location
          : apt.location && typeof apt.location === "object"
            ? apt.location.service_area || ""
            : "";
      return [apt.name, apt.service_order, apt.customer, apt.service_type, apt.service_area, apt.address_display, locationStr]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [appointments, searchQuery]);

  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current).setView([40.7128, -74.006], 11);
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

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    filteredAppointments.forEach((appointment) => {
      const coordinates = getCoordinates(appointment);
      if (!coordinates) return;
      const colors = STATUS_COLORS[appointment.status] || STATUS_COLORS.Scheduled;
      const customIcon = L.divIcon({
        className: "custom-marker",
        html: `<div style="background-color: ${colors.hex}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      const marker = L.marker(coordinates, { icon: customIcon }).addTo(map);
      const when = appointment.scheduled_start_datetime ? formatWall(appointment.scheduled_start_datetime) : "";
      const techniciansList =
        appointment.service_technicians && appointment.service_technicians.length > 0
          ? appointment.service_technicians.map((tech) => tech.full_name || tech.service_technician).join(", ")
          : "No technicians assigned";
      const locationName =
        appointment.address_display ||
        appointment.service_area ||
        (typeof appointment.location === "object" ? appointment.location?.service_area : "") ||
        appointment.customer ||
        "Location not specified";
      marker.bindPopup(`
        <div style="min-width: 220px;">
          <div style="font-weight: 600; margin-bottom: 8px;">${appointment.service_order || appointment.name}</div>
          <div style="font-size: 12px; margin-bottom: 4px;"><strong>Where:</strong> ${locationName}</div>
          ${appointment.customer ? `<div style="font-size: 12px; margin-bottom: 4px;"><strong>Customer:</strong> ${appointment.customer}</div>` : ""}
          ${when ? `<div style="font-size: 12px; margin-bottom: 4px;"><strong>When:</strong> ${when}</div>` : ""}
          <div style="font-size: 12px; margin-bottom: 8px;"><strong>Technicians:</strong> ${techniciansList}</div>
          <span style="padding: 2px 8px; border-radius: 4px; font-size: 11px; background-color: ${colors.bgHex}; border: 1px solid ${colors.borderHex};">${appointment.status}</span>
        </div>
      `);
      marker.on("click", () => onAppointmentClick?.(appointment));
      markersRef.current.push(marker);
    });

    if (markersRef.current.length > 0) {
      const group = new L.FeatureGroup(markersRef.current);
      map.fitBounds(group.getBounds().pad(0.1));
    }
  }, [filteredAppointments, onAppointmentClick]);

  return (
    <div className="flex h-full bg-background">
      <div className="relative flex flex-1 flex-col">
        <div className="relative flex-1" ref={mapContainerRef}>
          {!loading && filteredAppointments.length === 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/20">
              <div className="space-y-2 text-center">
                <MapPin className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No visits in this window</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
