"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { format } from "date-fns";
import { ServiceOrderDetail } from "../../pages/schedule/types";
import { ScrollArea } from "../ui/scroll-area";

interface ServiceOrderDetailSheetProps {
  order: ServiceOrderDetail | null;
  open: boolean;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
}

const getStatusBadgeColor = (status?: string) => {
  if (!status) return "border-border text-muted-foreground";
  const normalized = status.toLowerCase();
  if (normalized === "open") return "bg-cyan-50 text-cyan-700 border-cyan-200";
  if (normalized === "scheduled") return "bg-blue-50 text-blue-700 border-blue-200";
  if (normalized === "dispatched") return "bg-purple-50 text-purple-700 border-purple-200";
  if (normalized === "in progress") return "bg-orange-50 text-orange-700 border-orange-200";
  if (normalized === "review") return "bg-pink-50 text-pink-700 border-pink-200";
  if (normalized === "completed") return "bg-green-50 text-green-700 border-green-200";
  if (normalized === "cancelled") return "bg-gray-100 text-gray-700 border-gray-200";
  return "border-border text-muted-foreground";
};

const formatDate = (dateString?: string) => {
  if (!dateString) return null;
  try {
    return format(new Date(dateString), "PPP");
  } catch {
    return dateString;
  }
};

export function ServiceOrderDetailSheet({
  order,
  open,
  loading,
  onOpenChange,
}: ServiceOrderDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-hidden">
        <SheetHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle>Service Order Details</SheetTitle>
              <SheetDescription className="truncate">{order?.name}</SheetDescription>
            {order?.status?.toLowerCase() === "open" && (
              <Button
                size="sm"
                className="bg-primary text-primary-foreground"
                onClick={() => {
                  if (!order) return;
                  const event = new CustomEvent("open-create-appointment", {
                    detail: {
                      service_order: order.name,
                      customer: order.customer,
                    },
                  });
                  window.dispatchEvent(event);
                  onOpenChange(false);
                }}
              >
                Create Appointment
              </Button>
            )}
            </div>
            {order?.status && (
              <Badge variant="outline" className={getStatusBadgeColor(order.status)}>
                {order.status}
              </Badge>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="mt-6 h-[calc(100vh-9rem)] pr-4">
          {loading || !order ? (
            <div className="text-center text-muted-foreground py-10">Loading order details…</div>
          ) : (
            <div className="space-y-6">
              <section>
                <h3 className="text-sm font-semibold mb-3">Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer</span>
                    <span className="font-medium">{order.customer || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Priority</span>
                    <span className="font-medium">{order.priority || "—"}</span>
                  </div>
                  {order.type && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Service Type</span>
                      <span className="font-medium">{order.type}</span>
                    </div>
                  )}
                  {order.product_location && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Product Location</span>
                      <span className="font-medium">{order.product_location}</span>
                    </div>
                  )}
                  {order.current_product_location && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Current Location</span>
                      <span className="font-medium">{order.current_product_location}</span>
                    </div>
                  )}
                  {formatDate(order.posting_date) && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Posting Date</span>
                      <span className="font-medium">{formatDate(order.posting_date)}</span>
                    </div>
                  )}
                </div>
              </section>

              <Separator />

              <section>
                <h3 className="text-sm font-semibold mb-3">Linked Documents</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Service Request</span>
                    <span className="font-medium">{order.service_request || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Service Quotation</span>
                    <span className="font-medium">{order.service_quotation || "—"}</span>
                  </div>
                </div>
              </section>

              <Separator />

              <section>
                <h3 className="text-sm font-semibold mb-3">Financials</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Service Total</span>
                    <span className="font-medium">
                      {order.service_total !== undefined ? order.service_total : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Spare Parts Total</span>
                    <span className="font-medium">
                      {order.spareparts_total !== undefined ? order.spareparts_total : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Grand Total</span>
                    <span className="font-semibold">
                      {order.grand_total !== undefined ? order.grand_total : "—"}
                    </span>
                  </div>
                </div>
              </section>

              <Separator />

              {order.items && order.items.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold mb-3">Items</h3>
                  <div className="space-y-2">
                    {order.items.map((item, idx) => (
                      <div
                        key={`${item.item_code}-${idx}`}
                        className="p-3 border rounded-md space-y-1 text-sm"
                      >
                        <div className="flex justify-between">
                          <span className="font-medium">{item.item_name || item.item_code}</span>
                          <span className="text-muted-foreground">
                            {item.qty} {item.uom || ""}
                          </span>
                        </div>
                        {item.description && (
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        )}
                        {item.invoice_status && (
                          <p className="text-xs text-muted-foreground">
                            Invoice Status: {item.invoice_status}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {order.notes && (
                <>
                  <Separator />
                  <section>
                    <h3 className="text-sm font-semibold mb-3">Notes</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {order.notes}
                    </p>
                  </section>
                </>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
