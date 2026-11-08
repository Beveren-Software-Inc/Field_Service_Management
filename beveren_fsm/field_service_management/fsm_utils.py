import frappe
from frappe.utils import flt


@frappe.whitelist()
def create_service_invoice(doctype, docname, customer, items=None):
	items = frappe.parse_json(items) if items else []
	source = frappe.get_doc(doctype, docname)
	company = source.get("company")
	if not company and source.get("service_order"):
		company = frappe.db.get_value("Service Order", source.service_order, "company")

	invoice = frappe.new_doc("Sales Invoice")
	invoice.customer = customer
	if company:
		invoice.company = company
	currency = source.get("currency")
	if not currency and company:
		currency = frappe.db.get_value("Company", company, "default_currency")
	if currency:
		invoice.currency = currency
	if source.get("selling_price_list"):
		invoice.selling_price_list = source.selling_price_list
	if source.get("conversion_rate"):
		invoice.conversion_rate = source.conversion_rate
	invoice.due_date = frappe.utils.nowdate()
	invoice.custom_reference_service_doctype = doctype
	invoice.custom_reference_service_document = docname
	for item in items:
		invoice.append(
			"items",
			{
				"item_code": item.get("item_code"),
				"qty": item.get("qty"),
				"rate": item.get("rate"),
				"amount": item.get("amount"),
			},
		)
	invoice.insert()
	return invoice.name


def _apply_invoiced_qty(service_doc, invoice_qty, sign):
	if not service_doc.meta.get_field("items"):
		return False

	updated = False
	for row in service_doc.items:
		if row.item_code not in invoice_qty:
			continue
		row.invoiced_qty = max(0, flt(row.invoiced_qty) + (sign * flt(invoice_qty[row.item_code])))
		if row.invoiced_qty <= 0:
			row.invoiced_qty = 0
			row.invoice_status = "Not Invoiced"
		elif flt(row.invoiced_qty) < flt(row.qty):
			row.invoice_status = "Partly Invoiced"
		else:
			row.invoice_status = "Invoiced"
		updated = True
	return updated


def update_invoice_status(doc, method):
	if not (doc.custom_reference_service_doctype and doc.custom_reference_service_document):
		return

	sign = 1 if method == "on_submit" else -1
	invoice_qty = {}
	for item in doc.items:
		if not item.item_code:
			continue
		invoice_qty[item.item_code] = invoice_qty.get(item.item_code, 0) + flt(item.qty)

	service_doc = frappe.get_doc(doc.custom_reference_service_doctype, doc.custom_reference_service_document)
	if _apply_invoiced_qty(service_doc, invoice_qty, sign):
		service_doc.flags.ignore_validate_update_after_submit = True
		service_doc.save(ignore_permissions=True)
		frappe.msgprint(
			f"Updated invoice status for <strong>Services and Parts</strong> in "
			f"<strong>{service_doc.doctype}</strong> {service_doc.name}"
		)

	update_associated_docs_invoice_status(doc, method)


def update_associated_docs_invoice_status(doc, method):
	if not (doc.custom_reference_service_doctype and doc.custom_reference_service_document):
		return

	source_doc = frappe.get_doc(doc.custom_reference_service_doctype, doc.custom_reference_service_document)
	source_items = source_doc.get("items", [])

	possible_doctypes = {"Service Order", "Service Appointment"}
	target_doctype = (possible_doctypes - {doc.custom_reference_service_doctype}).pop()

	if target_doctype == "Service Order":
		target_docnames = [source_doc.service_order] if source_doc.service_order else []
	elif target_doctype == "Service Appointment":
		target_docnames = frappe.get_all(
			target_doctype, filters={"service_order": source_doc.name}, pluck="name"
		)
	else:
		target_docnames = []

	# For Service Appointments, update other similar appointments in the same order
	if doc.custom_reference_service_doctype == "Service Appointment":
		similar_appointments = frappe.get_all(
			source_doc.doctype,
			filters={"service_order": source_doc.service_order, "name": ["!=", source_doc.name]},
			pluck="name",
		)
		for appointment_name in similar_appointments:
			update_target_documents(source_doc.doctype, appointment_name, source_items)

	for target_name in target_docnames:
		update_target_documents(target_doctype, target_name, source_items)


def update_target_documents(target_doctype, target_docname, source_items):
	target_doc = frappe.get_doc(target_doctype, target_docname)

	# Build a lookup for items in the target document by item_code
	target_items_lookup = {row.item_code: row for row in target_doc.get("items", [])}

	updated = False
	for item in source_items:
		target_row = target_items_lookup.get(item.item_code)
		# Update only if the invoice status is different from the source's current status
		if target_row and target_row.invoice_status != item.invoice_status:
			target_row.invoice_status = item.invoice_status
			target_row.invoiced_qty = item.invoiced_qty
			updated = True

	if updated:
		target_doc.flags.ignore_validate_update_after_submit = True
		target_doc.save(ignore_permissions=True)
		frappe.msgprint(
			f"Updated invoice status for <strong>Services and Parts</strong> in "
			f"<strong>{target_doctype}</strong> {target_docname}"
		)


def update_per_billed_status(doc, method):
	total_amount = 0.0
	billed_amount = 0.0

	if not (doc.custom_reference_service_doctype and doc.custom_reference_service_document):
		return

	ref_doc = frappe.get_doc(doc.custom_reference_service_doctype, doc.custom_reference_service_document)

	for item in ref_doc.get("items", []):
		full_amount = item.amount or 0.0
		total_amount += full_amount

		invoiced_qty = item.get("invoiced_qty", 0)
		item_qty = item.qty or 0
		proportion_invoiced = (invoiced_qty / item_qty) if item_qty else 0

		billed_amount += full_amount * proportion_invoiced

	ref_doc.per_billed = (billed_amount / total_amount) * 100 if total_amount else 0.0
	ref_doc.flags.ignore_validate_update_after_submit = True
	ref_doc.save(ignore_permissions=True)


@frappe.whitelist()
def update_appointment_from_api(
	name, scheduled_start_datetime, scheduled_finish_datetime, service_technicians, items
):
	appointment = frappe.get_doc("Service Appointment", name)
	# delete all items from the appointment
	appointment.service_technicians = []
	appointment.items = []

	for item in items:
		appointment.append(
			"items",
			{
				"item_code": item["item_code"],
				"qty": item["qty"],
				"rate": item["rate"],
				"amount": item["amount"],
			},
		)

	for service_technician in service_technicians:
		appointment.append(
			"service_technicians",
			{
				"service_technician": service_technician["service_technician"],
				"full_name": service_technician["full_name"],
				# "service_area": service_technician["service_area"],
				# "specialization": service_technician["specialization"]
			},
		)

	appointment.scheduled_start_datetime = scheduled_start_datetime
	appointment.scheduled_finish_datetime = scheduled_finish_datetime

	appointment.save()
	return appointment.name
