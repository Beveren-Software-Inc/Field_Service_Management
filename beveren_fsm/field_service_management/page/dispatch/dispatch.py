import frappe
from frappe.utils import get_datetime, getdate


@frappe.whitelist()
def get_schedule_data(selected_date, all_dates=False):
	technicians = frappe.get_all("Service Technician", fields=["name", "full_name"])

	selected_date = getdate(selected_date)

	if all_dates:
		appointments = frappe.get_all(
			"Service Appointment",
			fields=[
				"name",
				"posting_date",
				"service_order",
				"scheduled_start_datetime",
				"scheduled_finish_datetime",
				"status",
			],
			filters={"docstatus": 1},
			order_by="posting_date desc",
		)
	else:
		appointments = frappe.get_all(
			"Service Appointment",
			filters={
				"posting_date": selected_date,
			},
			fields=[
				"name",
				"posting_date",
				"service_order",
				"scheduled_start_datetime",
				"scheduled_finish_datetime",
				"status",
			],
		)

	meta = frappe.get_meta("Service Appointment")
	appointments_with_technicians = []
	for appointment in appointments:
		appointment_doc = frappe.get_doc("Service Appointment", appointment.name)
		service_technicians = [
			frappe.get_doc("Service Technician", tech.service_technician).name
			for tech in appointment_doc.service_technicians
		]
		start_time = get_datetime(appointment_doc.scheduled_start_datetime)
		finish_time = get_datetime(appointment_doc.scheduled_finish_datetime)

		state_color = None
		if meta.states:
			for s in meta.states:
				if s.title == appointment_doc.status:
					state_color = s.color
					break

		structured_appointment = {
			"name": appointment.name,
			"posting_date": appointment.posting_date,
			"service_order": appointment.service_order,
			"start_time": start_time.strftime("%H:%M"),
			"finish_time": finish_time.strftime("%H:%M"),
			"service_technicians": service_technicians,
			"status": appointment_doc.status,
			"color": state_color,
		}
		appointments_with_technicians.append(structured_appointment)

	return {"technicians": technicians, "appointments": appointments_with_technicians}


@frappe.whitelist()
def create_service_appointment(
	selected_date, service_order, scheduled_start_datetime, scheduled_finish_datetime, technician, dispatch=0
):
	from frappe.utils import get_datetime, getdate

	scheduled_start_datetime = get_datetime(scheduled_start_datetime)
	scheduled_finish_datetime = get_datetime(scheduled_finish_datetime)

	appointment_list = frappe.get_all(
		"Service Appointment",
		filters={
			"posting_date": getdate(selected_date),
			"service_order": service_order,
			"scheduled_start_datetime": scheduled_start_datetime,
			"scheduled_finish_datetime": scheduled_finish_datetime,
		},
		limit=100,
	)

	found = None
	for app in appointment_list:
		app_doc = frappe.get_doc("Service Appointment", app.name)
		for row in app_doc.get("service_technicians"):
			if row.service_technician == technician:
				found = app_doc
				break
		if found:
			break

	if found:
		appointment = found
	else:
		service_order_doc = frappe.get_doc("Service Order", service_order)
		appointment = frappe.new_doc("Service Appointment")
		appointment.posting_date = getdate(selected_date)
		appointment.service_order = service_order
		appointment.scheduled_start_datetime = scheduled_start_datetime
		appointment.scheduled_finish_datetime = scheduled_finish_datetime
		appointment.customer = service_order_doc.customer
		for item in service_order_doc.get("items") or []:
			appointment.append(
				"items",
				{
					"item_code": item.item_code,
					"qty": item.qty,
					"uom": item.uom,
					"invoice_status": item.invoice_status,
				},
			)
		appointment.append("service_technicians", {"service_technician": technician})
		appointment.save()
		appointment.submit()
		# Dispatch
		if int(dispatch) == 1:
			appointment.status = "Dispatched"
			appointment.save()

	meta = frappe.get_meta("Service Appointment")
	state_color = None
	if meta.states:
		for s in meta.states:
			if s.title == appointment.status:
				state_color = s.color
				break

	return {"name": appointment.name, "status": appointment.status, "color": state_color}


@frappe.whitelist()
def update_service_appointment(
	appointment_id,
	selected_date,
	service_order,
	scheduled_start_datetime,
	scheduled_finish_datetime,
	technician,
):
	from frappe.utils import get_datetime, getdate

	appointment = frappe.get_doc("Service Appointment", appointment_id)

	appointment.update(
		{
			"posting_date": getdate(selected_date),
			"service_order": service_order,
			"scheduled_start_datetime": get_datetime(scheduled_start_datetime),
			"scheduled_finish_datetime": get_datetime(scheduled_finish_datetime),
		}
	)

	appointment.set("service_technicians", [])
	appointment.append("service_technicians", {"service_technician": technician})

	appointment.save()
	return appointment.name


@frappe.whitelist()
def start_work(appointment_id):
	appointment = frappe.get_doc("Service Appointment", appointment_id)
	if appointment.status == "Dispatched":
		appointment.status = "In Progress"
		appointment.save(ignore_permissions=True)
		return appointment.name
	else:
		frappe.throw("Appointment is not in Dispatched status. Cannot start work.")


@frappe.whitelist()
def get_sidebar_data(mode):
	if mode == "Service Order":
		orders = frappe.get_all(
			"Service Order",
			fields=["name", "customer", "priority", "posting_date", "status"],
			filters={"docstatus": 1},
			order_by="posting_date desc",
			limit=30,
		)
		for o in orders:
			items = frappe.get_all(
				"Service Order Item",
				filters={"parent": o.name},
				fields=["item_code", "item_name", "qty", "uom", "invoice_status"],
			)
			o["items"] = items
		return orders

	elif mode == "Service Appointment":
		appointments = frappe.get_all(
			"Service Appointment",
			fields=[
				"name",
				"posting_date",
				"status",
				"scheduled_start_datetime",
				"scheduled_finish_datetime",
			],
			filters={"docstatus": 1},
			order_by="scheduled_start_datetime desc",
			limit=100,
		)
		for a in appointments:
			items = frappe.get_all(
				"Service Order Item",
				filters={"parent": a.name},
				fields=["item_code", "item_name", "qty", "uom", "invoice_status"],
			)
			techs = frappe.get_all(
				"Service Technician Item",
				filters={"parent": a.name},
				fields=["service_technician", "full_name"],
			)
			a["items"] = items
			a["service_technicians"] = techs
		return appointments

	else:
		return []
