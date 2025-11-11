# Copyright (c) 2025, Beveren Software and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from frappe.utils import flt, today


class ServiceOrder(Document):
	def validate(self):
		self.set_in_words()
		self.validate_items()
		self.calculate_service_totals()
		self.check_amc_budget()

	def before_submit(self):
		self.update_linked_doc_status_before_submit()

	def on_update_after_submit(self):
		self.update_linked_doc_status_after_submit()

	def on_submit(self):
		self.update_amc_contract_utilization()

	def on_cancel(self):
		self.revert_amc_contract_utilization()
		self.cancel_linked_request()
		self.cancel_linked_quotation()

	def validate_items(self):
		if not self.get("items"):
			frappe.throw(_("Please add at least one item"))

	def update_linked_doc_status_before_submit(self):
		if not self.service_quotation and not self.service_request:
			return
		if self.service_request and self.service_quotation:
			quotation = frappe.get_doc("Service Quotation", self.service_quotation)
			request = frappe.get_doc("Service Request", self.service_request)
			# Convert Request
			request.status = "Converted"
			request.save()
			# Order Quote
			quotation.status = "Ordered"
			quotation.save()
		elif self.service_request and not self.service_quotation:
			request = frappe.get_doc("Service Request", self.service_request)
			request.status = "Converted"
			request.save()
		elif self.service_quotation and not self.service_request:
			quotation = frappe.get_doc("Service Quotation", self.service_quotation)
			quotation.status = "Ordered"
			quotation.save()

	def update_linked_doc_status_after_submit(self):
		if not self.service_quotation:
			return
		quotation = frappe.get_doc("Service Quotation", self.service_quotation)
		is_allowed_status = self.status in ["Scheduled", "Dispatched", "In Progress", "Completed", "Review"]
		quotation_not_converted = quotation.status != "Converted"
		if is_allowed_status and quotation_not_converted:
			quotation.status = "Converted"
			quotation.save()

	def cancel_linked_quotation(self):
		if not self.service_quotation:
			return
		quote = frappe.get_doc("Service Quotation", self.service_quotation)
		quote.status = "Open"
		self.service_quotation = ""
		quote.save()

	def cancel_linked_request(self):
		if not self.service_request:
			return
		request = frappe.get_doc("Service Request", self.service_request)
		request.status = "Open"
		self.service_request = ""
		request.save()

	@frappe.whitelist()
	def create_appointment(self, service_order):
		appointment = frappe.new_doc("Service Appointment")
		appointment.service_order = service_order
		appointment.customer = self.customer

		for item in self.items:
			appointment.append(
				"items",
				{
					"item_code": item.item_code,
					"qty": item.qty,
					"rate": item.rate,
					"amount": item.amount,
					"invoice_status": item.invoice_status,
				},
			)
		appointment.insert()
		return appointment.name

	def set_in_words(self):
		from frappe.utils import money_in_words

		self.in_words = money_in_words(self.grand_total, self.currency)
		self.base_in_words = money_in_words(
			self.base_grand_total, frappe.get_cached_value("Company", self.company, "default_currency")
		)

	def calculate_service_totals(self):
		service_total = 0.0
		spareparts_total = 0.0

		for item in self.items or []:
			item_group = (getattr(item, "item_group", "") or "").strip().lower()
			if item_group in {"service", "services"}:
				item.is_service = 1

			amount = flt(getattr(item, "amount", 0))
			if getattr(item, "is_service", 0):
				service_total += amount
			else:
				spareparts_total += amount

		self.service_total = service_total
		self.spareparts_total = spareparts_total

	def check_amc_budget(self):
		self.is_over_budget = 0

		if not self.amc_contract:
			return

		fields = [
			"service_budget",
			"spare_parts_budget",
			"service_utilized",
			"spare_parts_utilized",
		]
		contract = frappe.db.get_value("AMC Contract", self.amc_contract, fields, as_dict=True) or {}

		service_budget = flt(contract.get("service_budget"))
		spare_budget = flt(contract.get("spare_parts_budget"))
		service_utilized = flt(contract.get("service_utilized"))
		spare_utilized = flt(contract.get("spare_parts_utilized"))

		projected_service = service_utilized + flt(self.service_total)
		projected_spare = spare_utilized + flt(self.spareparts_total)

		over_service = service_budget and projected_service > service_budget
		over_spare = spare_budget and projected_spare > spare_budget

		if over_service or over_spare:
			self.is_over_budget = 1

	def update_amc_contract_utilization(self):
		if not self.amc_contract:
			return

		contract = frappe.get_doc("AMC Contract", self.amc_contract)

		contract.service_utilized = flt(contract.service_utilized) + flt(self.service_total)
		contract.spare_parts_utilized = flt(contract.spare_parts_utilized) + flt(self.spareparts_total)
		contract.service_order_reference = self.name

		contract.save(ignore_permissions=True)

	def revert_amc_contract_utilization(self):
		if not self.amc_contract:
			return

		contract = frappe.get_doc("AMC Contract", self.amc_contract)

		contract.service_utilized = max(0, flt(contract.service_utilized) - flt(self.service_total))
		contract.spare_parts_utilized = max(
			0, flt(contract.spare_parts_utilized) - flt(self.spareparts_total)
		)
		contract.service_order_reference = ""

		contract.save(ignore_permissions=True)


@frappe.whitelist()
def make_stock_entry(service_order: str):
	order = frappe.get_doc("Service Order", service_order)

	stock_entry = frappe.new_doc("Stock Entry")
	stock_entry.stock_entry_type = "Material Transfer"
	stock_entry.company = order.company
	stock_entry.posting_date = today()
	stock_entry.remarks = _("Generated from Service Order {0}").format(order.name)

	for item in order.items or []:
		stock_entry.append(
			"items",
			{
				"item_code": item.item_code,
				"item_name": getattr(item, "item_name", None),
				"description": getattr(item, "description", None),
				"qty": item.qty,
				"transfer_qty": item.qty,
				"uom": getattr(item, "uom", None) or getattr(item, "stock_uom", None),
				"stock_uom": getattr(item, "stock_uom", None) or getattr(item, "uom", None),
				"conversion_factor": 1,
				"sales_order": order.name,
				"serial_no": getattr(item, "serial_no", None),
				"s_warehouse": getattr(item, "s_warehouse", None),
				"t_warehouse": getattr(item, "t_warehouse", None),
			},
		)

	return stock_entry.as_dict()


@frappe.whitelist()
def make_delivery_note(service_order: str):
	order = frappe.get_doc("Service Order", service_order)

	delivery_note = frappe.new_doc("Delivery Note")
	delivery_note.company = order.company
	delivery_note.posting_date = today()
	delivery_note.customer = order.customer
	delivery_note.customer_address = order.customer_address
	delivery_note.contact_person = order.customer_contact
	delivery_note.tc_name = getattr(order, "tc_name", None)
	delivery_note.terms = getattr(order, "terms", None)

	for item in order.items or []:
		delivery_note.append(
			"items",
			{
				"item_code": item.item_code,
				"item_name": getattr(item, "item_name", None),
				"description": getattr(item, "description", None),
				"qty": item.qty,
				"uom": getattr(item, "uom", None),
				"conversion_factor": 1,
				"rate": getattr(item, "rate", None),
				"amount": getattr(item, "amount", None),
				"warehouse": getattr(item, "warehouse", None),
				"serial_no": getattr(item, "serial_no", None),
				"against_sales_order": order.name,
			},
		)

	return delivery_note.as_dict()


@frappe.whitelist()
def make_purchase_receipt(service_order: str):
	order = frappe.get_doc("Service Order", service_order)

	if not order.service_request:
		frappe.throw(_("Service Order {0} is not linked to a Service Request").format(order.name))

	service_request = frappe.get_doc("Service Request", order.service_request)

	if not service_request.repair_vendor:
		frappe.throw(
			_("Please set a Repair Vendor on Service Request {0} before creating a Purchase Receipt.").format(
				service_request.name
			)
		)

	purchase_receipt = frappe.new_doc("Purchase Receipt")
	purchase_receipt.company = order.company
	purchase_receipt.posting_date = today()
	purchase_receipt.supplier = service_request.repair_vendor
	purchase_receipt.supplier_address = service_request.customer_address
	purchase_receipt.tc_name = getattr(order, "tc_name", None)
	purchase_receipt.terms = getattr(order, "terms", None)

	for item in order.items or []:
		purchase_receipt.append(
			"items",
			{
				"item_code": item.item_code,
				"item_name": getattr(item, "item_name", None),
				"description": getattr(item, "description", None),
				"qty": item.qty,
				"uom": getattr(item, "uom", None),
				"conversion_factor": 1,
				"rate": getattr(item, "rate", None),
				"amount": getattr(item, "amount", None),
				"sales_order": order.name,
				"warehouse": getattr(item, "warehouse", None),
				"serial_no": getattr(item, "serial_no", None),
			},
		)

	return purchase_receipt.as_dict()


@frappe.whitelist()
def record_product_movement(
	service_order: str,
	movement_type: str,
	movement_date: str | None = None,
	from_location: str | None = None,
	to_location: str | None = None,
	linked_document_type: str | None = None,
	linked_document: str | None = None,
):
	if not movement_type:
		frappe.throw(_("Movement type is required"))

	order = frappe.get_doc("Service Order", service_order)

	if not order.service_request:
		frappe.throw(_("Service Order {0} is not linked to a Service Request").format(order.name))

	service_request = frappe.get_doc("Service Request", order.service_request)

	row = {
		"movement_type": movement_type,
		"movement_date": movement_date or today(),
		"from_location": from_location,
		"to_location": to_location,
		"handled_by": frappe.session.user,
	}

	if linked_document and linked_document_type:
		row["linked_document_type"] = linked_document_type
		row["linked_document"] = linked_document

	entry = service_request.append("product_movement", row)

	if to_location:
		service_request.current_product_location = to_location

	service_request.save(ignore_permissions=True)

	return entry.name


@frappe.whitelist()
def make_order_from_request(source_name, target_doc=None, selected_items=None):
	mapping = {
		"Service Request": {
			"doctype": "Service Order",
			"field_map": {
				"name": "service_request",
				"customer": "customer",
				"company": "company",
				"posting_date": "posting_date",
				"due_date": "due_date",
				"customer_address": "customer_address",
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


@frappe.whitelist()
def make_order_from_quote(source_name, target_doc=None, selected_items=None):
	mapping = {
		"Service Quotation": {
			"doctype": "Service Order",
			"field_map": {
				"name": "service_quotation",
				"party_name": "customer",
				"company": "company",
				"type": "type",
				"priority": "priority",
				"due_date": "due_date",
				"service_address": "customer_address",
				"cost_center": "cost_center",
				"project": "project",
				"currency": "currency",
				"serial_no": "serial_no",
				"preferred_date_1": "preferred_date_1",
				"preferred_time": "preferred_time",
				"preference_note": "preference_note",
			},
		},
		"Service Quotation Item": {
			"doctype": "Service Order Item",
			"field_map": {
				"item_code": "item_code",
				"description": "description",
				"qty": "qty",
				"rate": "rate",
				"amount": "amount",
			},
			"add_if_empty": True,
		},
	}
	doc = get_mapped_doc("Service Quotation", source_name, mapping, target_doc)
	return doc
