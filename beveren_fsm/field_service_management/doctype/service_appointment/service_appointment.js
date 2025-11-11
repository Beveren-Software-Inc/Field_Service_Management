// Copyright (c) 2025, Beveren Software and contributors
// For license information, please see license.txt

frappe.ui.form.on("Service Appointment", {
  onload: function (frm) {
    // Hide either quotation or request
    if (frm.doc.service_order) frm.toggle_enable("service_quotation", 0);
    if (frm.doc.service_quotation) frm.toggle_enable("service_order", 0);
  },
  refresh(frm) {
    // Set Posting Date
    if (frm.doc.__islocal && !frm.doc.posting_date) {
      frm.set_value("posting_date", frappe.datetime.get_today());
    }

    // Hide either quotation or request
    if (frm.doc.service_order) frm.toggle_enable("service_quotation", 0);
    if (frm.doc.service_quotation) frm.toggle_enable("service_order", 0);

    frm.trigger("disable_invoicing");
    frm.trigger("disable_items_and_techs_edit");
    frm.trigger("disable_schedule_fields_on_submit");

    if (frm.doc.docstatus == 1 && !frm.is_dirty()) {
      if (frm.doc.status == "Scheduled") {
        frm
          .add_custom_button(__("Dispatch"), function () {
            frappe.confirm(
              "Are you sure you want to Dispatch?",
              () => {
                frm.set_value("status", "Dispatched");
                frm.save("Update");
              },
              () => {
                return;
              }
            );
          })
          .removeClass("btn-default")
          .addClass("btn-primary");
        // Reschedule
        frm
          .add_custom_button(__("Reschedule"), function () {
            frm.trigger("schedule_appointment");
          })
          .removeClass("btn-default")
          .addClass("btn-info");
      }
      if (frm.doc.status == "Dispatched") {
        frm
          .add_custom_button(__("Start Work"), function () {
            frm.trigger("start_work");
          })
          .removeClass("btn-default")
          .addClass("btn-info")
          .addClass("text-white");
      }
      if (frm.doc.status == "In Progress") {
        frm
          .add_custom_button(__("Complete"), function () {
            frm.trigger("complete_work");
          })
          .removeClass("btn-default")
          .addClass("btn-success");
      }
      // ENable Invoice on COndition
      let items = frm.doc.items || [];
      let non_invoiced_items = [];
      items.forEach((item) => {
        let invoiced_qty = item.invoiced_qty || 0;
        let remaining_qty = item.qty - invoiced_qty;
        if (remaining_qty > 0) {
          non_invoiced_items.push({
            item_code: item.item_code,
          });
        }
      });

      if (non_invoiced_items.length) {
        frm.add_custom_button(
          __("Sales Invoice"),
          () => {
            frm.trigger("invoice_appointment");
          },
          __("Create")
        );
      }
      cur_frm.page.set_inner_btn_group_as_primary(__("Create"));
    }
  },
  disable_invoicing: (frm) => {
    // Fetch all parts and services which are not invoiced
    let items = frm.doc.items || [];
    let non_invoiced_items = [];
    items.forEach((item) => {
      let invoiced_qty = item.invoiced_qty || 0;
      let remaining_qty = item.qty - invoiced_qty;
      if (remaining_qty > 0) {
        non_invoiced_items.push({
          item_code: item.item_code,
        });
      }
    });

    if (non_invoiced_items.length) {
      return;
    } else {
      $('.open-notification[title="Open Sales Invoice"]').hide();
      $('.icon-btn[data-doctype="Sales Invoice"]').hide();
    }
  },
  disable_items_and_techs_edit: (frm) => {
    //when appointment is complete
    let is_not_allowed = !["Completed"].includes(frm.doc.status);
    frm.toggle_enable(["items", "service_technicians"], is_not_allowed);
  },
  disable_schedule_fields_on_submit: (frm) => {
    if (frm.doc.docstatus == 1) {
      frm.set_df_property("scheduled_start_datetime", "read_only", 1);
      frm.set_df_property("scheduled_finish_datetime", "read_only", 1);
    }
  },

  invoice_appointment: (frm) => {
    let items = frm.doc.items || [];
    let non_invoiced_items = [];

    items.forEach((item) => {
      let invoiced_qty = item.invoiced_qty || 0;
      let remaining_qty = item.qty - invoiced_qty;
      if (remaining_qty > 0) {
        non_invoiced_items.push({
          item_code: item.item_code,
          item_name: item.item_name,
          qty: remaining_qty,
          max_qty: remaining_qty,
          rate: item.rate,
          amount: item.rate * remaining_qty,
        });
      }
    });

    if (non_invoiced_items.length === 0) {
      frappe.msgprint("This Appointment is already fully Invoiced.");
      return;
    }

    function mergeDuplicates(items) {
      let mergedItems = items.reduce((acc, item) => {
        let existingItem = acc.find((i) => i.item_code === item.item_code);
        if (existingItem) {
          existingItem.qty += item.qty;
          existingItem.max_qty += item.max_qty;
          existingItem.amount = existingItem.rate * existingItem.qty;
        } else {
          acc.push({ ...item });
        }
        return acc;
      }, []);
      return mergedItems;
    }
    non_invoiced_items = mergeDuplicates(non_invoiced_items);

    // Create the dialog to show non-invoiced items
    const dialog = new frappe.ui.Dialog({
      title: __("Services and Parts to Invoice"),
      fields: [
        {
          fieldname: "service_items",
          fieldtype: "Table",
          label: __("Services and Parts"),
          options: "Service Order Item",
          in_place_edit: true,
          reqd: 1,
          fields: [
            {
              fieldname: "item_code",
              label: __("Item Code"),
              fieldtype: "Link",
              options: "Item",
              in_list_view: 1,
            },
            {
              fieldname: "qty",
              label: __("Quantity"),
              fieldtype: "Float",
              in_list_view: 1,
            },
            {
              fieldname: "rate",
              label: __("Rate"),
              fieldtype: "Currency",
              in_list_view: 1,
              read_only: 1,
            },
            {
              fieldname: "amount",
              label: __("Amount"),
              fieldtype: "Currency",
              in_list_view: 1,
            },
            {
              fieldname: "max_qty",
              label: __("Max Quantity"),
              fieldtype: "Float",
              hidden: 1,
            },
          ],
        },
      ],
      primary_action: (values) => {
        let tableField = dialog.get_field("service_items");
        tableField.df.data.forEach((item) => {
          if (item.max_qty < item.qty) {
            frappe.throw(
              __("Quantity for {0} cannot exceed {1}", [
                item.item_code,
                item.max_qty,
              ])
            );
            return;
          }
          item.amount = item.rate * item.qty;
        });
        tableField.grid.refresh();
        frappe.call({
          method:
            "beveren_fsm.field_service_management.fsm_utils.create_service_invoice",
          args: {
            doctype: frm.doc.doctype,
            docname: frm.doc.name,
            customer: frm.doc.customer,
            items: values.service_items,
          },
          callback: function (r) {
            if (r.message) {
              frappe.set_route("Form", "Sales Invoice", r.message);
            }
          },
        });
        dialog.hide();
      },
      primary_action_label: __("Create Invoice"),
      secondary_action: (e, values) => {
        let tableField = dialog.get_field("service_items");
        tableField.df.data.forEach((item) => {
          if (item.max_qty < item.qty) {
            frappe.throw(
              __("Quantity for {0} cannot exceed {1}", [
                item.item_code,
                item.max_qty,
              ])
            );
            return;
          }
          item.amount = item.rate * item.qty;
        });
        tableField.grid.refresh();
      },
      secondary_action_label: __("Refresh Amount"),
    });
    let tableField = dialog.get_field("service_items");
    tableField.df.data = non_invoiced_items;
    tableField.grid.refresh();

    dialog.show();
  },

  schedule_appointment: (frm) => {
    prompt_title =
      frm.doc.status == "Scheduled"
        ? "Reschedule Appointment"
        : "Schedule Appointment";
    primary_action_label =
      frm.doc.status == "Scheduled" ? "Reschedule" : "Schedule";
    frappe.prompt(
      [
        {
          label: "Scheduled Start Datetime",
          fieldname: "scheduled_start_datetime",
          fieldtype: "Datetime",
        },
        {
          fieldname: "column_break_appointment",
          fieldtype: "Column Break",
        },
        {
          label: "Scheduled Finish Datetime",
          fieldname: "scheduled_finish_datetime",
          fieldtype: "Datetime",
        },
      ],
      (values) => {
        // Schedule
        frappe.model.set_value(
          frm.doctype,
          frm.docname,
          "scheduled_start_datetime",
          values.scheduled_start_datetime
        );
        frappe.model.set_value(
          frm.doctype,
          frm.docname,
          "scheduled_finish_datetime",
          values.scheduled_finish_datetime
        );
        frm.set_value("status", "Scheduled");
        frm.save("Update");
      },
      prompt_title,
      primary_action_label
    );
  },
  dispatch_appointment: (frm) => {
    const dialog = new frappe.ui.Dialog({
      title: __("Dispatch"),
      fields: [
        {
          fieldname: "service_technician_item",
          fieldtype: "Table",
          label: __("Service Crew"),
          options: "Service Technician Item",
          in_place_edit: true,
          reqd: 1,
          fields: [
            {
              fieldname: "service_technician",
              label: __("Service Technician"),
              fieldtype: "Link",
              options: "Service Technician",
              reqd: 1,
              in_list_view: 1,
            },
          ],
        },
      ],
      primary_action: (values) => {
        // Dispatch
        let items = values.service_technician_item;
        let new_row = frm.add_child("service_technicians");
        items.forEach((item) => {
          frappe.model.set_value(
            new_row.doctype,
            new_row.name,
            "service_technician",
            item.service_technician
          );
        });
        frm.set_value("status", "Dispatched");
        frm.save("Update");

        dialog.hide();
      },
      primary_action_label: __("Dispatch"),
    });
    dialog.show();
  },
  schedule_and_dispatch_appointment: (frm) => {
    const dialog = new frappe.ui.Dialog({
      title: __("Schedule and Dispatch"),
      fields: [
        {
          label: "Scheduled Start Datetime",
          fieldname: "scheduled_start_datetime",
          fieldtype: "Datetime",
        },
        {
          fieldname: "column_break_appointment",
          fieldtype: "Column Break",
        },
        {
          label: "Scheduled Finish Datetime",
          fieldname: "scheduled_finish_datetime",
          fieldtype: "Datetime",
        },
        {
          fieldname: "section_break_appointment",
          fieldtype: "Section Break",
        },
        {
          fieldname: "service_technician_item",
          fieldtype: "Table",
          label: __("Service Crew"),
          options: "Service Technician Item",
          in_place_edit: true,
          reqd: 1,
          fields: [
            {
              fieldname: "service_technician",
              label: __("Service Technician"),
              fieldtype: "Link",
              options: "Service Technician",
              reqd: 1,
              in_list_view: 1,
            },
          ],
        },
      ],
      primary_action: (values) => {
        // Schedule
        frappe.model.set_value(
          frm.doctype,
          frm.docname,
          "scheduled_start_datetime",
          values.scheduled_start_datetime
        );
        frappe.model.set_value(
          frm.doctype,
          frm.docname,
          "scheduled_finish_datetime",
          values.scheduled_finish_datetime
        );

        // Dispatch
        let items = values.service_technician_item;
        let new_row = frm.add_child("service_technicians");
        items.forEach((item) => {
          frappe.model.set_value(
            new_row.doctype,
            new_row.name,
            "service_technician",
            item.service_technician
          );
        });
        frm.set_value("status", "Dispatched");
        frm.save("Update");

        dialog.hide();
      },
      primary_action_label: __("Schedule and Dispatch"),
    });
    dialog.show();
  },
  start_work(frm) {
    frm.events.prompt_movement(frm, {
      title: __("Start Work"),
      success_status: "In Progress",
      success_callback: () => {
        frm.set_value("actual_start_datetime", frappe.datetime.now_datetime());
      },
    });
  },
  complete_work(frm) {
    frm.events.prompt_movement(frm, {
      title: __("Complete Appointment"),
      success_status: "Completed",
      success_callback: () => {
        frm.set_value("actual_finish_datetime", frappe.datetime.now_datetime());
      },
    });
  },
  prompt_movement(frm, config) {
    if (!frm.doc.service_order) {
      frappe.throw(
        __(
          "This appointment is not linked to a Service Order. Product movement cannot be recorded."
        )
      );
    }

    const dialog = new frappe.ui.Dialog({
      title: config.title || __("Update Movement"),
      fields: [
        {
          fieldname: "product_location",
          fieldtype: "Link",
          label: __("Product Location"),
          options: "Product Location",
          reqd: 1,
        },
        {
          fieldname: "movement_date",
          fieldtype: "Date",
          label: __("Movement Date"),
          default: frappe.datetime.get_today(),
          reqd: 1,
        },
        {
          fieldname: "notes",
          fieldtype: "Small Text",
          label: __("Notes"),
        },
      ],
      primary_action_label: __("Confirm"),
      primary_action(values) {
        const productLocation =
          values.product_location || values.movement_type || null;
        if (!productLocation) {
          frappe.msgprint(__("Please select a Product Location."));
          return;
        }

        dialog.disable_primary_action();

        frm.events
          .record_product_movement_from_appointment(frm, {
            ...values,
            product_location: productLocation,
          })
          .then(() => {
            if (typeof config.success_callback === "function") {
              config.success_callback();
            }
            if (config.success_status) {
              frm.set_value("status", config.success_status);
            }
            frm
              .save("Update")
              .then(() => {
                frappe.show_alert(
                  __("Appointment updated and product movement recorded.")
                );
              })
              .catch(() => {
                frappe.msgprint(
                  __(
                    "Appointment was updated locally, but saving failed. Please try again."
                  )
                );
              });
            dialog.hide();
          })
          .catch(() => {
            dialog.enable_primary_action();
          });
      },
      secondary_action_label: __("Cancel"),
      secondary_action() {
        dialog.hide();
      },
    });

    dialog.show();
  },
  record_product_movement_from_appointment(frm, values) {
    if (!frm.doc.service_order) {
      frappe.msgprint(
        __("Service Order link is missing. Cannot record product movement.")
      );
      return Promise.reject();
    }

    const productLocation =
      values.product_location || values.movement_type || null;
    if (!productLocation) {
      frappe.msgprint(__("Product location is required to record movement."));
      return Promise.reject();
    }

    const args = {
      service_order: frm.doc.service_order,
      product_location: productLocation,
      movement_type: productLocation,
      movement_date: values.movement_date,
      linked_document_type: "Service Appointment",
      linked_document: frm.doc.name,
    };

    return frappe
      .call({
        method:
          "beveren_fsm.field_service_management.doctype.service_order.service_order.record_product_movement",
        args,
      })
      .catch((error) => {
        console.error(error);
        frappe.msgprint({
          title: __("Product Movement"),
          indicator: "red",
          message: __(
            "Unable to record product movement. Please review the Service Request manually."
          ),
        });
        throw error;
      });
  },
});
