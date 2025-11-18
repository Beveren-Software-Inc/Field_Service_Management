# Copyright (c) 2025, Beveren Software and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from frappe.utils import flt, getdate, today

LOCATION_STATUS_MAP = {
	"delivered to customer": "Review",
	"deliver to customer": "Review",  # fallback for legacy value
	"receive from vendor": "In Progress",
	"receive from customer": "In Progress",
	"received from customer": "In Progress",
	"sent to vendor": "In Progress",
	"send to vendor": "In Progress",
}


def _set_status_from_location(order, location):
	if not location:
		return False

	normalized_location = location.strip().lower()
	new_status = LOCATION_STATUS_MAP.get(normalized_location)

	if new_status and order.status != new_status:
		order.status = new_status
		return True

	return False


class ServiceOrder(Document):
	def validate(self):
		self.ensure_default_product_location()
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

	def ensure_default_product_location(self):
		if not self.product_location:
			default_location = (
				frappe.db.get_value("Product Location", {"name": "Customer Site"}, "destination")
				or "Customer Site"
			)
			self.product_location = default_location

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
def make_stock_entry(service_order: str, items=None, product_location: str | None = None):
	order = frappe.get_doc("Service Order", service_order)

	stock_entry = frappe.new_doc("Stock Entry")
	location = (product_location or "").strip().lower()
	if location == "receive from customer":
		stock_entry.stock_entry_type = "Material Receipt"
	else:
		stock_entry.stock_entry_type = "Material Transfer"
	stock_entry.company = order.company
	stock_entry.posting_date = today()
	stock_entry.remarks = _("Generated from Service Order {0}").format(order.name)
	stock_entry.custom_service_order = order.name
	if product_location:
		stock_entry.custom_current_product_location = product_location

	order_item_map = {item.item_code: item for item in order.items or []}

	if items:
		try:
			items = frappe.parse_json(items)
		except Exception:
			pass
	else:
		items = []
		for item in order.items or []:
			if getattr(item, "is_service", 0):
				continue
			items.append(
				{
					"item_code": item.item_code,
					"qty": item.qty,
					"max_qty": item.qty,
					"s_warehouse": item.get("s_warehouse") or item.get("warehouse"),
					"t_warehouse": item.get("t_warehouse"),
				}
			)

	if not items:
		frappe.throw(_("No stock items available to transfer."))

	selected = []
	for row in items:
		item_code = row.get("item_code")
		if not item_code:
			continue
		order_row = order_item_map.get(item_code)

		# If item not in order.items, it might be the primary item from header
		# Create a minimal order_row object for it
		if not order_row:
			# Check if this is the primary item from Service Order header
			if order.item_code == item_code:
				# Create a minimal order_row-like object
				class MinimalOrderRow:
					def __init__(self, order):
						self.item_code = order.item_code
						self.item_name = getattr(order, "item_name", None) or item_code
						self.description = getattr(order, "description", None)
						self.uom = getattr(order, "uom", None)
						self.stock_uom = getattr(order, "stock_uom", None)
						self.serial_no = getattr(order, "serial_no", None)
						self.is_service = 0

					def get(self, key, default=None):
						return getattr(self, key, default)

				order_row = MinimalOrderRow(order)
			else:
				# Item not found and not primary item, skip it
				continue

		if getattr(order_row, "is_service", 0):
			continue

		qty = flt(row.get("qty") or 0)
		if qty <= 0:
			continue

		max_qty = flt(row.get("max_qty") or getattr(order_row, "qty", 1))
		if qty > max_qty:
			frappe.throw(_("Quantity for item {0} cannot exceed {1}.").format(item_code, max_qty))

		selected.append(
			(
				order_row,
				{
					"item_code": item_code,
					"qty": qty,
					"s_warehouse": row.get("s_warehouse")
					or getattr(order_row, "s_warehouse", None)
					or getattr(order_row, "warehouse", None)
					or getattr(order, "warehouse", None),
					"t_warehouse": row.get("t_warehouse") or getattr(order_row, "t_warehouse", None),
					"serial_no": row.get("serial_no") or getattr(order_row, "serial_no", None),
				},
			)
		)

	if not selected:
		frappe.throw(_("No stock items were selected for transfer."))

	for order_row, data in selected:
		# Get serial_no from row data or order_row
		serial_no = data.get("serial_no") or getattr(order_row, "serial_no", None)

		# Get uom and stock_uom from order_row or fetch from Item master
		uom = getattr(order_row, "uom", None)
		stock_uom = getattr(order_row, "stock_uom", None)

		if not stock_uom or not uom:
			# Fetch from Item master if not available
			try:
				item_doc = frappe.get_cached_doc("Item", data["item_code"])
				if not stock_uom:
					stock_uom = item_doc.stock_uom
				if not uom:
					uom = item_doc.stock_uom  # Default to stock_uom if uom not set
			except Exception:
				# Fallback values
				if not stock_uom:
					stock_uom = uom or "Nos"
				if not uom:
					uom = stock_uom or "Nos"

		stock_entry.append(
			"items",
			{
				"item_code": data["item_code"],
				"item_name": getattr(order_row, "item_name", None),
				"description": getattr(order_row, "description", None),
				"qty": data["qty"],
				"transfer_qty": data["qty"],
				"uom": uom or stock_uom,
				"stock_uom": stock_uom or uom,
				"conversion_factor": 1,
				"sales_order": order.name,
				"serial_no": serial_no,
				"s_warehouse": data.get("s_warehouse"),
				"t_warehouse": data.get("t_warehouse"),
			},
		)

	return stock_entry.as_dict()


@frappe.whitelist()
def make_delivery_note(service_order: str, items=None, product_location: str | None = None):
	order = frappe.get_doc("Service Order", service_order)

	delivery_note = frappe.new_doc("Delivery Note")
	delivery_note.company = order.company
	delivery_note.posting_date = today()
	delivery_note.customer = order.customer
	delivery_note.customer_address = order.customer_address
	delivery_note.contact_person = order.customer_contact
	delivery_note.tc_name = getattr(order, "tc_name", None)
	delivery_note.terms = getattr(order, "terms", None)
	delivery_note.custom_service_order = order.name
	if product_location:
		delivery_note.custom_current_product_location = product_location

	order_item_map = {item.item_code: item for item in order.items or []}

	if items:
		try:
			items = frappe.parse_json(items)
		except Exception:
			pass
	else:
		items = []
		for item in order.items or []:
			if getattr(item, "is_service", 0):
				continue
			items.append(
				{
					"item_code": item.item_code,
					"qty": item.qty,
					"max_qty": item.qty,
					"warehouse": item.get("warehouse"),
				}
			)

	if not items:
		frappe.throw(_("No items selected for delivery."))

	selected = []
	for row in items:
		item_code = row.get("item_code")
		if not item_code:
			continue
		order_row = order_item_map.get(item_code)
		if not order_row:
			primary_item_code = (order.item_code or "").strip()
			if primary_item_code and primary_item_code == (item_code or "").strip():
				order_row = frappe._dict(
					{
						"item_code": order.item_code,
						"item_name": order.item_name,
						"description": getattr(order, "description", None),
						"qty": 1,
						"uom": row.get("uom") or getattr(order, "uom", None),
						"stock_uom": row.get("stock_uom") or getattr(order, "stock_uom", None),
						"rate": row.get("rate"),
						"warehouse": row.get("warehouse") or getattr(order, "warehouse", None),
						"serial_no": row.get("serial_no") or getattr(order, "serial_no", None),
					}
				)
			else:
				continue

		qty = flt(row.get("qty") or 0)
		if qty <= 0:
			continue

		max_qty = flt(row.get("max_qty") or order_row.qty)
		if qty > max_qty:
			frappe.throw(_("Quantity for item {0} cannot exceed {1}.").format(item_code, max_qty))

		selected.append(
			(
				order_row,
				{
					"item_code": item_code,
					"qty": qty,
					"warehouse": row.get("warehouse") or order_row.get("warehouse"),
					"serial_no": row.get("serial_no") or order_row.get("serial_no"),
					"uom": row.get("uom") or order_row.get("uom"),
					"stock_uom": row.get("stock_uom") or order_row.get("stock_uom"),
				},
			)
		)

	if not selected:
		frappe.throw(_("No items were selected for delivery."))

	for order_row, data in selected:
		# Get stock_uom from order_row or fetch from Item if not available
		stock_uom = getattr(order_row, "stock_uom", None)
		if not stock_uom:
			# Fetch from Item master if not in order_row
			try:
				item_doc = frappe.get_cached_doc("Item", data["item_code"])
				stock_uom = item_doc.stock_uom
			except Exception:
				# Fallback to uom if stock_uom not found
				stock_uom = getattr(order_row, "uom", None) or "Nos"

		delivery_note.append(
			"items",
			{
				"item_code": data["item_code"],
				"item_name": getattr(order_row, "item_name", None),
				"description": getattr(order_row, "description", None),
				"qty": data["qty"],
				"uom": data.get("uom") or getattr(order_row, "uom", None) or stock_uom,
				"stock_uom": data.get("stock_uom") or stock_uom,
				"conversion_factor": 1,
				"rate": getattr(order_row, "rate", None),
				"amount": flt(order_row.rate) * data["qty"]
				if getattr(order_row, "rate", None) is not None
				else None,
				"warehouse": data.get("warehouse"),
				"serial_no": data.get("serial_no") or getattr(order_row, "serial_no", None),
			},
		)

	return delivery_note.as_dict()


@frappe.whitelist()
def make_purchase_receipt(service_order: str, items=None, product_location: str | None = None):
	order = frappe.get_doc("Service Order", service_order)

	service_request = None
	if order.service_request:
		try:
			service_request = frappe.get_doc("Service Request", order.service_request)
		except frappe.DoesNotExistError:
			service_request = None

	# if not service_request.repair_vendor:
	# 	frappe.throw(
	# 		_("Please set a Repair Vendor on Service Request {0} before creating a Purchase Receipt.").format(
	# 			service_request.name
	# 		)
	# 	)

	purchase_receipt = frappe.new_doc("Purchase Receipt")
	purchase_receipt.company = order.company
	purchase_receipt.posting_date = today()
	purchase_receipt.supplier = getattr(order, "repair_vendor", None) or getattr(
		service_request, "repair_vendor", None
	)
	purchase_receipt.supplier_address = getattr(order, "supplier_address", None) or getattr(
		service_request, "customer_address", None
	)
	purchase_receipt.tc_name = getattr(order, "tc_name", None)
	purchase_receipt.terms = getattr(order, "terms", None)
	purchase_receipt.custom_service_order = order.name
	if product_location:
		purchase_receipt.custom_current_product_location = product_location

	order_item_map = {item.item_code: item for item in order.items or []}

	if items:
		try:
			items = frappe.parse_json(items)
		except Exception:
			pass
	else:
		items = []
		for item in order.items or []:
			if getattr(item, "is_service", 0):
				continue
			items.append(
				{
					"item_code": item.item_code,
					"qty": item.qty,
					"max_qty": item.qty,
					"rate": getattr(item, "rate", None),
					"amount": getattr(item, "amount", None),
					"warehouse": item.get("warehouse"),
				}
			)

	if not items:
		frappe.throw(_("No items selected for the Purchase Receipt."))

	selected = []
	for row in items:
		item_code = row.get("item_code")
		if not item_code:
			continue
		order_row = order_item_map.get(item_code)

		# If item not in order.items, it might be the primary item from header
		# Create a minimal order_row object for it
		if not order_row:
			# Check if this is the primary item from Service Order header
			if order.item_code == item_code:
				# Create a minimal order_row-like object
				class MinimalOrderRow:
					def __init__(self, order):
						self.item_code = order.item_code
						self.item_name = getattr(order, "item_name", None) or item_code
						self.description = getattr(order, "description", None)
						self.uom = getattr(order, "uom", None)
						self.stock_uom = getattr(order, "stock_uom", None)
						self.serial_no = getattr(order, "serial_no", None)
						self.is_service = 0
						self.qty = 1
						self.rate = 0

					def get(self, key, default=None):
						return getattr(self, key, default)

				order_row = MinimalOrderRow(order)
			else:
				# Item not found and not primary item, skip it
				continue

		qty = flt(row.get("qty") or 0)
		if qty <= 0:
			continue

		max_qty = flt(row.get("max_qty") or getattr(order_row, "qty", 1))
		if qty > max_qty:
			frappe.throw(_("Quantity for item {0} cannot exceed {1}.").format(item_code, max_qty))

		selected.append(
			(
				order_row,
				{
					"item_code": item_code,
					"qty": qty,
					"rate": flt(
						row.get("rate") if row.get("rate") is not None else getattr(order_row, "rate", 0)
					),
					"amount": flt(row.get("amount") if row.get("amount") is not None else 0),
					"warehouse": row.get("warehouse")
					or getattr(order_row, "warehouse", None)
					or getattr(order, "warehouse", None),
					"serial_no": row.get("serial_no") or getattr(order_row, "serial_no", None),
					"uom": row.get("uom") or getattr(order_row, "uom", None),
					"stock_uom": row.get("stock_uom") or getattr(order_row, "stock_uom", None),
				},
			)
		)

	if not selected:
		frappe.throw(_("No items were selected for the Purchase Receipt."))

	for order_row, data in selected:
		rate = data.get("rate", 0)
		if rate == 0 and getattr(order_row, "rate", None):
			rate = flt(order_row.rate)
		amount = data.get("amount")
		if not amount:
			amount = rate * data["qty"]

		# Get serial_no from row data or order_row
		serial_no = data.get("serial_no") or getattr(order_row, "serial_no", None)

		# Get uom and stock_uom from data, order_row, or fetch from Item master
		uom = data.get("uom") or getattr(order_row, "uom", None)
		stock_uom = data.get("stock_uom") or getattr(order_row, "stock_uom", None)

		if not stock_uom or not uom:
			# Fetch from Item master if not available
			try:
				item_doc = frappe.get_cached_doc("Item", data["item_code"])
				if not stock_uom:
					stock_uom = item_doc.stock_uom
				if not uom:
					uom = item_doc.stock_uom  # Default to stock_uom if uom not set
			except Exception:
				# Fallback values
				if not stock_uom:
					stock_uom = uom or "Nos"
				if not uom:
					uom = stock_uom or "Nos"

		purchase_receipt.append(
			"items",
			{
				"item_code": data["item_code"],
				"item_name": getattr(order_row, "item_name", None),
				"description": getattr(order_row, "description", None),
				"qty": data["qty"],
				"uom": uom or stock_uom,
				"stock_uom": stock_uom or uom,
				"conversion_factor": 1,
				"rate": rate,
				"amount": amount,
				"warehouse": data.get("warehouse"),
				"serial_no": serial_no,
			},
		)

	return purchase_receipt.as_dict()


@frappe.whitelist()
def make_purchase_order(service_order: str, items=None, product_location: str | None = None):
	order = frappe.get_doc("Service Order", service_order)

	service_request = None
	if order.service_request:
		try:
			service_request = frappe.get_doc("Service Request", order.service_request)
		except frappe.DoesNotExistError:
			service_request = None

	# if not service_request.repair_vendor:
	# 	frappe.throw(
	# 		_("Please set a Repair Vendor on Service Request {0} before creating a Purchase Order.").format(
	# 			service_request.name
	# 		)
	# 	)

	purchase_order = frappe.new_doc("Purchase Order")
	purchase_order.company = order.company
	purchase_order.transaction_date = today()
	purchase_order.schedule_date = today()
	purchase_order.supplier = getattr(order, "repair_vendor", None) or getattr(
		service_request, "repair_vendor", None
	)
	purchase_order.tc_name = getattr(order, "tc_name", None)
	purchase_order.terms = getattr(order, "terms", None)
	purchase_order.custom_service_order = order.name
	if product_location:
		purchase_order.custom_current_product_location = product_location

	order_item_map = {item.item_code: item for item in order.items or []}

	if items:
		try:
			items = frappe.parse_json(items)
		except Exception:
			pass
	else:
		items = []
		for item in order.items or []:
			items.append(
				{
					"item_code": item.item_code,
					"qty": item.qty,
					"max_qty": item.qty,
					"rate": getattr(item, "rate", None),
					"amount": getattr(item, "amount", None),
					"warehouse": item.get("warehouse"),
					"cost_center": item.get("cost_center"),
				}
			)

	if not items:
		frappe.throw(_("No items selected for the Purchase Order."))

	selected = []
	for row in items:
		item_code = row.get("item_code")
		if not item_code:
			continue
		order_row = order_item_map.get(item_code)

		# If item not in order.items, it might be the primary item from header
		# Create a minimal order_row object for it
		if not order_row:
			# Check if this is the primary item from Service Order header
			if order.item_code == item_code:
				# Create a minimal order_row-like object
				class MinimalOrderRow:
					def __init__(self, order):
						self.item_code = order.item_code
						self.item_name = getattr(order, "item_name", None) or item_code
						self.description = getattr(order, "description", None)
						self.uom = getattr(order, "uom", None)
						self.stock_uom = getattr(order, "stock_uom", None)
						self.serial_no = getattr(order, "serial_no", None)
						self.is_service = 0
						self.qty = 1
						self.rate = 0

					def get(self, key, default=None):
						return getattr(self, key, default)

				order_row = MinimalOrderRow(order)
			else:
				# Item not found and not primary item, skip it
				continue

		qty = flt(row.get("qty") or 0)
		if qty <= 0:
			continue

		max_qty = flt(row.get("max_qty") or getattr(order_row, "qty", 1))
		if qty > max_qty:
			frappe.throw(_("Quantity for item {0} cannot exceed {1}.").format(item_code, max_qty))

		selected.append(
			(
				order_row,
				{
					"item_code": item_code,
					"qty": qty,
					"rate": flt(
						row.get("rate") if row.get("rate") is not None else getattr(order_row, "rate", 0)
					),
					"amount": flt(row.get("amount") if row.get("amount") is not None else 0),
					"warehouse": row.get("warehouse")
					or getattr(order_row, "warehouse", None)
					or getattr(order, "warehouse", None),
					"cost_center": row.get("cost_center")
					or getattr(order_row, "cost_center", None)
					or getattr(order, "cost_center", None),
					"serial_no": row.get("serial_no") or getattr(order_row, "serial_no", None),
				},
			)
		)

	if not selected:
		frappe.throw(_("No items were selected for the Purchase Order."))

	for order_row, data in selected:
		rate = data.get("rate", 0)
		if rate == 0 and getattr(order_row, "rate", None):
			rate = flt(order_row.rate)
		amount = data.get("amount")
		if not amount:
			amount = rate * data["qty"]

		# Get uom and stock_uom from order_row or fetch from Item master
		uom = getattr(order_row, "uom", None)
		stock_uom = getattr(order_row, "stock_uom", None)

		if not stock_uom or not uom:
			# Fetch from Item master if not available
			try:
				item_doc = frappe.get_cached_doc("Item", data["item_code"])
				if not stock_uom:
					stock_uom = item_doc.stock_uom
				if not uom:
					uom = item_doc.stock_uom  # Default to stock_uom if uom not set
			except Exception:
				# Fallback values
				if not stock_uom:
					stock_uom = uom or "Nos"
				if not uom:
					uom = stock_uom or "Nos"

		_po_item = purchase_order.append(
			"items",
			{
				"item_code": data["item_code"],
				"item_name": getattr(order_row, "item_name", None),
				"description": getattr(order_row, "description", None),
				"qty": data["qty"],
				"schedule_date": today(),
				"uom": uom or stock_uom,
				"stock_uom": stock_uom or uom,
				"conversion_factor": 1,
				"rate": rate,
				"amount": amount,
				"warehouse": data.get("warehouse"),
				"cost_center": data.get("cost_center"),
			},
		)

	return purchase_order.as_dict()


@frappe.whitelist()
def make_purchase_invoice(service_order: str, items=None, product_location: str | None = None):
	order = frappe.get_doc("Service Order", service_order)

	service_request = None
	if order.service_request:
		try:
			service_request = frappe.get_doc("Service Request", order.service_request)
		except frappe.DoesNotExistError:
			service_request = None

	# if not service_request.repair_vendor:
	# 	frappe.throw(
	# 		_("Please set a Repair Vendor on Service Request {0} before creating a Purchase Invoice.").format(
	# 			service_request.name
	# 		)
	# 	)

	purchase_invoice = frappe.new_doc("Purchase Invoice")
	purchase_invoice.company = order.company
	purchase_invoice.posting_date = today()
	purchase_invoice.supplier = getattr(order, "repair_vendor", None) or getattr(
		service_request, "repair_vendor", None
	)
	purchase_invoice.tc_name = getattr(order, "tc_name", None)
	purchase_invoice.terms = getattr(order, "terms", None)
	purchase_invoice.custom_service_order = order.name
	if product_location:
		purchase_invoice.custom_current_product_location = product_location

	order_item_map = {item.item_code: item for item in order.items or []}

	if items:
		try:
			items = frappe.parse_json(items)
		except Exception:
			pass
	else:
		items = []
		for item in order.items or []:
			items.append(
				{
					"item_code": item.item_code,
					"qty": item.qty,
					"max_qty": item.qty,
					"rate": getattr(item, "rate", None),
					"amount": getattr(item, "amount", None),
					"warehouse": item.get("warehouse"),
					"cost_center": item.get("cost_center"),
					"expense_account": item.get("expense_account"),
				}
			)

	if not items:
		frappe.throw(_("No items selected for the Purchase Invoice."))

	default_expense_account = frappe.get_cached_value("Company", order.company, "default_expense_account")

	selected = []
	for row in items:
		item_code = row.get("item_code")
		if not item_code:
			continue
		order_row = order_item_map.get(item_code)

		# If item not in order.items, it might be the primary item from header
		# Create a minimal order_row object for it
		if not order_row:
			# Check if this is the primary item from Service Order header
			if order.item_code == item_code:
				# Create a minimal order_row-like object
				class MinimalOrderRow:
					def __init__(self, order):
						self.item_code = order.item_code
						self.item_name = getattr(order, "item_name", None) or item_code
						self.description = getattr(order, "description", None)
						self.uom = getattr(order, "uom", None)
						self.stock_uom = getattr(order, "stock_uom", None)
						self.serial_no = getattr(order, "serial_no", None)
						self.is_service = 0
						self.qty = 1
						self.rate = 0

					def get(self, key, default=None):
						return getattr(self, key, default)

				order_row = MinimalOrderRow(order)
			else:
				# Item not found and not primary item, skip it
				continue

		qty = flt(row.get("qty") or 0)
		if qty <= 0:
			continue

		max_qty = flt(row.get("max_qty") or getattr(order_row, "qty", 1))
		if qty > max_qty:
			frappe.throw(_("Quantity for item {0} cannot exceed {1}.").format(item_code, max_qty))

		selected.append(
			(
				order_row,
				{
					"item_code": item_code,
					"qty": qty,
					"rate": flt(
						row.get("rate") if row.get("rate") is not None else getattr(order_row, "rate", 0)
					),
					"amount": flt(row.get("amount") if row.get("amount") is not None else 0),
					"warehouse": row.get("warehouse")
					or getattr(order_row, "warehouse", None)
					or getattr(order, "warehouse", None),
					"cost_center": row.get("cost_center")
					or getattr(order_row, "cost_center", None)
					or getattr(order, "cost_center", None),
					"expense_account": row.get("expense_account")
					or getattr(order_row, "expense_account", None)
					or default_expense_account,
					"serial_no": row.get("serial_no") or getattr(order_row, "serial_no", None),
				},
			)
		)

	if not selected:
		frappe.throw(_("No items were selected for the Purchase Invoice."))

	if not default_expense_account:
		# Ensure we have one before iterating
		default_expense_account = frappe.get_cached_value("Company", order.company, "default_expense_account")

	for order_row, data in selected:
		rate = data.get("rate", 0)
		if rate == 0 and getattr(order_row, "rate", None):
			rate = flt(order_row.rate)
		amount = data.get("amount")
		if not amount:
			amount = rate * data["qty"]

		expense_account = data.get("expense_account")
		if not expense_account:
			frappe.throw(_("Please set an Expense Account for item {0}.").format(data["item_code"]))

		# Get uom from order_row or fetch from Item master
		uom = getattr(order_row, "uom", None)

		if not uom:
			# Fetch from Item master if not available
			try:
				item_doc = frappe.get_cached_doc("Item", data["item_code"])
				uom = item_doc.stock_uom
			except Exception:
				# Fallback value
				uom = "Nos"

		_pi_item = purchase_invoice.append(
			"items",
			{
				"item_code": data["item_code"],
				"item_name": getattr(order_row, "item_name", None),
				"description": getattr(order_row, "description", None),
				"qty": data["qty"],
				"uom": uom,
				"conversion_factor": 1,
				"rate": rate,
				"amount": amount,
				"warehouse": data.get("warehouse"),
				"cost_center": data.get("cost_center"),
				"expense_account": expense_account,
			},
		)

	return purchase_invoice.as_dict()


@frappe.whitelist()
def record_product_movement(
	service_order: str,
	movement_type: str | None = None,
	movement_date: str | None = None,
	linked_document_type: str | None = None,
	linked_document: str | None = None,
	product_location: str | None = None,
):
	location = product_location or movement_type
	if not location:
		frappe.throw(_("Product location is required"))

	order = frappe.get_doc("Service Order", service_order)

	row = {
		"movement_type": location,
		"movement_date": movement_date or today(),
		"handled_by": frappe.session.user,
	}

	if linked_document and linked_document_type:
		row["linked_document_type"] = linked_document_type
		row["linked_document"] = linked_document

	entry = order.append("product_movement", row)
	row_destination = entry.destination or location

	# Update Service Order fields
	order.current_product_location = location
	order.product_location = row_destination
	_set_status_from_location(order, row_destination)
	order.save(ignore_permissions=True)

	# Keep Service Request in sync when available
	if order.service_request:
		try:
			service_request = frappe.get_doc("Service Request", order.service_request)
			service_request.current_product_location = row_destination
			if hasattr(service_request, "product_movement"):
				# legacy compatibility: mirror entry if table still exists
				service_request.append(
					"product_movement",
					{
						"movement_type": row_destination,
						"movement_date": entry.movement_date,
						"linked_document_type": entry.linked_document_type,
						"linked_document": entry.linked_document,
						"handled_by": entry.handled_by,
					},
				)
			service_request.save(ignore_permissions=True)
		except frappe.DoesNotExistError:
			pass

	return entry.name


def update_product_movement_on_submit(doc, method):
	"""
	Update product movement entry with linked document information on submit.
	This is called from doc_events hooks when documents are submitted.
	"""
	# Check if document has custom_current_product_location and custom_service_order
	if not hasattr(doc, "custom_current_product_location") or not doc.custom_current_product_location:
		return

	if not hasattr(doc, "custom_service_order") or not doc.custom_service_order:
		return

	# Get Service Order
	try:
		order = frappe.get_doc("Service Order", doc.custom_service_order)
	except frappe.DoesNotExistError:
		return

	product_location = doc.custom_current_product_location
	matching_entry = None
	for entry in order.product_movement:
		if entry.movement_type == product_location and not entry.linked_document:
			matching_entry = entry
			break

	if matching_entry:
		matching_entry.linked_document_type = doc.doctype
		matching_entry.linked_document = doc.name
		if not matching_entry.movement_date:
			matching_entry.movement_date = getattr(doc, "posting_date", None) or today()
		if not matching_entry.handled_by:
			matching_entry.handled_by = frappe.session.user
	else:
		order.append(
			"product_movement",
			{
				"movement_type": product_location,
				"movement_date": getattr(doc, "posting_date", None) or today(),
				"linked_document_type": doc.doctype,
				"linked_document": doc.name,
				"handled_by": frappe.session.user,
			},
		)

	order.current_product_location = product_location
	order.product_location = (
		(getattr(matching_entry, "destination", None) if matching_entry else None)
		or getattr(order.product_movement[-1], "destination", None)
		or product_location
	)
	_set_status_from_location(order, order.product_location or product_location)
	order.save(ignore_permissions=True)

	# Keep Service Request in sync when available
	if order.service_request:
		try:
			service_request = frappe.get_doc("Service Request", order.service_request)
		except frappe.DoesNotExistError:
			service_request = None

		if service_request:
			service_request.current_product_location = product_location
			if hasattr(service_request, "product_movement"):
				sr_entry = None
				for entry in service_request.product_movement:
					if entry.movement_type == product_location and not entry.linked_document:
						sr_entry = entry
						break
				if not sr_entry:
					sr_entry = service_request.append(
						"product_movement",
						{
							"movement_type": product_location,
							"movement_date": getattr(doc, "posting_date", None) or today(),
							"handled_by": frappe.session.user,
						},
					)
				sr_entry.linked_document_type = doc.doctype
				sr_entry.linked_document = doc.name
			service_request.save(ignore_permissions=True)


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
