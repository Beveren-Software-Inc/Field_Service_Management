"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Users, X } from "lucide-react";
import { bulkAssignTechnicians, bulkRemoveTechnicians, fetchTechnicians } from "../../hooks/use-appointments";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Checkbox } from "../ui/checkbox";
import { ScrollArea } from "../ui/scroll-area";
import { useToast } from "../../hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";

interface MassActionsDropdownProps {
  selectedAppointmentIds: string[];
  onComplete: () => void;
}

export function MassActionsDropdown({
  selectedAppointmentIds,
  onComplete,
}: MassActionsDropdownProps) {
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [selectedTechnicians, setSelectedTechnicians] = useState<Set<string>>(new Set());
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadTechnicians = async () => {
    try {
      setLoading(true);
      const data = await fetchTechnicians();
      setTechnicians(data);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load technicians",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAssignClick = () => {
    loadTechnicians();
    setAssignError(null);
    setAssignDialogOpen(true);
  };

  const handleAssign = async () => {
    setAssignError(null);
    if (selectedTechnicians.size === 0) {
      toast({
        title: "Error",
        description: "Please select at least one technician",
        variant: "destructive",
      });
      return;
    }

    try {
      await bulkAssignTechnicians(
        selectedAppointmentIds,
        Array.from(selectedTechnicians)
      );
      toast({
        title: "Success",
        description: `Assigned ${selectedAppointmentIds.length} appointment(s)`,
      });
      setAssignDialogOpen(false);
      setSelectedTechnicians(new Set());
      onComplete();
    } catch (e) {
      const message = (e as Error).message || "Failed to assign technicians";
      setAssignError(message);
    }
  };

  const handleRemove = async () => {
    try {
      await bulkRemoveTechnicians(selectedAppointmentIds);
      toast({
        title: "Success",
        description: `Removed technicians from ${selectedAppointmentIds.length} appointment(s)`,
      });
      setRemoveDialogOpen(false);
      onComplete();
    } catch {
      toast({
        title: "Error",
        description: "Failed to remove technicians",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="w-full">
            Actions ({selectedAppointmentIds.length})
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleAssignClick}>
            <Users className="mr-2 h-4 w-4" />
            Assign Technicians
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRemoveDialogOpen(true)}>
            <X className="mr-2 h-4 w-4" />
            Remove Technicians
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Technicians</DialogTitle>
            <DialogDescription>
              Select technicians to assign to {selectedAppointmentIds.length} appointment(s)
            </DialogDescription>
          </DialogHeader>
          {assignError && (
            <Alert variant="destructive">
              <AlertTitle>Assignment Failed</AlertTitle>
              <AlertDescription>{assignError}</AlertDescription>
            </Alert>
          )}
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2 p-2">
              {loading ? (
                <div className="text-center text-muted-foreground">Loading...</div>
              ) : (
                technicians.map((tech) => (
                  <div
                    key={tech.name}
                    className="flex items-center gap-2 p-2 hover:bg-muted rounded-md"
                  >
                    <Checkbox
                      checked={selectedTechnicians.has(tech.name)}
                      onCheckedChange={(checked) => {
                        const newSelected = new Set(selectedTechnicians);
                        if (checked) {
                          newSelected.add(tech.name);
                        } else {
                          newSelected.delete(tech.name);
                        }
                        setSelectedTechnicians(newSelected);
                      }}
                    />
                    <span className="text-sm">{tech.full_name}</span>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Technicians</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove all technicians from {selectedAppointmentIds.length} appointment(s)?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
