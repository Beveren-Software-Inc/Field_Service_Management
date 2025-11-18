// Ensure this namespace exists
frappe.provide("beveren_fsm.field_service_management");

cur_frm.cscript.tax_table = "Sales Taxes and Charges";
erpnext.accounts.taxes.setup_tax_validations(
  "Sales Taxes and Charges Template"
);
erpnext.accounts.taxes.setup_tax_filters("Sales Taxes and Charges");
erpnext.sales_common.setup_selling_controller();

frappe.ui.form.on("Service Order", {
  setup: function (frm) {
    frm.custom_make_buttons = {
      "Service Appointment": "Service Appointment",
    };
  },
  onload: function (frm) {
    // Hide either quotation or request
    if (frm.doc.service_request) frm.toggle_enable("service_quotation", 0);
    if (frm.doc.service_quotation) frm.toggle_enable("service_request", 0);
  },
  validate: function (frm) {
    // check if items table has at least one item
    if (!frm.doc.items.length) {
      frappe.throw("Please add at least one item!");
      return;
    }
  },
  refresh(frm) {
    if (frm.doc.docstatus === 0) {
      frm.__over_budget_confirmed = false;
    }

    // set posting date
    frm.trigger("set_posting_date");

    // Hide either quotation or request
    if (frm.doc.service_request) frm.toggle_enable("service_quotation", 0);
    if (frm.doc.service_quotation) frm.toggle_enable("service_request", 0);

    // Enable/Disable Invoicing
    frm.trigger("set_enable_invoicing");
    frm.trigger("disable_creating_appointment");
    frm.trigger("disable_items_edit");

    // if(frm.doc.status == 'Open' && !frm.doc.__islocal){
    // 	frm.add_custom_button(
    // 		__("Hold"),
    // 		() => frappe.msgprint('Coming Soon!'),
    // 		__("Status")
    // 	);
    // 	frm.add_custom_button(
    // 		__("Complete"),
    // 		() => frappe.msgprint('Coming Soon!'),
    // 		__("Status")
    // 	);
    // }
    if (frm.doc.docstatus === 1 && !frm.is_dirty()) {
      const isReviewOrCompleted =
        frm.doc.status === "Review" || frm.doc.status === "Completed";

      if (!isReviewOrCompleted) {
        if (
          ![
            "Scheduled",
            "Dispatched",
            "In Progress",
            "Completed",
            "Review",
          ].includes(frm.doc.status)
        ) {
          frm.add_custom_button(
            __("Service Appointment"),
            () => {
              frm.trigger("make_appointment_from_order");
            },
            __("Create")
          );
        }
        // Enable Invoice on Condition
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
              frm.trigger("create_service_invoice");
            },
            __("Create")
          );
        }
        frm.add_custom_button(
          __("Stock Entry"),
          () => frm.events.create_stock_entry(frm),
          __("Create")
        );
        frm.add_custom_button(
          __("Delivery Note"),
          () => frm.events.create_delivery_note(frm),
          __("Create")
        );
        frm.add_custom_button(
          __("Purchase Receipt"),
          () => frm.events.create_purchase_receipt(frm),
          __("Create")
        );
        frm.add_custom_button(
          __("Purchase Order"),
          () => frm.events.create_purchase_order(frm),
          __("Create")
        );
        frm.add_custom_button(
          __("Purchase Invoice"),
          () => frm.events.create_purchase_invoice(frm),
          __("Create")
        );
        cur_frm.page.set_inner_btn_group_as_primary(__("Create"));
      } else {
        frm.clear_custom_buttons();
        frm.trigger("hide_create_icon_buttons");
      }
    }

    // Complete Button
    if (frm.doc.status == "Review") {
      frm
        .add_custom_button(__("Complete"), function () {
          frm.set_value("status", "Completed");
          frm.save("Update");
        })
        .removeClass("btn-default")
        .addClass("btn-success");
    }
  },
  set_posting_date: function (frm) {
    if (!frm.doc.posting_date) {
      frm.set_value("posting_date", frappe.datetime.get_today());
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
  set_enable_invoicing: (frm) => {
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
  disable_items_edit: (frm) => {
    //when appointment is going on, if anything add in appointment
    let is_not_allowed = ![
      "Scheduled",
      "Dispatched",
      "In Progress",
      "Completed",
    ].includes(frm.doc.status);
    frm.toggle_enable(["items", "service_technicians"], is_not_allowed);
  },
  disable_creating_appointment: (frm) => {
    if (
      !["Scheduled", "Dispatched", "In Progress", "Completed"].includes(
        frm.doc.status
      )
    ) {
      return;
    } else {
      $('.open-notification[title="Open Service Appointment"]').hide();
      $('.icon-btn[data-doctype="Service Appointment"]').hide();
    }
  },
  hide_create_icon_buttons: (frm) => {
    const doctypesToHide = [
      "Service Appointment",
      "Sales Invoice",
      "Stock Entry",
      "Delivery Note",
      "Purchase Receipt",
      "Purchase Order",
      "Purchase Invoice",
    ];

    doctypesToHide.forEach((doctype) => {
      $(`.open-notification[title="Open ${doctype}"]`).hide();
      $(`.icon-btn[data-doctype="${doctype}"]`).hide();
    });
  },
  make_appointment_from_order: (frm) => {
    frappe.model.open_mapped_doc({
      method:
        "beveren_fsm.field_service_management.doctype.service_appointment.service_appointment.make_appointment_from_order",
      frm: frm,
    });
  },
  create_service_invoice: (frm) => {
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
      frappe.msgprint("This Order is already fully Invoiced.");
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
  create_stock_entry(frm) {
    frm.events.open_logistics_dialog(frm, {
      doc_type: "Stock Entry",
      method:
        "beveren_fsm.field_service_management.doctype.service_order.service_order.make_stock_entry",
    });
  },
  create_delivery_note(frm) {
    frm.events.open_logistics_dialog(frm, {
      doc_type: "Delivery Note",
      method:
        "beveren_fsm.field_service_management.doctype.service_order.service_order.make_delivery_note",
    });
  },
  create_purchase_receipt(frm) {
    frm.events.open_logistics_dialog(frm, {
      doc_type: "Purchase Receipt",
      method:
        "beveren_fsm.field_service_management.doctype.service_order.service_order.make_purchase_receipt",
    });
  },
  create_purchase_order(frm) {
    frm.events.open_logistics_dialog(frm, {
      doc_type: "Purchase Order",
      method:
        "beveren_fsm.field_service_management.doctype.service_order.service_order.make_purchase_order",
    });
  },
  create_purchase_invoice(frm) {
    frm.events.open_logistics_dialog(frm, {
      doc_type: "Purchase Invoice",
      method:
        "beveren_fsm.field_service_management.doctype.service_order.service_order.make_purchase_invoice",
    });
  },
  open_logistics_dialog(frm, config) {
    if (!frm.doc.name) {
      frappe.throw(
        __("Please save the Service Order before creating logistics documents.")
      );
    }

    let stockItems = [];
    let deliveryItems = [];
    let purchaseReceiptItems = [];
    let purchaseItems = [];
    let orderItems = [...(frm.doc.items || [])];

    const primaryItemCode = (frm.doc.item_code || "").trim();
    if (primaryItemCode) {
      const primaryItemIndex = orderItems.findIndex(
        (item) => (item.item_code || "").trim() === primaryItemCode
      );

      if (primaryItemIndex > 0) {
        const [primaryItem] = orderItems.splice(primaryItemIndex, 1);
        orderItems.unshift(primaryItem);
      } else if (primaryItemIndex === -1) {
        orderItems.unshift({
          item_code: primaryItemCode,
          item_name: frm.doc.item_name || primaryItemCode,
          description: frm.doc.description || "",
          qty: 1,
          max_qty: 1,
          rate: 0,
          amount: 0,
          warehouse: frm.doc.warehouse || "",
          s_warehouse: frm.doc.warehouse || "",
          t_warehouse: "",
          cost_center: frm.doc.cost_center || "",
          expense_account: "",
          is_service: 0,
          serial_no: frm.doc.serial_no || "",
          uom: frm.doc.uom || frm.doc.stock_uom || "",
          stock_uom: frm.doc.stock_uom || frm.doc.uom || "",
        });
      }
    }

    if (
      primaryItemCode &&
      orderItems.length &&
      (orderItems[0].item_code || "").trim() === primaryItemCode
    ) {
      if (frm.doc.serial_no && !orderItems[0].serial_no) {
        orderItems[0].serial_no = frm.doc.serial_no;
      }
      if (!orderItems[0].uom) {
        orderItems[0].uom = frm.doc.uom || frm.doc.stock_uom || "";
      }
      if (!orderItems[0].stock_uom) {
        orderItems[0].stock_uom = frm.doc.stock_uom || frm.doc.uom || "";
      }
    }

    if (config.doc_type === "Stock Entry") {
      stockItems = orderItems.filter((item) => !item.is_service);
      if (!stockItems.length) {
        frappe.msgprint(__("No stock items are available to transfer."));
        return;
      }
    }

    if (config.doc_type === "Delivery Note") {
      deliveryItems = orderItems.filter((item) => !item.is_service);
      if (!deliveryItems.length) {
        frappe.msgprint(__("No deliverable items are available."));
        return;
      }
    }

    if (config.doc_type === "Purchase Receipt") {
      purchaseReceiptItems = orderItems.filter((item) => !item.is_service);
      if (!purchaseReceiptItems.length) {
        frappe.msgprint(__("No items are available to receive."));
        return;
      }
      purchaseReceiptItems = purchaseReceiptItems.map((item) => {
        const qty =
          typeof item.qty === "number" ? item.qty : parseFloat(item.qty) || 0;
        const rate =
          typeof item.rate === "number"
            ? item.rate
            : parseFloat(item.rate) || 0;
        return {
          include_item: 1,
          item_code: item.item_code,
          item_name: item.item_name,
          qty,
          max_qty: qty,
          warehouse: item.warehouse || "",
          rate,
          amount: rate * qty,
          serial_no: item.serial_no || "",
        };
      });
    }

    if (
      config.doc_type === "Purchase Order" ||
      config.doc_type === "Purchase Invoice"
    ) {
      purchaseItems = orderItems.map((item) => ({
        include_item: 1,
        item_code: item.item_code,
        item_name: item.item_name,
        qty: item.qty,
        max_qty: item.qty,
        rate: item.rate,
        amount:
          (typeof item.rate === "number"
            ? item.rate
            : parseFloat(item.rate) || 0) *
          (typeof item.qty === "number" ? item.qty : parseFloat(item.qty) || 0),
        warehouse: item.warehouse || "",
        cost_center: item.cost_center || "",
        expense_account: item.expense_account || "",
        serial_no: item.serial_no || "",
      }));
      if (!purchaseItems.length) {
        frappe.msgprint(__("No items are available for purchasing."));
        return;
      }
    }

    // Map document types to default Product Location values
    const defaultProductLocations = {
      "Delivery Note": "Deliver to Customer",
      "Purchase Receipt": "Receive from Vendor",
      "Purchase Invoice": "Receive from Vendor",
      "Purchase Order": "Sent to Vendor",
      "Stock Entry": "Receive From Customer",
    };

    const defaultProductLocation =
      defaultProductLocations[config.doc_type] || "";

    const fields = [
      {
        fieldname: "product_location",
        fieldtype: "Link",
        label: __("Product Movement Type"),
        options: "Product Location",
        reqd: 1,
        default: defaultProductLocation,
      },
      {
        fieldname: "movement_date",
        fieldtype: "Date",
        label: __("Movement Date"),
        default: frappe.datetime.get_today(),
        reqd: 1,
      },
    ];

    if (config.doc_type === "Stock Entry") {
      fields.push({
        fieldname: "stock_items",
        fieldtype: "Table",
        label: __("Items to Transfer"),
        options: "Service Order Item",
        in_place_edit: true,
        reqd: 1,
        fields: [
          {
            fieldname: "include_item",
            fieldtype: "Check",
            label: __("Include"),
            default: 1,
            in_list_view: 1,
            width: "60px",
          },
          {
            fieldname: "item_code",
            label: __("Item Code"),
            fieldtype: "Link",
            options: "Item",
            in_list_view: 1,
            read_only: 1,
          },
          {
            fieldname: "item_name",
            label: __("Item Name"),
            fieldtype: "Data",
            in_list_view: 1,
            read_only: 1,
          },
          {
            fieldname: "serial_no",
            label: __("Serial No"),
            fieldtype: "Data",
            in_list_view: 1,
            read_only: 1,
          },
          {
            fieldname: "qty",
            label: __("Quantity"),
            fieldtype: "Float",
            in_list_view: 1,
          },
          {
            fieldname: "max_qty",
            label: __("Max Quantity"),
            fieldtype: "Float",
            read_only: 1,
            hidden: 1,
          },
          {
            fieldname: "s_warehouse",
            label: __("Source Warehouse"),
            fieldtype: "Link",
            options: "Warehouse",
            in_list_view: 1,
          },
          {
            fieldname: "t_warehouse",
            label: __("Target Warehouse"),
            fieldtype: "Link",
            options: "Warehouse",
            in_list_view: 1,
          },
        ],
      });
    }

    if (config.doc_type === "Delivery Note") {
      fields.push({
        fieldname: "delivery_items",
        fieldtype: "Table",
        label: __("Items to Deliver"),
        options: "Service Order Item",
        in_place_edit: true,
        reqd: 1,
        fields: [
          {
            fieldname: "include_item",
            fieldtype: "Check",
            label: __("Include"),
            default: 1,
            in_list_view: 1,
            width: "60px",
          },
          {
            fieldname: "item_code",
            label: __("Item Code"),
            fieldtype: "Link",
            options: "Item",
            in_list_view: 1,
            read_only: 1,
          },
          {
            fieldname: "item_name",
            label: __("Item Name"),
            fieldtype: "Data",
            in_list_view: 1,
            read_only: 1,
          },
          {
            fieldname: "qty",
            label: __("Quantity"),
            fieldtype: "Float",
            in_list_view: 1,
          },
          {
            fieldname: "max_qty",
            label: __("Max Quantity"),
            fieldtype: "Float",
            read_only: 1,
            hidden: 1,
          },
          {
            fieldname: "warehouse",
            label: __("Warehouse"),
            fieldtype: "Link",
            options: "Warehouse",
            in_list_view: 1,
          },
          {
            fieldname: "rate",
            label: __("Rate"),
            fieldtype: "Currency",
            read_only: 1,
            in_list_view: 1,
          },
          {
            fieldname: "amount",
            label: __("Amount"),
            fieldtype: "Currency",
            read_only: 1,
            in_list_view: 1,
          },
        ],
      });
    }

    if (config.doc_type === "Purchase Receipt") {
      fields.push({
        fieldname: "purchase_receipt_items",
        fieldtype: "Table",
        label: __("Items to Receive"),
        options: "Service Order Item",
        in_place_edit: true,
        reqd: 1,
        fields: [
          {
            fieldname: "include_item",
            fieldtype: "Check",
            label: __("Include"),
            default: 1,
            in_list_view: 1,
            width: "60px",
          },
          {
            fieldname: "item_code",
            label: __("Item Code"),
            fieldtype: "Link",
            options: "Item",
            in_list_view: 1,
            read_only: 1,
          },
          {
            fieldname: "item_name",
            label: __("Item Name"),
            fieldtype: "Data",
            in_list_view: 1,
            read_only: 1,
          },
          {
            fieldname: "qty",
            label: __("Quantity"),
            fieldtype: "Float",
            in_list_view: 1,
          },
          {
            fieldname: "max_qty",
            label: __("Max Quantity"),
            fieldtype: "Float",
            read_only: 1,
            hidden: 1,
          },
          {
            fieldname: "warehouse",
            label: __("Warehouse"),
            fieldtype: "Link",
            options: "Warehouse",
            in_list_view: 1,
          },
          {
            fieldname: "rate",
            label: __("Rate"),
            fieldtype: "Currency",
            in_list_view: 1,
          },
          {
            fieldname: "amount",
            label: __("Amount"),
            fieldtype: "Currency",
            read_only: 1,
            in_list_view: 1,
          },
        ],
      });
    }

    if (
      config.doc_type === "Purchase Order" ||
      config.doc_type === "Purchase Invoice"
    ) {
      fields.push({
        fieldname: "purchase_items",
        fieldtype: "Table",
        label: __("Items to Purchase"),
        options: "Service Order Item",
        in_place_edit: true,
        reqd: 1,
        fields: [
          {
            fieldname: "include_item",
            fieldtype: "Check",
            label: __("Include"),
            default: 1,
            in_list_view: 1,
            width: "60px",
          },
          {
            fieldname: "item_code",
            label: __("Item Code"),
            fieldtype: "Link",
            options: "Item",
            in_list_view: 1,
            read_only: 1,
          },
          {
            fieldname: "item_name",
            label: __("Item Name"),
            fieldtype: "Data",
            in_list_view: 1,
            read_only: 1,
          },
          {
            fieldname: "qty",
            label: __("Quantity"),
            fieldtype: "Float",
            in_list_view: 1,
          },
          {
            fieldname: "max_qty",
            label: __("Max Quantity"),
            fieldtype: "Float",
            read_only: 1,
            hidden: 1,
          },
          {
            fieldname: "rate",
            label: __("Rate"),
            fieldtype: "Currency",
            in_list_view: 1,
          },
          {
            fieldname: "amount",
            label: __("Amount"),
            fieldtype: "Currency",
            read_only: 1,
            in_list_view: 1,
          },
          {
            fieldname: "warehouse",
            label: __("Warehouse"),
            fieldtype: "Link",
            options: "Warehouse",
            in_list_view: 1,
          },
          {
            fieldname: "cost_center",
            label: __("Cost Center"),
            fieldtype: "Link",
            options: "Cost Center",
            hidden: 1,
          },
          {
            fieldname: "expense_account",
            label: __("Expense Account"),
            fieldtype: "Link",
            options: "Account",
            hidden: 1,
          },
        ],
      });
    }

    const dialog = new frappe.ui.Dialog({
      title: __("Create {0}", [config.doc_type]),
      fields,
      primary_action_label: __("Continue"),
      primary_action(values) {
        const productLocation =
          values.product_location || values.movement_type || null;
        if (!productLocation) {
          frappe.msgprint(__("Please select a Product Location."));
          return;
        }

        dialog.disable_primary_action();

        const methodArgs = {
          service_order: frm.doc.name,
          product_location: productLocation,
        };

        let selectedItems = [];
        if (config.doc_type === "Stock Entry") {
          const tableField = dialog.get_field("stock_items");
          let tableData = (tableField.df.data || []).filter(
            (row) => row.include_item
          );

          // Auto-select if only one item remains
          if (!tableData.length && (tableField.df.data || []).length === 1) {
            const firstRow = tableField.df.data[0];
            if (firstRow) {
              firstRow.include_item = 1;
              tableField.grid.refresh();
              tableData = [firstRow];
            }
          }

          if (!tableData.length) {
            dialog.enable_primary_action();
            frappe.throw(__("Select at least one item to transfer."));
          }

          tableData.forEach((row) => {
            if (row.max_qty && row.qty > row.max_qty) {
              dialog.enable_primary_action();
              frappe.throw(
                __(
                  "Quantity for item {0} exceeds the available quantity ({1}).",
                  [row.item_code, row.max_qty]
                )
              );
            }
          });

          selectedItems = tableData.map((row) => ({
            item_code: row.item_code,
            qty: row.qty,
            max_qty: row.max_qty,
            s_warehouse: row.s_warehouse,
            t_warehouse: row.t_warehouse,
            serial_no: row.serial_no,
          }));

          methodArgs.items = selectedItems;
        }

        if (config.doc_type === "Delivery Note") {
          const tableField = dialog.get_field("delivery_items");
          let tableData = (tableField.df.data || []).filter(
            (row) => row.include_item
          );

          if (!tableData.length && (tableField.df.data || []).length === 1) {
            const firstRow = tableField.df.data[0];
            if (firstRow) {
              firstRow.include_item = 1;
              tableField.grid.refresh();
              tableData = [firstRow];
            }
          }

          if (!tableData.length) {
            dialog.enable_primary_action();
            frappe.throw(__("Select at least one item to deliver."));
          }

          tableData.forEach((row) => {
            if (row.max_qty && row.qty > row.max_qty) {
              dialog.enable_primary_action();
              frappe.throw(
                __(
                  "Quantity for item {0} exceeds the available quantity ({1}).",
                  [row.item_code, row.max_qty]
                )
              );
            }
          });

          selectedItems = tableData.map((row) => ({
            item_code: row.item_code,
            qty: parseFloat(row.qty) || 0,
            uom: row.uom || row.stock_uom || null,
            stock_uom: row.stock_uom || row.uom || null,
            max_qty: row.max_qty,
            warehouse: row.warehouse,
            serial_no: row.serial_no || frm.doc.serial_no || "",
          }));

          methodArgs.items = selectedItems;
        }

        if (config.doc_type === "Purchase Receipt") {
          const tableField = dialog.get_field("purchase_receipt_items");
          let tableData = (tableField.df.data || []).filter(
            (row) => row.include_item
          );

          // Auto-select if only one item remains
          if (!tableData.length && (tableField.df.data || []).length === 1) {
            const firstRow = tableField.df.data[0];
            if (firstRow) {
              firstRow.include_item = 1;
              tableField.grid.refresh();
              tableData = [firstRow];
            }
          }

          if (!tableData.length) {
            dialog.enable_primary_action();
            frappe.throw(__("Select at least one item to receive."));
          }

          tableData.forEach((row) => {
            if (row.max_qty && row.qty > row.max_qty) {
              dialog.enable_primary_action();
              frappe.throw(
                __(
                  "Quantity for item {0} exceeds the available quantity ({1}).",
                  [row.item_code, row.max_qty]
                )
              );
            }

            const qty = parseFloat(row.qty) || 0;
            const rate = parseFloat(row.rate) || 0;
            row.amount = rate * qty;
          });

          selectedItems = tableData.map((row) => ({
            item_code: row.item_code,
            qty: row.qty,
            max_qty: row.max_qty,
            warehouse: row.warehouse,
            rate: row.rate,
            amount: row.amount,
            serial_no: row.serial_no,
          }));

          methodArgs.items = selectedItems;
        }

        if (
          config.doc_type === "Purchase Order" ||
          config.doc_type === "Purchase Invoice"
        ) {
          const tableField = dialog.get_field("purchase_items");
          let tableData = (tableField.df.data || []).filter(
            (row) => row.include_item
          );

          // Auto-select if only one item remains
          if (!tableData.length && (tableField.df.data || []).length === 1) {
            const firstRow = tableField.df.data[0];
            if (firstRow) {
              firstRow.include_item = 1;
              tableField.grid.refresh();
              tableData = [firstRow];
            }
          }

          if (!tableData.length) {
            dialog.enable_primary_action();
            frappe.throw(__("Select at least one item to purchase."));
          }

          tableData.forEach((row) => {
            if (row.max_qty && row.qty > row.max_qty) {
              dialog.enable_primary_action();
              frappe.throw(
                __(
                  "Quantity for item {0} exceeds the available quantity ({1}).",
                  [row.item_code, row.max_qty]
                )
              );
            }
            const qty = parseFloat(row.qty) || 0;
            const rate = parseFloat(row.rate) || 0;
            row.amount = rate * qty;
          });

          selectedItems = tableData.map((row) => ({
            item_code: row.item_code,
            qty: row.qty,
            max_qty: row.max_qty,
            rate: row.rate,
            amount: row.amount,
            warehouse: row.warehouse,
            cost_center: row.cost_center,
            expense_account: row.expense_account,
            serial_no: row.serial_no,
          }));

          methodArgs.items = selectedItems;
        }

        let docname = null;
        frappe.call({
          method: config.method,
          args: methodArgs,
          callback(r) {
            dialog.enable_primary_action();
            if (r.exc) {
              return;
            }

            if (r.message) {
              const doc = frappe.model.sync(r.message)[0];
              if (doc?.name && !doc.name.startsWith("new-")) {
                docname = doc.name;
              }
              frappe.set_route("Form", doc.doctype, doc.name);
            }

            const movementArgs = {
              service_order: frm.doc.name,
              product_location: productLocation,
              movement_type: productLocation,
              movement_date: values.movement_date,
            };

            if (docname) {
              movementArgs.linked_document_type = config.doc_type;
              movementArgs.linked_document = docname;
            }

            frappe.call({
              method:
                "beveren_fsm.field_service_management.doctype.service_order.service_order.record_product_movement",
              args: movementArgs,
              callback: () => {
                frappe.show_alert({
                  message: __("Product movement logged on Service Request."),
                  indicator: "green",
                });
              },
              error: () => {
                frappe.msgprint({
                  title: __("Product Movement"),
                  indicator: "red",
                  message: __(
                    "Unable to record product movement. Please review the Service Request manually."
                  ),
                });
              },
            });
          },
          error: () => {
            dialog.enable_primary_action();
          },
        });
        dialog.hide();
      },
    });

    if (config.doc_type === "Stock Entry") {
      const tableField = dialog.get_field("stock_items");
      tableField.df.data = stockItems.map((item) => ({
        include_item: 1,
        item_code: item.item_code,
        item_name: item.item_name,
        qty: item.qty,
        max_qty: item.qty,
        s_warehouse: item.s_warehouse || item.warehouse || "",
        t_warehouse: item.t_warehouse || "",
        serial_no: item.serial_no || "",
      }));
      tableField.grid.refresh();
    }

    if (config.doc_type === "Delivery Note") {
      const tableField = dialog.get_field("delivery_items");
      tableField.df.data = deliveryItems.map((item) => ({
        include_item: 1,
        item_code: item.item_code,
        item_name: item.item_name,
        qty: item.qty,
        max_qty: item.qty,
        warehouse: item.warehouse || "",
        rate: item.rate,
        amount: item.amount,
        serial_no: item.serial_no || "",
        uom: item.uom || item.stock_uom || "",
        stock_uom: item.stock_uom || item.uom || "",
      }));
      tableField.grid.refresh();
    }

    if (config.doc_type === "Purchase Receipt") {
      const tableField = dialog.get_field("purchase_receipt_items");
      tableField.df.data = purchaseReceiptItems;
      tableField.grid.refresh();
    }

    if (
      config.doc_type === "Purchase Order" ||
      config.doc_type === "Purchase Invoice"
    ) {
      const tableField = dialog.get_field("purchase_items");
      tableField.df.data = purchaseItems;
      tableField.grid.refresh();
    }

    dialog.show();

    // Set the default Product Location value after dialog is shown
    if (defaultProductLocation) {
      setTimeout(() => {
        const productLocationField = dialog.get_field("product_location");
        if (productLocationField) {
          productLocationField.set_value(defaultProductLocation);
        }
      }, 100);
    }
  },
  before_submit(frm) {
    if (!frm.doc.is_over_budget || frm.__over_budget_confirmed) {
      return;
    }

    const dialog = new frappe.ui.Dialog({
      title: __("Confirm Submission"),
      fields: [
        {
          fieldtype: "HTML",
          options: `<div style="padding: 15px 0;">
            <p style="font-size: 14px; color: #333;">
              ${__(
                "This Service Order exceeds the linked AMC budget. Do you want to continue with submission?"
              )}
            </p>
          </div>`,
        },
      ],
      primary_action_label: __("Confirm"),
      primary_action() {
        frm.__over_budget_confirmed = true;
        dialog.hide();
        frm.savesubmit();
      },
      secondary_action_label: __("Cancel"),
      secondary_action() {
        frm.__over_budget_confirmed = false;
        dialog.hide();
      },
    });

    dialog.show();

    // Style the primary button to be orange after dialog is shown
    setTimeout(() => {
      const primaryBtn = dialog.$wrapper.find(".btn-primary");
      primaryBtn.css({
        "background-color": "#ff9800",
        "border-color": "#ff9800",
        color: "#fff",
      });

      // Add hover effect
      primaryBtn.on("mouseenter", function () {
        $(this).css({
          "background-color": "#f57c00",
          "border-color": "#f57c00",
        });
      });

      primaryBtn.on("mouseleave", function () {
        $(this).css({
          "background-color": "#ff9800",
          "border-color": "#ff9800",
        });
      });
    }, 100);

    frappe.validated = false;
  },
});

beveren_fsm.field_service_management.ServiceOrderController = class ServiceOrderController extends (
  erpnext.selling.SellingController
) {
  onload(doc, dt, dn) {
    super.onload(doc, dt, dn);
  }
  refresh(doc, dt, dn) {
    super.refresh(doc, dt, dn);
    if (doc.__islocal && !doc.posting_date) {
      this.frm.set_value("posting_date", frappe.datetime.get_today());
    }
    if (doc.__islocal && !doc.due_date) {
      this.frm.set_value(
        "due_date",
        frappe.datetime.add_months(doc.posting_date, 1)
      );
    }
  }
};

cur_frm.script_manager.make(
  beveren_fsm.field_service_management.ServiceOrderController
);
frappe.ui.form.on("Service Order Item", {
  item_code(frm, cdt, cdn) {
    const row = frappe.get_doc(cdt, cdn);
    if (!row.item_code) {
      return;
    }

    frappe.db.get_value("Item", row.item_code, "item_group").then((r) => {
      const itemGroup = (r.message?.item_group || "").trim().toLowerCase();

      const isService = ["service", "services"].includes(itemGroup) ? 1 : 0;

      if (row.is_service !== isService) {
        frappe.model.set_value(cdt, cdn, "is_service", isService);
      }
    });
  },
  items_on_form_rendered(frm, cdt, cdn) {
    // enable tax_amount field if Actual
  },
  packed_items_on_form_rendered(frm, cdt, cdn) {
    // enable tax_amount field if Actual
  },
});
