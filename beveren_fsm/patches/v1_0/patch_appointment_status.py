# Copyright (c) 2026, Beveren Software and contributors

import frappe


def execute():
	"""Map the old visit statuses onto the dispatch board statuses.

	Open with no technician becomes Unassigned. Open with a technician becomes
	Scheduled. In Progress becomes On site. Existing technicians stay active.
	"""
	frappe.db.sql(
		"""
		UPDATE `tabService Appointment` sa
		SET status = 'Scheduled'
		WHERE status = 'Open'
		AND EXISTS (
			SELECT 1 FROM `tabService Technician Item` sti
			WHERE sti.parent = sa.name
			AND sti.parenttype = 'Service Appointment'
			AND IFNULL(sti.service_technician, '') != ''
		)
		"""
	)
	frappe.db.sql(
		"""
		UPDATE `tabService Appointment` sa
		SET status = 'Unassigned'
		WHERE status = 'Open'
		AND NOT EXISTS (
			SELECT 1 FROM `tabService Technician Item` sti
			WHERE sti.parent = sa.name
			AND sti.parenttype = 'Service Appointment'
			AND IFNULL(sti.service_technician, '') != ''
		)
		"""
	)
	frappe.db.sql(
		"""
		UPDATE `tabService Appointment`
		SET status = 'On site'
		WHERE status = 'In Progress'
		"""
	)
	if frappe.db.table_exists("Service Technician") and frappe.db.has_column("Service Technician", "active"):
		frappe.db.sql(
			"""
			UPDATE `tabService Technician`
			SET active = 1
			WHERE IFNULL(active, 0) = 0
			"""
		)
