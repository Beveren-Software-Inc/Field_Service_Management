app_name = "beveren_fsm"
app_title = "Beveren Field Service Management"
app_publisher = "Beveren Software"
app_description = "Beveren Software's Field Service Management App"
app_email = "info@beverensoftware.com"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "beveren_fsm",
# 		"logo": "/assets/beveren_fsm/logo.png",
# 		"title": "Field Service Management",
# 		"route": "/beveren_fsm",
# 		"has_permission": "beveren_fsm.api.permission.has_app_permission"
# 	}
# ]

fixtures = [
	# Export your custom "Service Type" doctype
	"Service Type",
	"Product Location",
	# Export the "Service" Workspace only
	# {"dt": "Workspace", "filters": {"name": "Service"}},
	# Export specific Custom Fields related to Service Order links
	{
		"doctype": "Custom Field",
		"filters": [
			[
				"name",
				"in",
				[
					"Purchase Order-custom_service_order",
					"Purchase Invoice-custom_service_order",
					"Purchase Receipt-custom_service_order",
					"Stock Entry-custom_service_order",
					"Delivery Note-custom_service_order",
					"Delivery Note-custom_current_product_location",
					"Stock Entry-custom_current_product_location",
					"Purchase Order-custom_current_product_location",
					"Purchase Invoice-custom_current_product_location",
					"Purchase Receipt-custom_current_product_location",
				],
			]
		],
	},
]


# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/beveren_fsm/css/beveren_fsm.css"
# app_include_js = "/assets/beveren_fsm/js/beveren_fsm.js"

# include js, css files in header of web template
# web_include_css = "/assets/beveren_fsm/css/beveren_fsm.css"
# web_include_js = "/assets/beveren_fsm/js/beveren_fsm.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "beveren_fsm/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# bench --site fsm.local export-fixtures
# fixtures = ["Service Type", {"dt": "Workspace", "filters": {"name": "Service"}}]

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "beveren_fsm/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "beveren_fsm.utils.jinja_methods",
# 	"filters": "beveren_fsm.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "beveren_fsm.install.before_install"
# after_install = "beveren_fsm.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "beveren_fsm.uninstall.before_uninstall"
# after_uninstall = "beveren_fsm.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "beveren_fsm.utils.before_app_install"
# after_app_install = "beveren_fsm.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "beveren_fsm.utils.before_app_uninstall"
# after_app_uninstall = "beveren_fsm.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "beveren_fsm.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }
doc_events = {
	"Sales Invoice": {
		"on_submit": [
			"beveren_fsm.field_service_management.fsm_utils.update_invoice_status",
			"beveren_fsm.field_service_management.fsm_utils.update_per_billed_status",
		],
		"on_cancel": [
			"beveren_fsm.field_service_management.fsm_utils.update_invoice_status",
			"beveren_fsm.field_service_management.fsm_utils.update_per_billed_status",
		],
	},
	"Delivery Note": {
		"on_submit": [
			"beveren_fsm.field_service_management.doctype.service_order.service_order.update_product_movement_on_submit",
		],
	},
	"Purchase Order": {
		"on_submit": [
			"beveren_fsm.field_service_management.doctype.service_order.service_order.update_product_movement_on_submit",
		],
	},
	"Purchase Receipt": {
		"on_submit": [
			"beveren_fsm.field_service_management.doctype.service_order.service_order.update_product_movement_on_submit",
		],
	},
	"Purchase Invoice": {
		"on_submit": [
			"beveren_fsm.field_service_management.doctype.service_order.service_order.update_product_movement_on_submit",
		],
	},
	"Stock Entry": {
		"on_submit": [
			"beveren_fsm.field_service_management.doctype.service_order.service_order.update_product_movement_on_submit",
		],
	},
}

# Scheduled Tasks
# ---------------

scheduler_events = {
	# 	"all": [
	# 		"beveren_fsm.tasks.all"
	# 	],
	# "daily": [
	# 	"beveren_fsm.tasks.daily"
	# ],
	"daily": ["beveren_fsm.field_service_management.doctype.service_request.service_request.update_status"]
	# 	"hourly": [
	# 		"beveren_fsm.tasks.hourly"
	# 	],
	# 	"weekly": [
	# 		"beveren_fsm.tasks.weekly"
	# 	],
	# 	"monthly": [
	# 		"beveren_fsm.tasks.monthly"
	# 	],
}

# Testing
# -------

# before_tests = "beveren_fsm.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "beveren_fsm.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "beveren_fsm.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["beveren_fsm.utils.before_request"]
# after_request = ["beveren_fsm.utils.after_request"]

# Job Events
# ----------
# before_job = ["beveren_fsm.utils.before_job"]
# after_job = ["beveren_fsm.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"beveren_fsm.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }


website_route_rules = [
	{"from_route": "/schedule", "to_route": "schedule"},
	{"from_route": "/schedule/<path:app_path>", "to_route": "schedule"},
]
