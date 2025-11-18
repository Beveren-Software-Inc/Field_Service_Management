import frappe
from frappe.utils import getdate


@frappe.whitelist()
def get_service_orders_for_tracking(
	status=None,
	start_date=None,
	end_date=None,
	search=None,
	limit_page_length: int | None = 50,
):
	filters = {"docstatus": ["!=", 2]}

	if status and status != "all":
		filters["status"] = status

	if start_date and end_date:
		filters["posting_date"] = ["between", [getdate(start_date), getdate(end_date)]]
	elif start_date:
		filters["posting_date"] = [">=", getdate(start_date)]
	elif end_date:
		filters["posting_date"] = ["<=", getdate(end_date)]

	or_filters = []
	if search:
		search_term = f"%{search.strip()}%"
		or_filters = [
			["Service Order", "name", "like", search_term],
			["Service Order", "customer", "like", search_term],
			["Service Order", "serial_no", "like", search_term],
			["Service Order", "item_code", "like", search_term],
		]

	fields = [
		"name",
		"customer",
		"status",
		"posting_date",
		"due_date",
		"serial_no",
		"item_code",
		"priority",
		"type",
		"product_location",
	]

	limit = int(limit_page_length) if limit_page_length else None

	orders = frappe.get_all(
		"Service Order",
		filters=filters,
		or_filters=or_filters,
		fields=fields,
		order_by="posting_date desc",
		limit_page_length=limit,
	)

	for order in orders:
		doc = frappe.get_doc("Service Order", order.name)
		order["product_movement"] = [
			{
				"name": movement.name,
				"movement_type": movement.movement_type,
				"destination": movement.destination,
				"movement_date": movement.movement_date,
				"linked_document_type": movement.linked_document_type,
				"linked_document": movement.linked_document,
				"handled_by": movement.handled_by,
				"service_order": order.name,
			}
			for movement in doc.product_movement
		]

	return orders
