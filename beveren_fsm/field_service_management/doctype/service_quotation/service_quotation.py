# Copyright (c) 2025, Beveren Software and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from frappe.utils import flt


class ServiceQuotation(Document):
	def validate(self):
		self.validate_items()
		self.calculate_totals()

	def calculate_totals(self):
		total = 0.0
		for item in self.items or []:
			amount = flt(item.amount) or flt(item.qty) * flt(item.rate)
			item.amount = amount
			total += amount
		conversion = flt(self.conversion_rate) or 1
		self.total = total
		self.net_total = total
		self.grand_total = total
		self.base_total = total * conversion
		self.base_net_total = self.base_total
		self.base_grand_total = self.base_total

	def before_submit(self):
		if self.service_request:
			request = frappe.get_doc("Service Request", self.service_request)
			request.status = "Quotation"
			request.save()

	def on_cancel(self):
		self.cancel_linked_request()

	def validate_items(self):
		if not self.items:
			frappe.throw(_("Please add at least one item"))

	def cancel_linked_request(self):
		if not self.service_request:
			return
		request = frappe.get_doc("Service Request", self.service_request)
		request.status = "Open"
		self.service_request = ""
		request.save()


@frappe.whitelist()
def make_service_quotation(source_name, target_doc=None, selected_items=None):
	mapping = {
		"Service Request": {
			"doctype": "Service Quotation",
			# Keep the quotation's own series and Open status. Same-named fields
			# would otherwise copy SR-.YYYY.- and a Due Soon/Overdue status.
			"field_no_map": ["naming_series", "status", "amended_from"],
			"field_map": {
				"name": "service_request",
				"customer": "party_name",
				"company": "company",
				"posting_date": "posting_date",
				"due_date": "due_date",
				"customer_address": "service_address",
				"cost_center": "cost_center",
				"project": "project",
				"currency": "currency",
				"serial_no": "serial_no",
				"preferred_date_1": "preferred_date_1",
				"preferred_time": "preferred_time",
				"preference_note": "preference_note",
			},
		}
	}
	doc = get_mapped_doc("Service Request", source_name, mapping, target_doc)
	return doc
