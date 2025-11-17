from datetime import datetime

import frappe


@frappe.whitelist()
def get_unassigned_service_orders(limit=50):
	filters = {"docstatus": 1}
	assigned_orders = frappe.get_all(
		"Service Appointment",
		filters={"service_order": ["is", "set"], "docstatus": ["!=", 2]},
		pluck="service_order",
		limit_page_length=0,
	)
	if assigned_orders:
		filters["name"] = ["not in", assigned_orders]

	orders = frappe.get_all(
		"Service Order",
		fields=["name", "customer", "priority", "posting_date", "status", "type"],
		filters=filters,
		order_by="posting_date desc",
		limit_page_length=limit,
	)
	return orders


@frappe.whitelist()
def create_appointment_from_api(
	posting_date,
	service_order,
	customer,
	scheduled_start_datetime,
	scheduled_finish_datetime,
	service_technicians,
	items,
	changed_status=None,
):
	appointment = frappe.new_doc("Service Appointment")
	appointment.posting_date = posting_date if posting_date else datetime.now().date()
	appointment.service_order = service_order
	appointment.customer = customer
	appointment.scheduled_start_datetime = scheduled_start_datetime
	appointment.scheduled_finish_datetime = scheduled_finish_datetime

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

	if isinstance(service_technicians, list):
		for service_technician in service_technicians:
			appointment.append(
				"service_technicians",
				{
					"service_technician": service_technician["service_technician"],
					"full_name": service_technician["full_name"],
				},
			)
	else:
		appointment.append(
			"service_technicians",
			{
				"service_technician": service_technicians["service_technician"],
				"full_name": service_technicians["full_name"],
			},
		)

	appointment.insert()
	appointment.submit()

	if changed_status == "Dispatched":
		appointment.status = "Dispatched"
		appointment.save()
	return appointment.name


@frappe.whitelist()
def update_appointment_from_api(
	name,
	scheduled_start_datetime,
	scheduled_finish_datetime,
	service_technicians,
	items,
	changed_status=None,
	reschedule=False,
	edit_item_list=False,
	edit_technician_list=False,
):
	if not reschedule and not edit_item_list and not edit_technician_list and changed_status is None:
		return

	appointment = frappe.get_doc("Service Appointment", name)

	if edit_item_list:
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

	if edit_technician_list:
		appointment.service_technicians = []
		if isinstance(service_technicians, list):
			for service_technician in service_technicians:
				appointment.append(
					"service_technicians",
					{
						"service_technician": service_technician["service_technician"],
						"full_name": service_technician["full_name"],
					},
				)
		else:
			appointment.append(
				"service_technicians",
				{
					"service_technician": service_technicians["service_technician"],
					"full_name": service_technicians["full_name"],
				},
			)

	if reschedule:
		appointment.scheduled_start_datetime = scheduled_start_datetime
		appointment.scheduled_finish_datetime = scheduled_finish_datetime

	if changed_status:
		if changed_status != "Cancelled":
			appointment.status = changed_status
		else:
			appointment.cancel()

	appointment.save()
	return appointment.name


@frappe.whitelist()
def bulk_remove_technicians(appointment_ids=None):
	"""Remove all technicians from the given Service Appointments.

	Args:
		appointment_ids (list|str): List of Service Appointment names or a JSON string list
	"""

	# Extract from form_dict if not provided directly
	if appointment_ids is None:
		appointment_ids = frappe.form_dict.get("appointment_ids")

	# Accept both JSON string and list
	if isinstance(appointment_ids, str):
		try:
			appointment_ids = frappe.parse_json(appointment_ids)
		except Exception:
			pass

	if not isinstance(appointment_ids, list | tuple) or not appointment_ids:
		raise frappe.ValidationError("No appointment IDs provided")

	updated = []
	for name in appointment_ids:
		appointment = frappe.get_doc("Service Appointment", name)
		# Clear technicians
		appointment.service_technicians = []
		appointment.save()
		updated.append(name)

	return {"updated": updated}


@frappe.whitelist()
def bulk_assign_technicians(appointment_ids=None, technician_ids=None):
	"""Assign technicians to the given Service Appointments (replaces existing).

	Args:
		appointment_ids (list|str): List of Service Appointment names or JSON string list
		technician_ids (list|str): List of Service Technician names or JSON string list
	"""
	if appointment_ids is None:
		appointment_ids = frappe.form_dict.get("appointment_ids")
	if technician_ids is None:
		technician_ids = frappe.form_dict.get("technician_ids")

	# Normalize inputs
	if isinstance(appointment_ids, str):
		try:
			appointment_ids = frappe.parse_json(appointment_ids)
		except Exception:
			pass
	if isinstance(technician_ids, str):
		try:
			technician_ids = frappe.parse_json(technician_ids)
		except Exception:
			pass

	if not isinstance(appointment_ids, list | tuple) or not appointment_ids:
		raise frappe.ValidationError("No appointment IDs provided")

	if not isinstance(appointment_ids, list | tuple) or not appointment_ids:
		raise frappe.ValidationError("No appointment IDs provided")

	# Fetch technicians and map to full_name
	tech_docs = frappe.get_all(
		"Service Technician",
		filters={"name": ["in", technician_ids]},
		fields=["name", "full_name"],
		limit_page_length=0,
	)
	tech_map = {t["name"]: t for t in tech_docs}

	updated = []
	for name in appointment_ids:
		try:
			appointment = frappe.get_doc("Service Appointment", name)
			# Replace technicians
			appointment.service_technicians = []
			for tech_id in technician_ids:
				tech = tech_map.get(tech_id)
				if not tech:
					continue
				appointment.append(
					"service_technicians",
					{
						"service_technician": tech["name"],
						"full_name": tech.get("full_name"),
					},
				)
			appointment.save()
			updated.append(name)
		except Exception as e:
			frappe.local.response["http_status_code"] = 417
			return {
				"updated": updated,
				"error": {
					"appointment": name,
					"message": str(e),
				},
			}

	return {"updated": updated}
