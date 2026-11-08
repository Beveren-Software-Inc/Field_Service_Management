# Copyright (c) 2025, Beveren Software and Contributors
# See license.txt

from datetime import datetime
from zoneinfo import ZoneInfo

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import get_system_timezone

from beveren_fsm.field_service_management.api.schedule import get_board


class TestServiceAppointment(FrappeTestCase):
	def setUp(self):
		self.customer = _customer()
		self.item = _item()

	def test_visit_without_technician_saves_as_unassigned(self):
		doc = _appointment(
			self,
			start="2031-04-07 09:00:00",
			end="2031-04-07 11:00:00",
		)
		self.assertEqual(doc.status, "Unassigned")
		self.assertFalse(doc.service_technicians)
		self.assertFalse(doc.primary_technician)

	def test_overlap_for_the_same_technician_is_rejected(self):
		tech = _technician("Overlap Tech")
		_appointment(
			self,
			start="2031-04-08 10:00:00",
			end="2031-04-08 12:00:00",
			technicians=[tech],
		)
		with self.assertRaises(frappe.ValidationError) as caught:
			_appointment(
				self,
				start="2031-04-08 11:00:00",
				end="2031-04-08 13:00:00",
				technicians=[tech],
			)
		self.assertIn("Overlap", str(caught.exception))

	def test_assigning_a_team_copies_members_and_sets_the_lead(self):
		lead = _technician("Crew Lead")
		helper = _technician("Crew Helper")
		team = frappe.get_doc(
			{
				"doctype": "Service Team",
				"team_name": f"Crew {frappe.generate_hash(length=6)}",
				"members": [
					{"service_technician": helper, "is_lead": 0},
					{"service_technician": lead, "is_lead": 1},
				],
			}
		).insert(ignore_permissions=True)

		doc = _appointment(self, start="2031-04-09 08:00:00", end="2031-04-09 10:00:00")
		doc.service_team = team.name
		doc.save()
		doc.reload()

		members = [row.service_technician for row in doc.service_technicians]
		self.assertEqual(set(members), {lead, helper})
		self.assertEqual(doc.primary_technician, lead)
		primary_rows = [row for row in doc.service_technicians if row.is_primary]
		self.assertEqual(len(primary_rows), 1)
		self.assertEqual(primary_rows[0].service_technician, lead)

	def test_board_uses_scheduled_start_not_posting_date(self):
		# Monday posting date, Tuesday scheduled start.
		doc = _appointment(
			self,
			start="2026-11-10 10:00:00",
			end="2026-11-10 12:00:00",
			posting_date="2026-11-09",
		)
		tuesday = _ids(get_board("2026-11-10 00:00:00", "2026-11-10 23:59:59"))
		monday = _ids(get_board("2026-11-09 00:00:00", "2026-11-09 23:59:59"))
		self.assertIn(doc.name, tuesday)
		self.assertNotIn(doc.name, monday)

	def test_board_keeps_toronto_morning_on_that_calendar_date(self):
		original = get_system_timezone()
		frappe.db.set_single_value("System Settings", "time_zone", "America/Toronto")
		frappe.clear_cache()
		try:
			doc = _appointment(
				self,
				start="2026-11-10 09:00:00",
				end="2026-11-10 10:00:00",
				posting_date="2026-11-09",
			)
			same_day = _ids(get_board("2026-11-10 00:00:00", "2026-11-10 23:59:59"))
			previous_day = _ids(get_board("2026-11-09 00:00:00", "2026-11-09 23:59:59"))
			self.assertIn(doc.name, same_day)
			self.assertNotIn(doc.name, previous_day)

			local = datetime(2026, 11, 10, 9, 0, tzinfo=ZoneInfo("America/Toronto"))
			utc_start = local.astimezone(ZoneInfo("UTC")).strftime("%Y-%m-%dT%H:%M:%SZ")
			utc_end = local.replace(hour=10).astimezone(ZoneInfo("UTC")).strftime("%Y-%m-%dT%H:%M:%SZ")
			self.assertIn(doc.name, _ids(get_board(utc_start, utc_end)))
			self.assertNotIn(
				doc.name,
				_ids(get_board("2026-11-09T00:00:00Z", "2026-11-09T23:59:59Z")),
			)
		finally:
			frappe.db.set_single_value("System Settings", "time_zone", original or "UTC")
			frappe.clear_cache()


def _ids(board):
	return {row["name"] for row in (board.get("visits") or []) + (board.get("unassigned") or [])}


def _customer():
	name = "_Test FSM Dispatch Customer"
	existing = frappe.db.get_value("Customer", {"customer_name": name}, "name")
	if existing:
		return existing
	group = frappe.db.get_single_value("Selling Settings", "customer_group") or frappe.db.get_value(
		"Customer Group", {"is_group": 0}, "name"
	)
	territory = frappe.db.get_single_value("Selling Settings", "territory") or frappe.db.get_value(
		"Territory", {"is_group": 0}, "name"
	)
	doc = frappe.get_doc(
		{
			"doctype": "Customer",
			"customer_name": name,
			"customer_group": group,
			"territory": territory,
			"customer_type": "Company",
		}
	).insert(ignore_permissions=True)
	return doc.name


def _item():
	code = "_Test FSM Dispatch Item"
	if frappe.db.exists("Item", code):
		return code
	group = frappe.db.get_value("Item Group", {"is_group": 0}, "name")
	uom = frappe.db.get_single_value("Stock Settings", "stock_uom") or "Nos"
	doc = frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": code,
			"item_name": code,
			"item_group": group,
			"stock_uom": uom,
			"is_stock_item": 0,
		}
	).insert(ignore_permissions=True)
	return doc.name


def _technician(full_name):
	doc = frappe.get_doc(
		{
			"doctype": "Service Technician",
			"full_name": f"{full_name} {frappe.generate_hash(length=4)}",
			"active": 1,
		}
	).insert(ignore_permissions=True)
	return doc.name


def _appointment(test, start, end, technicians=None, posting_date=None):
	doc = frappe.get_doc(
		{
			"doctype": "Service Appointment",
			"naming_series": "SVC-APP-.YYYY.-",
			"customer": test.customer,
			"posting_date": posting_date or start[:10],
			"scheduled_start_datetime": start,
			"scheduled_finish_datetime": end,
			"items": [{"item_code": test.item, "qty": 1, "rate": 100}],
			"service_technicians": [
				{"service_technician": tech, "is_primary": 1 if index == 0 else 0}
				for index, tech in enumerate(technicians or [])
			],
		}
	)
	doc.insert(ignore_permissions=True)
	return doc
