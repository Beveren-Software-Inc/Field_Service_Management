// Copyright (c) 2025, Beveren Software and contributors
// For license information, please see license.txt

frappe.ui.form.on("Service Request", {
  setup(frm) {
    frm.trigger("set_amc_contract_query");
  },
  refresh: function (frm) {
    // Disable connection links add
    frm.trigger("disable_connection_links_add");

    // Status Buttons
    if (
      frm.doc.docstatus === 1 &&
      !["Open", "Converted"].includes(frm.doc.status)
    ) {
      if (frm.doc.status === "On Hold") {
        frm.add_custom_button(
          __("Resume"),
          function () {
            frm.set_value("status", "Open");
            frm.save("Submit");
          },
          __("Status")
        );
      } else {
        frm.add_custom_button(
          __("Hold"),
          function () {
            frm.set_value("status", "On Hold");
            frm.save("Submit");
          },
          __("Status")
        );
      }
      if (frm.doc.status === "Closed") {
        frm.add_custom_button(
          __("Reopen"),
          function () {
            frm.set_value("status", "Open");
            frm.save("Submit");
            frm.remove_custom_button("Create");
          },
          __("Status")
        );
      } else {
        frm.add_custom_button(
          __("Close"),
          function () {
            frm.set_value("status", "Closed");
            frm.save("Submit");
            frm.remove_custom_button("Create");
          },
          __("Status")
        );
      }
    }

    // Create Button
    if (
      frm.doc.docstatus === 1 &&
      !["On Hold", "Quotation", "Converted", "Closed"].includes(frm.doc.status)
    ) {
      frm.add_custom_button(
        __("Service Quotation"),
        () => {
          frm.trigger("make_service_quotation");
        },
        __("Create")
      );
      frm.add_custom_button(
        __("Service Order"),
        () => {
          frm.trigger("make_order_from_request");
        },
        __("Create")
      );
      frm.page.set_inner_btn_group_as_primary(__("Create"));
    }
  },
  customer: function (frm) {
    frm.set_query("customer_address", function (doc) {
      return {
        filters: {
          link_doctype: "Customer",
          link_name: doc.customer,
        },
      };
    });
    frm.set_query("customer_contact", function (doc) {
      return {
        filters: {
          link_doctype: "Customer",
          link_name: doc.customer,
        },
      };
    });
    frm.trigger("set_amc_contract_query");
  },
  customer_address: function (frm) {
    if (frm.doc.customer_address) {
      frappe.call({
        method:
          "beveren_fsm.field_service_management.utils.address_util.get_address_details",
        args: { customer_address: frm.doc.customer_address },
        callback: function (r) {
          let details = r.message["details"] || "";
          frm.set_value("address_details", details);
        },
      });
    }
  },
  customer_contact: function (frm) {
    if (frm.doc.customer_contact) {
      frappe.call({
        method:
          "beveren_fsm.field_service_management.utils.address_util.get_contact_details",
        args: { customer_contact: frm.doc.customer_contact },
        callback: function (r) {
          let details = r.message["details"] || "";
          frm.set_value("contact_details", details);
        },
      });
    }
  },
  serial_no(frm) {
    frm.trigger("set_amc_contract_query");
  },
  item_code(frm) {
    frm.trigger("set_amc_contract_query");
  },
  disable_connection_links_add: (frm) => {
    if (!["Converted"].includes(frm.doc.status)) {
      return;
    } else {
      $('.open-notification[title="Open Service Order"]').hide();
      $('.icon-btn[data-doctype="Service Order"]').hide();

      $('.open-notification[title="Open Service Quotation"]').hide();
      $('.icon-btn[data-doctype="Service Quotation"]').hide();
    }
  },
  make_service_quotation: (frm) => {
    frappe.model.open_mapped_doc({
      method:
        "beveren_fsm.field_service_management.doctype.service_quotation.service_quotation.make_service_quotation",
      frm: frm,
    });
  },
  make_order_from_request: (frm) => {
    frappe.model.open_mapped_doc({
      method:
        "beveren_fsm.field_service_management.doctype.service_order.service_order.make_order_from_request",
      frm: frm,
      args: {
        source_doctype: frm.doc.doctype,
        target_doctype: "Service Order",
      },
    });
  },
  set_amc_contract_query(frm) {
    frm.set_query("amc_contract", function () {
      const filters = { docstatus: 1 };

      if (frm.doc.customer) {
        filters.customer = frm.doc.customer;
      }
      if (frm.doc.serial_no) {
        filters.serial_no = frm.doc.serial_no;
      }
      if (frm.doc.item_code) {
        filters.item_code = frm.doc.item_code;
      }

      return {
        filters,
      };
    });
  },
});
