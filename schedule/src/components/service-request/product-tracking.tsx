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
import { fetchServiceOrdersForTracking } from "../../hooks/use-service-requests";
import { ServiceOrderSummary, ServiceRequestMovement } from "../../pages/schedule/types";
import { format } from "date-fns";

const STATUS_OPTIONS = [
  "Open",
  "Scheduled",
  "Dispatched",
  "In Progress",
  "Review",
  "Completed",
  "Cancelled",
];

const statusColors: Record<string, string> = {
  Open: "bg-cyan-100 text-cyan-800 border-cyan-300",
  Scheduled: "bg-blue-100 text-blue-800 border-blue-300",
  Dispatched: "bg-purple-100 text-purple-800 border-purple-300",
  "In Progress": "bg-orange-100 text-orange-800 border-orange-300",
  Review: "bg-pink-100 text-pink-800 border-pink-300",
  Completed: "bg-green-100 text-green-800 border-green-300",
  Cancelled: "bg-gray-200 text-gray-700 border-gray-300",
};

const formatDate = (value?: string) => {
  if (!value) return "—";
  try {
    return format(new Date(value), "MMM d, yyyy");
  } catch {
    return value;
  }
};

export function ServiceOrdersView() {
  const [orders, setOrders] = useState<ServiceOrderSummary[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await fetchServiceOrdersForTracking({
        status: statusFilter,
        limit: 100,
      });
      setOrders(data);
      if (!selectedOrderId && data.length) {
        setSelectedOrderId(data[0].name);
      } else if (selectedOrderId && !data.find((req) => req.name === selectedOrderId)) {
        setSelectedOrderId(data[0]?.name ?? null);
      }
    } catch (error) {
      console.error("Failed to load service orders", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) {
      return orders;
    }
    const term = searchQuery.toLowerCase();
    return orders.filter((req) => {
      return (
        req.name?.toLowerCase().includes(term) ||
        req.customer?.toLowerCase().includes(term) ||
        req.serial_no?.toLowerCase().includes(term) ||
        req.item_code?.toLowerCase().includes(term) ||
        req.product_movement?.some((mv: ServiceRequestMovement) => {
          const dest = mv.destination?.toLowerCase() || "";
          const type = mv.movement_type?.toLowerCase() || "";
          const so = mv.service_order?.toLowerCase() || "";
          return dest.includes(term) || type.includes(term) || so.includes(term);
        })
      );
    });
  }, [orders, searchQuery]);

  useEffect(() => {
    if (!filteredOrders.length) {
      setSelectedOrderId(null);
      return;
    }
    if (!selectedOrderId || !filteredOrders.find((req) => req.name === selectedOrderId)) {
      setSelectedOrderId(filteredOrders[0].name);
    }
  }, [filteredOrders, selectedOrderId]);

  const selectedOrder =
    filteredOrders.find((req) => req.name === selectedOrderId) || filteredOrders[0] || null;

  return (
    <div className="flex flex-1 h-full w-full overflow-hidden bg-background">
      {/* Left Pane */}
      <div className="w-[20%] min-w-[260px] border-r border-border flex flex-col bg-card/40">
        <div className="p-4 border-b border-border space-y-3 bg-card">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Service Orders</h2>
              <p className="text-xs text-muted-foreground">
                Track orders and their movement history
              </p>
            </div>
            <Badge variant="secondary">{filteredOrders.length}</Badge>
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
            <Button variant="outline" size="icon" onClick={loadOrders} disabled={loading}>
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

            {!loading && filteredOrders.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-10">
                No service orders found
              </div>
            )}

            {!loading &&
              filteredOrders.map((req) => {
                const isActive = selectedOrder?.name === req.name;
                const badgeColor =
                  statusColors[req.status] || "bg-gray-100 text-gray-800 border-gray-300";
                return (
                  <button
                    key={req.name}
                    className={`w-full text-left border rounded-lg p-3 transition-colors ${
                      isActive ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedOrderId(req.name)}
                  >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold truncate">
                    {req.name}
                  </p>
                  <Badge variant="outline" className={`text-xs ${badgeColor}`}>
                    {req.status || "Unknown"}
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
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {selectedOrder ? (
          <div className="h-full flex flex-col">
            <div className="border-b border-border px-6 py-4 bg-gradient-to-b from-primary/60 via-primary/45 to-primary/20 flex items-center justify-between text-primary-foreground shadow-sm">
              <div>

                <h2 className="text-2xl font-semibold drop-shadow-sm">
                  {selectedOrder.name}
                </h2>

              </div>
              <Badge
                variant="outline"
                className={`${statusColors[selectedOrder.status || ""] ?? "bg-white text-primary border-white"} shadow-md`}
              >
                {selectedOrder.status || "Unknown"}
              </Badge>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="p-4 border rounded-lg bg-card shadow-sm">
                    <p className="text-xs text-muted-foreground uppercase">Serial No</p>
                    <p className="text-lg font-semibold">
                      {selectedOrder.serial_no || "Not linked"}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg bg-card shadow-sm">
                    <p className="text-xs text-muted-foreground uppercase">Item</p>
                    <p className="text-lg font-semibold">
                      {selectedOrder.item_code || "Not set"}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg bg-card shadow-sm">
                    <p className="text-xs text-muted-foreground uppercase">Current Location</p>
                    <p className="text-lg font-semibold">
                      {selectedOrder.product_location || "Unknown"}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg bg-card shadow-sm">
                    <p className="text-xs text-muted-foreground uppercase">Due Date</p>
                    <p className="text-lg font-semibold">{formatDate(selectedOrder.due_date)}</p>
                  </div>
                </div>

                {selectedOrder.description && (
                  <div className="border rounded-lg bg-card shadow-sm">
                    <div className="border-b border-border px-4 py-2">
                      <h3 className="text-sm font-semibold">Notes</h3>
                    </div>
                    <p className="px-4 py-3 text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedOrder.description}
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
                      {selectedOrder.product_movement?.length || 0} entries
                    </Badge>
                  </div>

                  {selectedOrder.product_movement && selectedOrder.product_movement.length ? (
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                          <TableHead>Destination</TableHead>
                          <TableHead>Linked Document</TableHead>
                            <TableHead>Handled By</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...selectedOrder.product_movement]
                            .sort((a, b) => {
                              const aTime = a.movement_date ? new Date(a.movement_date).getTime() : 0;
                              const bTime = b.movement_date ? new Date(b.movement_date).getTime() : 0;
                              return bTime - aTime;
                            })
                            .map((movement) => (
                              <TableRow key={movement.name}>
                                <TableCell>{formatDate(movement.movement_date)}</TableCell>
                                <TableCell>{movement.destination || movement.movement_type || "—"}</TableCell>
                                <TableCell>
                                  {movement.linked_document ? (
                                    <span className="inline-flex flex-col">
                                      <span className="text-[11px] uppercase text-muted-foreground">
                                        {movement.linked_document_type || ""}
                                      </span>
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
            No service order selected
          </div>
        )}
      </div>
    </div>
  );
}
