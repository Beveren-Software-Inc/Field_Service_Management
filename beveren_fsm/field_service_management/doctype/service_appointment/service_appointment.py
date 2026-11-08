# Copyright (c) 2025, Beveren Software and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc

# Statuses the dispatcher or technician set by hand. Saving the visit must not
# push these back to Scheduled just because a technician is present.
HELD_STATUSES = {"Dispatched", "En route", "On site", "Paused", "Completed", "Cancelled"}


class ServiceAppointment(Document):
	def before_submit(self):
		self.set_scheduled_status()
		self.set_service_order_status()

	def validate(self):
		self.validate_items()
		self.copy_service_address()
		self.apply_service_team()
		self.sync_primary_technician()
		self.validate_technicians()
		self.validate_overlap()
		self.set_scheduled_status()

	def before_update_after_submit(self):
		self.validate_overlap()
		self.update_service_order_status()

	def on_cancel(self):
		self.cancel_linked_order()

	def validate_items(self):
		if not self.items:
			frappe.throw(_("Please add at least one item"))

	def validate_technicians(self):
		# A visit with no technician is the unassigned tray. Rows that do exist
		# still need a technician.
		for row in self.get("service_technicians") or []:
			if not row.service_technician:
				frappe.throw(_("Each crew row needs a technician"))

	def copy_service_address(self):
		"""Copy the order's service address onto a new visit when it is empty."""
		if self.service_address or not self.service_order:
			return
		address = frappe.db.get_value("Service Order", self.service_order, "customer_address")
		if not address:
			return
		self.service_address = address
		if frappe.get_meta("Address").has_field("geolocation"):
			geolocation = frappe.db.get_value("Address", address, "geolocation")
			if geolocation:
				self.geolocation = geolocation

	def apply_service_team(self):
		"""Replace the crew with the team members when a team is assigned."""
		if not self.service_team:
			return
		previous = self.get_doc_before_save()
		if previous and previous.get("service_team") == self.service_team:
			return

		team = frappe.get_doc("Service Team", self.service_team)
		members = [row for row in (team.get("members") or []) if row.service_technician]
		self.set("service_technicians", [])
		if not members:
			self.primary_technician = None
			return

		lead = next((row.service_technician for row in members if row.is_lead), None)
		primary = lead or members[0].service_technician
		name_rows = frappe.get_all(
			"Service Technician",
			filters={"name": ["in", [row.service_technician for row in members]]},
			fields=["name", "full_name"],
			limit_page_length=0,
		)
		full_names = {row.name: row.full_name for row in name_rows}
		marked = False
		for row in members:
			is_primary = 0
			if row.service_technician == primary and not marked:
				is_primary = 1
				marked = True
			self.append(
				"service_technicians",
				{
					"service_technician": row.service_technician,
					"full_name": full_names.get(row.service_technician),
					"is_primary": is_primary,
				},
			)
		self.primary_technician = primary

	def sync_primary_technician(self):
		"""Keep primary_technician and the primary child row on the same person."""
		rows = list(self.get("service_technicians") or [])
		chosen = None
		if self.primary_technician:
			chosen = next((row for row in rows if row.service_technician == self.primary_technician), None)
		if chosen is None:
			chosen = next((row for row in rows if row.is_primary and row.service_technician), None)
		if chosen is None:
			chosen = next((row for row in rows if row.service_technician), None)

		marked = False
		for row in rows:
			if chosen is not None and row is chosen and not marked:
				row.is_primary = 1
				marked = True
			else:
				row.is_primary = 0
		self.primary_technician = chosen.service_technician if chosen else None

	def validate_overlap(self):
		tech_ids = [
			row.service_technician
			for row in (self.get("service_technicians") or [])
			if row.service_technician
		]
		if not tech_ids:
			return

		child_parents = frappe.get_all(
			"Service Technician Item",
			filters={"service_technician": ["in", tech_ids]},
			pluck="parent",
		)
		if not child_parents:
			return

		filters = [
			["name", "!=", self.name],
			["name", "in", child_parents],
			["status", "not in", ["Closed", "Cancelled"]],
			["docstatus", "!=", 2],
			["scheduled_start_datetime", "<", self.scheduled_finish_datetime],
			["scheduled_finish_datetime", ">", self.scheduled_start_datetime],
		]

		overlapping_basic = frappe.get_all(
			"Service Appointment",
			filters=filters,
			fields=["name", "scheduled_start_datetime", "scheduled_finish_datetime"],
		)
		conflicting = [d for d in overlapping_basic if d.name != self.name]
		if conflicting:
			self_tech_ids = {d.service_technician for d in self.service_technicians}
			first = None
			first_overlap_techs = []

			for cand in conflicting:
				cand_doc = frappe.get_doc("Service Appointment", cand.name)
				cand_tech_ids = {d.service_technician for d in cand_doc.get("service_technicians")}
				common = list(self_tech_ids.intersection(cand_tech_ids))
				if common:
					first = cand
					id_to_name = {
						d.service_technician: getattr(d, "full_name", d.service_technician)
						for d in cand_doc.get("service_technicians")
					}
					first_overlap_techs = [id_to_name.get(tid, tid) for tid in common]
					break
			if not first:
				frappe.throw(_("There is an overlap with another appointment"))
				return
			tech_list = ", ".join(first_overlap_techs) if first_overlap_techs else _("assigned technicians")
			msg = _("Overlap with appointment {apt} ({start} - {end}) for technician(s): {techs}").format(
				apt=first.name,
				start=first.scheduled_start_datetime,
				end=first.scheduled_finish_datetime,
				techs=tech_list,
			)
			frappe.throw(msg)

	def set_scheduled_status(self):
		if self.status in HELD_STATUSES:
			return
		if self.get("service_technicians"):
			if not self.status or self.status in ("Open", "Unassigned"):
				self.status = "Scheduled"
		elif not self.status or self.status in ("Open", "Scheduled"):
			self.status = "Unassigned"

	def set_service_order_status(self):
		if not self.service_order or not self.get("service_technicians"):
			return
		order = frappe.get_doc("Service Order", self.service_order)
		order.status = "Scheduled"
		order.save()

	def update_service_order_status(self):
		if not self.service_order:
			return

		order = frappe.get_doc("Service Order", self.service_order)
		status_mapping = {
			"Scheduled": "Scheduled",
			"Dispatched": "Dispatched",
			"En route": "In Progress",
			"On site": "In Progress",
			"Paused": "In Progress",
			"Completed": "Review",
		}

		new_status = status_mapping.get(self.status)
		if not new_status or order.status == new_status:
			return
		# Completing the order is an explicit dispatcher action. A later visit
		# save (invoice status, reschedule) must not push it back to Review.
		if order.status == "Completed":
			return
		order.status = new_status
		order.flags.ignore_validate_update_after_submit = True
		order.save(ignore_permissions=True)

	def cancel_linked_order(self):
		if not self.service_order:
			return
		order = frappe.get_doc("Service Order", self.service_order)
		order.status = "Open"
		self.service_order = ""
		order.save()


@frappe.whitelist()
def make_appointment_from_order(source_name, target_doc=None, selected_items=None):
	mapping = {
		"Service Order": {
			"doctype": "Service Appointment",
			# service_order and customer copy on their own (link + same field name).
			# Do not reuse the order series or its Open status on the visit.
			"field_no_map": ["naming_series", "status", "amended_from"],
			"field_map": {
				"type": "service_type",
				"customer_address": "service_address",
			},
		},
		"Service Order Item": {
			"doctype": "Service Order Item",
			"field_map": {
				"item_code": "item_code",
				"description": "description",
				"qty": "qty",
				"rate": "rate",
				"amount": "amount",
				"invoice_status": "invoice_status",
			},
			"add_if_empty": True,
		},
	}
	doc = get_mapped_doc("Service Order", source_name, mapping, target_doc)
	return doc
