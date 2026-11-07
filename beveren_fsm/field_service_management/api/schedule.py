from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import frappe
from frappe import _
from frappe.utils import add_days, get_datetime, get_system_timezone, getdate


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

	if changed_status == "Cancelled":
		appointment.status = "Cancelled"
		if appointment.docstatus == 1:
			appointment.cancel()
		else:
			appointment.save()
		return appointment.name

	if changed_status:
		appointment.status = changed_status

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


def _blank(value):
	if value is None:
		return None
	text = str(value).strip()
	if text.lower() in {"", "null", "none", "undefined", "all"}:
		return None
	return text


def _to_site_naive(value):
	"""Return a naive datetime in the site timezone.

	Stored visit times are site-local. An aware value (including a UTC `Z`
	timestamp) is converted into that zone before it is compared or saved.
	A naive value is already site-local and is not shifted.
	"""
	if isinstance(value, datetime):
		dt = value
	else:
		text = _blank(value)
		if not text:
			frappe.throw(_("A start and finish time are required"))
		if text.endswith(("Z", "z")):
			text = text[:-1] + "+00:00"
		dt = get_datetime(text)
		if not dt:
			frappe.throw(_("Invalid datetime: {0}").format(value))
	if dt.tzinfo is not None:
		zone = ZoneInfo(get_system_timezone() or "UTC")
		dt = dt.astimezone(zone).replace(tzinfo=None)
	return dt.replace(microsecond=0)


def _dt_str(value):
	if not value:
		return None
	if isinstance(value, str):
		dt = get_datetime(value)
	else:
		dt = value
	if not dt:
		return None
	if getattr(dt, "tzinfo", None):
		dt = _to_site_naive(dt)
	return dt.strftime("%Y-%m-%d %H:%M:%S")


def _date_str(value):
	if not value:
		return None
	return str(value)[:10]


def _time_parts(value):
	if value is None:
		return 0, 0, 0
	if isinstance(value, timedelta):
		total = int(value.total_seconds()) % (24 * 60 * 60)
		return total // 3600, (total % 3600) // 60, total % 60
	text = str(value)
	parts = text.split(":")
	hour = int(parts[0] or 0)
	minute = int(parts[1] or 0) if len(parts) > 1 else 0
	second = int(float(parts[2] or 0)) if len(parts) > 2 else 0
	return hour, minute, second


def _coords(value):
	if not value:
		return None
	if isinstance(value, str):
		try:
			value = frappe.parse_json(value)
		except Exception:
			return None
	if not isinstance(value, dict):
		return None
	if value.get("lat") is not None and value.get("lng") is not None:
		try:
			lat = float(value["lat"])
			lng = float(value["lng"])
		except (TypeError, ValueError):
			return None
		if lat == 0 and lng == 0:
			return None
		return lat, lng
	for feature in value.get("features") or []:
		geometry = (feature or {}).get("geometry") or {}
		coordinates = geometry.get("coordinates")
		if isinstance(coordinates, list) and len(coordinates) >= 2:
			try:
				lng = float(coordinates[0])
				lat = float(coordinates[1])
			except (TypeError, ValueError):
				continue
			if lat == 0 and lng == 0:
				continue
			return lat, lng
	return None


def _address_line(row):
	if not row:
		return None
	parts = [row.get("address_line1"), row.get("city"), row.get("state"), row.get("pincode")]
	text = ", ".join(part for part in parts if part)
	return text or None


def _rows_by_name(doctype, names, fields):
	names = [name for name in dict.fromkeys(names) if name]
	if not names:
		return {}
	rows = frappe.get_all(doctype, filters={"name": ["in", names]}, fields=fields, limit_page_length=0)
	return {row.name: row for row in rows}


def _availability(technicians, range_start, range_end):
	"""Shift blocks and leave blocks for the requested window, keyed by technician."""
	shifts = {tech.name: [] for tech in technicians}
	leaves = {tech.name: [] for tech in technicians}
	by_employee = {}
	for tech in technicians:
		if tech.employee:
			by_employee.setdefault(tech.employee, []).append(tech.name)
	if not by_employee:
		return shifts, leaves

	try:
		_fill_shifts(by_employee, shifts, range_start, range_end)
		_fill_leaves(by_employee, leaves, range_start, range_end)
	except Exception:
		frappe.logger("beveren_fsm").warning("Schedule board availability was skipped", exc_info=True)
	return shifts, leaves


def _fill_shifts(by_employee, shifts, range_start, range_end):
	if not frappe.db.exists("DocType", "Shift Assignment") or not frappe.db.exists("DocType", "Shift Type"):
		return
	meta = frappe.get_meta("Shift Assignment")
	if not meta.has_field("employee") or not meta.has_field("shift_type") or not meta.has_field("start_date"):
		return
	fields = ["employee", "shift_type", "start_date"]
	filters = {
		"employee": ["in", list(by_employee)],
		"start_date": ["<=", getdate(range_end)],
		"docstatus": 1,
	}
	if meta.has_field("end_date"):
		fields.append("end_date")
	if meta.has_field("status"):
		fields.append("status")
		filters["status"] = "Active"
	assignments = frappe.get_all("Shift Assignment", filters=filters, fields=fields, limit_page_length=0)
	type_names = [row.shift_type for row in assignments if row.shift_type]
	if not type_names:
		return
	type_meta = frappe.get_meta("Shift Type")
	if not type_meta.has_field("start_time") or not type_meta.has_field("end_time"):
		return
	type_rows = frappe.get_all(
		"Shift Type",
		filters={"name": ["in", type_names]},
		fields=["name", "start_time", "end_time"],
		limit_page_length=0,
	)
	type_map = {row.name: row for row in type_rows}
	day = getdate(range_start)
	last = getdate(range_end)
	while day <= last:
		for assignment in assignments:
			if not assignment.start_date or getdate(assignment.start_date) > day:
				continue
			end_date = assignment.get("end_date")
			if end_date and getdate(end_date) < day:
				continue
			shift_type = type_map.get(assignment.shift_type)
			if not shift_type:
				continue
			start_hour, start_minute, start_second = _time_parts(shift_type.start_time)
			end_hour, end_minute, end_second = _time_parts(shift_type.end_time)
			start_dt = datetime.combine(day, datetime.min.time()).replace(
				hour=start_hour, minute=start_minute, second=start_second
			)
			end_dt = datetime.combine(day, datetime.min.time()).replace(
				hour=end_hour, minute=end_minute, second=end_second
			)
			if end_dt <= start_dt:
				end_dt += timedelta(days=1)
			if end_dt <= range_start or start_dt >= range_end:
				continue
			block = {"start": _dt_str(start_dt), "end": _dt_str(end_dt)}
			for tech_name in by_employee.get(assignment.employee, []):
				shifts[tech_name].append(block)
		day = add_days(day, 1)


def _fill_leaves(by_employee, leaves, range_start, range_end):
	if not frappe.db.exists("DocType", "Leave Application"):
		return
	meta = frappe.get_meta("Leave Application")
	if not all(meta.has_field(field) for field in ("employee", "from_date", "to_date")):
		return
	fields = ["employee", "from_date", "to_date"]
	if meta.has_field("half_day"):
		fields.append("half_day")
	if meta.has_field("half_day_date"):
		fields.append("half_day_date")
	filters = {
		"employee": ["in", list(by_employee)],
		"from_date": ["<=", getdate(range_end)],
		"to_date": [">=", getdate(range_start)],
		"docstatus": 1,
	}
	if meta.has_field("status"):
		filters["status"] = "Approved"
	rows = frappe.get_all("Leave Application", filters=filters, fields=fields, limit_page_length=0)
	for row in rows:
		if not row.from_date or not row.to_date:
			continue
		if row.get("half_day") and getdate(row.from_date) == getdate(row.to_date):
			start_dt = datetime.combine(getdate(row.from_date), datetime.min.time())
			end_dt = start_dt + timedelta(hours=12)
		else:
			start_dt = datetime.combine(getdate(row.from_date), datetime.min.time())
			end_dt = datetime.combine(getdate(row.to_date), datetime.min.time()) + timedelta(days=1)
		if end_dt <= range_start or start_dt >= range_end:
			continue
		block = {"start": _dt_str(start_dt), "end": _dt_str(end_dt)}
		for tech_name in by_employee.get(row.employee, []):
			leaves[tech_name].append(block)


@frappe.whitelist()
def get_board(start, end, service_area=None, skill=None, team=None, status=None, service_type=None):
	"""Return one dispatch window: technicians, their visits, and the unassigned tray.

	`start` and `end` are datetimes in the site timezone. Visits are selected by
	scheduled start, not posting date.
	"""
	if frappe.session.user == "Guest" or not frappe.has_permission("Service Appointment", "read"):
		frappe.throw(_("Not permitted to open the schedule board"), frappe.PermissionError)

	range_start = _to_site_naive(start)
	range_end = _to_site_naive(end)
	if range_end < range_start:
		frappe.throw(_("The board end is before the start"))

	service_area = _blank(service_area)
	skill = _blank(skill)
	team = _blank(team)
	status = _blank(status)
	service_type = _blank(service_type)

	tech_filters = {"active": 1}
	if service_area:
		tech_filters["service_area"] = service_area
	technicians = frappe.get_all(
		"Service Technician",
		filters=tech_filters,
		fields=["name", "full_name", "color", "service_area", "employee"],
		order_by="full_name asc",
		limit_page_length=0,
	)
	if skill:
		skilled = set(
			frappe.get_all(
				"Service Technician Skill Item",
				filters={"skill": skill, "parenttype": "Service Technician"},
				pluck="parent",
			)
		)
		technicians = [row for row in technicians if row.name in skilled]
	if team:
		members = set(
			frappe.get_all(
				"Service Team Member",
				filters={"parent": team, "parenttype": "Service Team"},
				pluck="service_technician",
			)
		)
		technicians = [row for row in technicians if row.name in members]

	tech_names = [row.name for row in technicians]
	skill_rows = []
	if tech_names:
		skill_rows = frappe.get_all(
			"Service Technician Skill Item",
			filters={"parent": ["in", tech_names], "parenttype": "Service Technician"},
			fields=["parent", "skill"],
			limit_page_length=0,
		)
	skills_by_tech = {}
	for row in skill_rows:
		skills_by_tech.setdefault(row.parent, [])
		if row.skill and row.skill not in skills_by_tech[row.parent]:
			skills_by_tech[row.parent].append(row.skill)

	shift_blocks, leave_blocks = _availability(technicians, range_start, range_end)
	visible = {row.name: row for row in technicians}

	appointment_filters = [
		["scheduled_start_datetime", ">=", range_start],
		["scheduled_start_datetime", "<=", range_end],
	]
	if status == "Cancelled":
		appointment_filters.append(["status", "=", "Cancelled"])
	else:
		appointment_filters.append(["docstatus", "!=", 2])
		if status:
			appointment_filters.append(["status", "=", status])
		else:
			appointment_filters.append(["status", "!=", "Cancelled"])
	if service_type:
		appointment_filters.append(["service_type", "=", service_type])

	appointments = frappe.get_all(
		"Service Appointment",
		filters=appointment_filters,
		fields=[
			"name",
			"customer",
			"service_order",
			"service_type",
			"status",
			"scheduled_start_datetime",
			"scheduled_finish_datetime",
			"arrival_window_start",
			"arrival_window_end",
			"primary_technician",
			"service_team",
			"service_address",
			"geolocation",
			"posting_date",
			"description",
		],
		order_by="scheduled_start_datetime asc",
		limit_page_length=0,
	)
	parent_names = [row.name for row in appointments]
	child_rows = []
	if parent_names:
		child_rows = frappe.get_all(
			"Service Technician Item",
			filters={"parent": ["in", parent_names], "parenttype": "Service Appointment"},
			fields=["parent", "service_technician", "full_name", "is_primary", "idx"],
			order_by="idx asc",
			limit_page_length=0,
		)
	children = {}
	for row in child_rows:
		children.setdefault(row.parent, []).append(row)

	order_map = _rows_by_name(
		"Service Order",
		[row.service_order for row in appointments],
		["name", "customer_address", "service_area"],
	)
	customer_map = _rows_by_name(
		"Customer",
		[row.customer for row in appointments],
		["name", "customer_name"],
	)
	address_names = []
	area_names = [row.service_area for row in technicians if row.service_area]
	for row in appointments:
		order = order_map.get(row.service_order)
		address_names.append(row.service_address or (order.customer_address if order else None))
		if order and order.service_area:
			area_names.append(order.service_area)
	address_map = _rows_by_name(
		"Address",
		address_names,
		["name", "address_line1", "city", "state", "pincode"],
	)
	area_map = _rows_by_name("Service Area", area_names, ["name", "location"])

	visits = []
	unassigned = []
	for row in appointments:
		crew = children.get(row.name) or []
		tech_ids = [child.service_technician for child in crew if child.service_technician]
		primary = row.primary_technician if row.primary_technician in tech_ids else None
		if not primary:
			primary = next((child.service_technician for child in crew if child.is_primary), None)
		if not primary and tech_ids:
			primary = tech_ids[0]
		order = order_map.get(row.service_order)
		area = order.service_area if order and order.service_area else None
		if not area and primary and primary in visible:
			area = visible[primary].service_area
		address_name = row.service_address or (order.customer_address if order else None)
		coords = _coords(row.geolocation)
		if not coords and area:
			area_row = area_map.get(area)
			coords = _coords(area_row.location if area_row else None)
		customer = customer_map.get(row.customer)
		payload = {
			"name": row.name,
			"customer": row.customer,
			"customer_name": (customer.customer_name if customer else None) or row.customer,
			"service_order": row.service_order,
			"service_type": row.service_type,
			"status": row.status,
			"scheduled_start_datetime": _dt_str(row.scheduled_start_datetime),
			"scheduled_finish_datetime": _dt_str(row.scheduled_finish_datetime),
			"arrival_window_start": _dt_str(row.arrival_window_start),
			"arrival_window_end": _dt_str(row.arrival_window_end),
			"primary_technician": primary,
			"service_team": row.service_team,
			"service_area": area,
			"address_display": _address_line(address_map.get(address_name)),
			"posting_date": _date_str(row.posting_date),
			"description": row.description,
			"service_technicians": [
				{
					"service_technician": child.service_technician,
					"full_name": child.full_name,
					"is_primary": 1 if child.service_technician == primary else 0,
				}
				for child in crew
				if child.service_technician
			],
			"location": ({"lat": coords[0], "lng": coords[1], "service_area": area} if coords else None),
		}
		if not tech_ids:
			unassigned.append(payload)
		elif any(tech_id in visible for tech_id in tech_ids):
			visits.append(payload)

	return {
		"time_zone": get_system_timezone(),
		"visits": visits,
		"unassigned": unassigned,
		"technicians": [
			{
				"name": row.name,
				"full_name": row.full_name,
				"color": row.color,
				"service_area": row.service_area,
				"skills": skills_by_tech.get(row.name, []),
				"shifts": shift_blocks.get(row.name, []),
				"leaves": leave_blocks.get(row.name, []),
			}
			for row in technicians
		],
	}


@frappe.whitelist()
def assign_visit(
	name,
	scheduled_start_datetime,
	scheduled_finish_datetime,
	service_technician=None,
	service_team=None,
):
	"""Move, resize, or drop a visit. Overlap raises and nothing is saved."""
	if frappe.session.user == "Guest" or not frappe.has_permission("Service Appointment", "write"):
		frappe.throw(_("Not permitted to schedule visits"), frappe.PermissionError)

	service_technician = _blank(service_technician)
	service_team = _blank(service_team)
	appointment = frappe.get_doc("Service Appointment", name)
	appointment.scheduled_start_datetime = _to_site_naive(scheduled_start_datetime)
	appointment.scheduled_finish_datetime = _to_site_naive(scheduled_finish_datetime)
	if appointment.scheduled_finish_datetime <= appointment.scheduled_start_datetime:
		frappe.throw(_("Scheduled finish must be after the start"))

	if service_team:
		appointment.service_team = service_team
	elif service_technician:
		full_name = frappe.db.get_value("Service Technician", service_technician, "full_name")
		appointment.service_team = None
		appointment.set("service_technicians", [])
		appointment.append(
			"service_technicians",
			{
				"service_technician": service_technician,
				"full_name": full_name,
				"is_primary": 1,
			},
		)
		appointment.primary_technician = service_technician

	if appointment.status == "Unassigned" and (
		service_technician or service_team or appointment.get("service_technicians")
	):
		appointment.status = "Scheduled"

	appointment.save()
	return appointment.name
