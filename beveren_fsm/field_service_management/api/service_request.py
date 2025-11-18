from collections import defaultdict

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
	request_names = [req.name for req in requests]
	order_movements_by_request = defaultdict(list)

	if request_names:
		related_orders = frappe.get_all(
			"Service Order",
			filters={"service_request": ["in", request_names]},
			fields=["name", "service_request"],
			limit_page_length=0,
		)

		for order_meta in related_orders:
			try:
				order_doc = frappe.get_doc("Service Order", order_meta.name)
			except frappe.DoesNotExistError:
				continue

			for movement in order_doc.product_movement or []:
				order_movements_by_request[order_meta.service_request].append(
					{
						"name": movement.name,
						"movement_type": movement.movement_type,
						"destination": movement.destination,
						"movement_date": movement.movement_date,
						"linked_document_type": movement.linked_document_type,
						"linked_document": movement.linked_document,
						"handled_by": movement.handled_by,
						"service_order": order_meta.name,
					}
				)

	for req in requests:
		doc = frappe.get_doc("Service Request", req.name)
		movements = order_movements_by_request.get(req.name, [])

		# Fallback to legacy data if Service Order movements are unavailable
		if not movements and hasattr(doc, "product_movement"):
			movements = [
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

		req["product_movement"] = movements
		results.append(req)

	return results
