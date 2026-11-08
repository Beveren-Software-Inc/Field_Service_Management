# Copyright (c) 2026, Beveren Software and contributors

import frappe

ROLES = (
	{"role_name": "Dispatcher", "desk_access": 1},
	{"role_name": "CSR", "desk_access": 1},
	{"role_name": "Technician", "desk_access": 1},
	{"role_name": "Service Manager", "desk_access": 1, "home_page": "/app/service"},
)


def execute():
	"""Create dispatch roles before DocType permissions reference them."""
	for role in ROLES:
		if frappe.db.exists("Role", role["role_name"]):
			continue
		doc = frappe.new_doc("Role")
		doc.role_name = role["role_name"]
		doc.desk_access = role["desk_access"]
		if role.get("home_page"):
			doc.home_page = role["home_page"]
		doc.insert(ignore_permissions=True)
