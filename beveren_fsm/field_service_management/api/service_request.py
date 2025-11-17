import frappe
from frappe.utils import getdate


@frappe.whitelist()
def get_service_requests(
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
			["Service Request", "name", "like", search_term],
			["Service Request", "customer", "like", search_term],
			["Service Request", "serial_no", "like", search_term],
			["Service Request", "item_code", "like", search_term],
		]

	fields = [
		"name",
		"subject",
		"customer",
		"status",
		"posting_date",
		"due_date",
		"serial_no",
		"item_code",
		"item_name",
		"current_product_location",
		"description",
	]

	limit = int(limit_page_length) if limit_page_length else None

	requests = frappe.get_all(
		"Service Request",
		filters=filters,
		or_filters=or_filters,
		fields=fields,
		order_by="posting_date desc",
		limit_page_length=limit,
	)

	results = []
	for req in requests:
		doc = frappe.get_doc("Service Request", req.name)
		req["product_movement"] = [
			{
				"name": movement.name,
				"movement_type": movement.movement_type,
				"destination": movement.destination,
				"movement_date": movement.movement_date,
				"linked_document_type": movement.linked_document_type,
				"linked_document": movement.linked_document,
				"handled_by": movement.handled_by,
			}
			for movement in doc.product_movement
		]
		results.append(req)

	return results
