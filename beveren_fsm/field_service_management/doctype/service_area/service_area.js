// Copyright (c) 2025, Beveren Software and contributors
// For license information, please see license.txt

frappe.ui.form.on("Service Area", {
  refresh(frm) {
    setup_location_autocomplete(frm);
  },
});

function setup_location_autocomplete(frm) {
  const field = frm.fields_dict.service_area;
  if (!field || !field.$input || !field.$input.length) return;

  const inputEl = field.$input.get(0);

  // Avoid double-binding
  if (inputEl.__bev_autocomplete_bound) return;
  inputEl.__bev_autocomplete_bound = true;

  // Helper: debounce
  const debounce = (fn, wait = 300) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), wait);
    };
  };

  // Create Awesomplete instance (bundled with Frappe Desk)
  const awesomplete = new Awesomplete(inputEl, {
    minChars: 2,
    autoFirst: true,
    filter: () => true, // we handle filtering via remote results
  });

  // Map from label to full place data
  let currentResults = [];

  const searchPlaces = debounce(async (q) => {
    if (!q || q.trim().length < 2) return;
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("q", q);
      url.searchParams.set("limit", "7");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("accept-language", frappe.boot?.lang || "en");

      const resp = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
        },
      });
      if (!resp.ok) return;
      const data = await resp.json();
      currentResults = (data || []).map((it) => ({
        label: it.display_name,
        value: it.display_name,
        lat: parseFloat(it.lat),
        lng: parseFloat(it.lon),
      }));
      awesomplete.list = currentResults.map((r) => r.label);
    } catch (e) {
      // Silent fail; keep UX smooth
    }
  }, 350);

  // Bind input listener
  field.$input.on("input", (e) => {
    const q = e.target.value;
    searchPlaces(q);
  });

  // When user chooses a suggestion
  inputEl.addEventListener("awesomplete-selectcomplete", (evt) => {
    const label = evt.text && (evt.text.value || evt.text);
    const match = currentResults.find((r) => r.label === label);
    if (!match) return;

    // Set name from selected location
    if (frm.doc.service_area !== match.value) {
      frm.set_value("service_area", match.value);
    }
  });
}
