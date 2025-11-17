# Copyright (c) 2025, Beveren Software and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document
from frappe.utils import add_to_date


class AMCContract(Document):
	def validate(self):
		self.set_contract_end_date()

	def set_contract_end_date(self):
		if self.contract_start_date and self.contract_period:
			self.contract_end_date = add_to_date(
				self.contract_start_date, months=self.contract_period, days=-1
			)
		else:
			self.contract_end_date = None
