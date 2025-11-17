"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Skeleton } from "../ui/skeleton";
import { RefreshCcw, Search } from "lucide-react";
import { fetchServiceRequests } from "../../hooks/use-service-requests";
import { ServiceRequest } from "../../pages/schedule/types";
import { format } from "date-fns";

const STATUS_OPTIONS = [
  "Open",
  "Quotation",
  "Converted",
  "Due Soon",
  "Overdue",
  "On Hold",
  "Closed",
];

const statusColors: Record<string, string> = {
  Open: "bg-blue-100 text-blue-800 border-blue-300",
  "Due Soon": "bg-amber-100 text-amber-800 border-amber-300",
  Overdue: "bg-red-100 text-red-800 border-red-300",
  Converted: "bg-emerald-100 text-emerald-800 border-emerald-300",
  "On Hold": "bg-gray-200 text-gray-800 border-gray-300",
  Quotation: "bg-indigo-100 text-indigo-800 border-indigo-300",
  Closed: "bg-slate-100 text-slate-800 border-slate-300",
};

const formatDate = (value?: string) => {
  if (!value) return "—";
  try {
    return format(new Date(value), "MMM d, yyyy");
  } catch {
    return value;
  }
};

export function ServiceRequestsView() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const data = await fetchServiceRequests({
        status: statusFilter,
        limit: 100,
      });
      setRequests(data);
      if (!selectedRequestId && data.length) {
        setSelectedRequestId(data[0].name);
      } else if (selectedRequestId && !data.find((req) => req.name === selectedRequestId)) {
        setSelectedRequestId(data[0]?.name ?? null);
      }
    } catch (error) {
      console.error("Failed to load service requests", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) {
      return requests;
    }
    const term = searchQuery.toLowerCase();
    return requests.filter((req) => {
      return (
        req.name?.toLowerCase().includes(term) ||
        req.subject?.toLowerCase().includes(term) ||
        req.customer?.toLowerCase().includes(term) ||
        req.serial_no?.toLowerCase().includes(term) ||
        req.item_code?.toLowerCase().includes(term) ||
        req.product_movement?.some(
          (mv) =>
            mv.destination?.toLowerCase().includes(term) ||
            mv.movement_type?.toLowerCase().includes(term)
        )
      );
    });
  }, [requests, searchQuery]);

  useEffect(() => {
    if (!filteredRequests.length) {
      setSelectedRequestId(null);
      return;
    }
    if (!selectedRequestId || !filteredRequests.find((req) => req.name === selectedRequestId)) {
      setSelectedRequestId(filteredRequests[0].name);
    }
  }, [filteredRequests, selectedRequestId]);

  const selectedRequest =
    filteredRequests.find((req) => req.name === selectedRequestId) || filteredRequests[0] || null;

  return (
    <div className="flex flex-1 h-full bg-background">
      {/* Left Pane */}
      <div className="w-[25%] border-r border-border flex flex-col bg-card/40">
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Service Requests</h2>
              <p className="text-xs text-muted-foreground">
                Track requests and their movement history
              </p>
            </div>
            <Badge variant="secondary">{filteredRequests.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by ID, customer, serial..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="icon" onClick={loadRequests} disabled={loading}>
              <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {loading &&
              [1, 2, 3, 4].map((i) => (
                <div key={i} className="border rounded-md p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}

            {!loading && filteredRequests.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-10">
                No service requests found
              </div>
            )}

            {!loading &&
              filteredRequests.map((req) => {
                const isActive = selectedRequest?.name === req.name;
                const badgeColor =
                  statusColors[req.status] || "bg-gray-100 text-gray-800 border-gray-300";
                return (
                  <button
                    key={req.name}
                    className={`w-full text-left border rounded-lg p-3 transition-colors ${
                      isActive ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedRequestId(req.name)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">
                        {req.subject || req.name}
                      </p>
                      <Badge variant="outline" className={`text-xs ${badgeColor}`}>
                        {req.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {req.customer || "No customer"}
                    </p>
                    <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-2">
                      {req.serial_no && <span>Serial: {req.serial_no}</span>}
                      {req.item_code && <span>Item: {req.item_code}</span>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {req.posting_date ? `Created ${formatDate(req.posting_date)}` : ""}
                    </div>
                  </button>
                );
              })}
          </div>
        </ScrollArea>
      </div>

      {/* Right Pane */}
      <div className="flex-1 overflow-hidden">
        {selectedRequest ? (
          <div className="h-full flex flex-col">
            <div className="border-b border-border px-6 py-4 bg-card/60 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  Service Request
                </p>
                <h2 className="text-2xl font-semibold">
                  {selectedRequest.subject || selectedRequest.name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selectedRequest.customer || "No customer specified"}
                </p>
              </div>
              <Badge variant="outline" className={statusColors[selectedRequest.status] ?? ""}>
                {selectedRequest.status}
              </Badge>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="p-4 border rounded-lg bg-card shadow-sm">
                    <p className="text-xs text-muted-foreground uppercase">Serial No</p>
                    <p className="text-lg font-semibold">
                      {selectedRequest.serial_no || "Not linked"}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg bg-card shadow-sm">
                    <p className="text-xs text-muted-foreground uppercase">Item</p>
                    <p className="text-lg font-semibold">
                      {selectedRequest.item_code || "Not set"}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg bg-card shadow-sm">
                    <p className="text-xs text-muted-foreground uppercase">Current Location</p>
                    <p className="text-lg font-semibold">
                      {selectedRequest.current_product_location || "Unknown"}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg bg-card shadow-sm">
                    <p className="text-xs text-muted-foreground uppercase">Due Date</p>
                    <p className="text-lg font-semibold">{formatDate(selectedRequest.due_date)}</p>
                  </div>
                </div>

                {selectedRequest.description && (
                  <div className="border rounded-lg bg-card shadow-sm">
                    <div className="border-b border-border px-4 py-2">
                      <h3 className="text-sm font-semibold">Notes</h3>
                    </div>
                    <p className="px-4 py-3 text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedRequest.description}
                    </p>
                  </div>
                )}

                <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
                  <div className="border-b border-border px-4 py-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold">Movement Tracker</h3>
                      <p className="text-xs text-muted-foreground">
                        Latest known location changes for this item
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {selectedRequest.product_movement?.length || 0} entries
                    </Badge>
                  </div>

                  {selectedRequest.product_movement && selectedRequest.product_movement.length ? (
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Current Location</TableHead>
                            <TableHead>Destination</TableHead>
                            <TableHead>Linked Document</TableHead>
                            <TableHead>Handled By</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...selectedRequest.product_movement]
                            .sort((a, b) => {
                              const aTime = a.movement_date ? new Date(a.movement_date).getTime() : 0;
                              const bTime = b.movement_date ? new Date(b.movement_date).getTime() : 0;
                              return bTime - aTime;
                            })
                            .map((movement) => (
                              <TableRow key={movement.name}>
                                <TableCell>{formatDate(movement.movement_date)}</TableCell>
                                <TableCell>{movement.movement_type || "—"}</TableCell>
                                <TableCell>{movement.destination || "—"}</TableCell>
                                <TableCell>
                                  {movement.linked_document ? (
                                    <span>
                                      {movement.linked_document_type || ""}{" "}
                                      <span className="font-medium">{movement.linked_document}</span>
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>
                                <TableCell>{movement.handled_by || "—"}</TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="p-6 text-center text-muted-foreground text-sm">
                      No movement entries recorded yet for this request.
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            No service request selected
          </div>
        )}
      </div>
    </div>
  );
}
