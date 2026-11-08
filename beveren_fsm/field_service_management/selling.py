"""Desk selling helpers for Service Order and Service Quotation.

Both forms extend ERPNext's SellingController, which calls the pricing
engine on load. ERPNext only authorises its own transaction doctypes, so
opening a mapped service document throws "Invalid doctype" before the user
can save it.
"""

import frappe
from frappe.utils import flt

SERVICE_SELLING_DOCTYPES = ("Service Order", "Service Quotation")


def register_service_pricing_doctypes():
	"""Let the pricing engine price service orders and quotations."""
	from erpnext.accounts.doctype.pricing_rule import pricing_rule
	from erpnext.stock import get_item_details

	extra = set(SERVICE_SELLING_DOCTYPES)
	current = pricing_rule.PRICING_TRANSACTION_DOCTYPES
	if not extra <= set(current):
		pricing_rule.PRICING_TRANSACTION_DOCTYPES = frozenset(set(current) | extra)

	for doctype in SERVICE_SELLING_DOCTYPES:
		if doctype not in get_item_details.sales_doctypes:
			get_item_details.sales_doctypes.append(doctype)


def prepare_mapped_selling_doc(target, source, customer_field, address_field):
	"""Finish a document mapped from a Service Request or Service Quotation.

	The source carries one item, and its address and contact can belong to a
	different customer. The order and quotation need a price list in the
	document currency, a line the user can save, and party links that match
	the customer.
	"""
	align_selling_price_list(target)
	append_primary_item(target, source)
	drop_unlinked_party_fields(target, customer_field, address_field, "customer_contact")


def align_selling_price_list(doc):
	"""Use a selling price list in the document currency.

	The site default (Standard Selling) can be a different currency from the
	company. The desk then opens with a zero price-list exchange rate.
	"""
	currency = doc.get("currency")
	company = doc.get("company")
	if not currency and company:
		currency = frappe.get_cached_value("Company", company, "default_currency")
		doc.currency = currency
	if not currency:
		return

	current = doc.get("selling_price_list")
	current_currency = frappe.db.get_value("Price List", current, "currency") if current else None
	if current and current_currency == currency:
		doc.price_list_currency = current_currency
	else:
		price_list = frappe.db.get_value(
			"Price List",
			{"selling": 1, "enabled": 1, "currency": currency},
			"name",
		)
		if price_list:
			doc.selling_price_list = price_list
			doc.price_list_currency = currency
		elif current_currency:
			doc.price_list_currency = current_currency

	company_currency = (
		frappe.get_cached_value("Company", company, "default_currency") if company else currency
	)
	if not flt(doc.get("conversion_rate")) and doc.currency == company_currency:
		doc.conversion_rate = 1
	if not flt(doc.get("plc_conversion_rate")) and doc.get("price_list_currency") == company_currency:
		doc.plc_conversion_rate = 1


def append_primary_item(doc, source):
	"""Copy the request's single item onto the first row of a child table."""
	if doc.get("items") or not source.get("item_code"):
		return

	item = frappe.db.get_value(
		"Item",
		source.item_code,
		["item_name", "description", "stock_uom", "item_group"],
		as_dict=True,
	)
	if not item:
		return

	rate = 0
	if doc.get("selling_price_list"):
		rate = flt(
			frappe.db.get_value(
				"Item Price",
				{"item_code": source.item_code, "price_list": doc.selling_price_list},
				"price_list_rate",
			)
		)

	doc.append(
		"items",
		{
			"item_code": source.item_code,
			"item_name": item.item_name or source.get("item_name") or source.item_code,
			"description": item.description,
			"item_group": item.item_group,
			"qty": 1,
			"uom": item.stock_uom,
			"stock_uom": item.stock_uom,
			"rate": rate,
			"price_list_rate": rate,
			"amount": rate,
		},
	)


def drop_unlinked_party_fields(doc, customer_field, address_field, contact_field):
	"""Clear an address or contact that is not linked to this customer."""
	customer = doc.get(customer_field)
	if not customer:
		return

	address = doc.get(address_field)
	if address and not _party_link("Address", address, customer):
		doc.set(address_field, None)
		for display in ("address_details", "address_display"):
			if doc.meta.has_field(display):
				doc.set(display, None)

	contact = doc.get(contact_field) if contact_field else None
	if contact and not _party_link("Contact", contact, customer):
		doc.set(contact_field, None)
		if doc.meta.has_field("contact_details"):
			doc.contact_details = None


def _party_link(parenttype, parent, customer):
	return frappe.db.exists(
		"Dynamic Link",
		{
			"parenttype": parenttype,
			"parent": parent,
			"link_doctype": "Customer",
			"link_name": customer,
		},
	)
