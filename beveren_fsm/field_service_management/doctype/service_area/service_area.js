// Copyright (c) 2025, Beveren Software and contributors
// For license information, please see license.txt

frappe.ui.form.on("Service Area", {
  onload(frm) {
    // Validate existing location data
    if (frm.doc.location) {
      try {
        const loc =
          typeof frm.doc.location === "string"
            ? JSON.parse(frm.doc.location)
            : frm.doc.location;

        // Check if location is valid
        if (loc && loc.lat === 0 && loc.lng === 0) {
          // Clear invalid 0,0 coordinates
          frm.set_value("location", "");
        }
      } catch (e) {
        // Invalid JSON, clear it
        frm.set_value("location", "");
      }
    }

    // Setup autocomplete when form loads
    setTimeout(() => {
      setup_location_autocomplete(frm);
    }, 100);
  },
  refresh(frm) {
    // Setup autocomplete on refresh as well
    setup_location_autocomplete(frm);
  },
});

function setup_location_autocomplete(frm) {
  // Get the service_area field
  const field = frm.fields_dict.service_area;
  if (!field) {
    console.warn("Service Area field not found");
    return;
  }

  if (!field.$input || !field.$input.length) {
    console.warn("Service Area input element not found");
    return;
  }

  const inputEl = field.$input.get(0);
  if (!inputEl) {
    console.warn("Service Area input element is null");
    return;
  }

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

  // Store awesomplete instance and data on input element for persistence
  inputEl.__bev_awesomplete = awesomplete;
  inputEl.__bev_currentResults = [];
  inputEl.__bev_lastQuery = null;

  console.log("Autocomplete initialized for Service Area field");

  const searchPlaces = debounce((q) => {
    // Get instances from input element (ensures persistence across callbacks)
    const awesompleteInstance = inputEl.__bev_awesomplete;
    let currentResults = inputEl.__bev_currentResults || [];
    let lastQuery = inputEl.__bev_lastQuery;

    if (!awesompleteInstance) {
      console.warn("Awesomplete instance not found on input element");
      return;
    }

    if (!q || q.trim().length < 2) {
      awesompleteInstance.list = [];
      inputEl.__bev_lastQuery = null;
      return;
    }

    // Store the current query to identify stale responses
    const queryId = q.trim();
    inputEl.__bev_lastQuery = queryId;

    console.log("Searching for:", queryId);

    // Use backend API to avoid connection/CORS issues
    frappe.call({
      method:
        "beveren_fsm.field_service_management.api.geocoding.search_places",
      args: {
        query: q,
        limit: 7,
      },
      callback: (r) => {
        // Get instances from input element (ensures persistence)
        const awesompleteInstance = inputEl.__bev_awesomplete;
        const lastQuery = inputEl.__bev_lastQuery;

        if (!awesompleteInstance) {
          console.warn("Awesomplete instance not found in callback");
          return;
        }

        console.log("API Response:", r);
        // Only process if this is still the latest query (ignore stale responses)
        if (lastQuery === queryId) {
          if (r && r.message && Array.isArray(r.message)) {
            const results = r.message || [];
            inputEl.__bev_currentResults = results;
            // Safely map results and update autocomplete
            const autocompleteList = results
              .map((result) => result.label || result.value || "")
              .filter(Boolean); // Remove empty strings
            awesompleteInstance.list = autocompleteList;
            console.log(
              "Updated autocomplete with",
              autocompleteList ? autocompleteList.length : 0,
              "items"
            );
          } else {
            console.warn("Invalid response format:", r);
            inputEl.__bev_currentResults = [];
            awesompleteInstance.list = [];
          }
        } else {
          console.log("Ignoring stale response for:", queryId);
        }
      },
      error: (err) => {
        // Get instances from input element (ensures persistence)
        const awesompleteInstance = inputEl.__bev_awesomplete;
        const lastQuery = inputEl.__bev_lastQuery;

        console.error("API Error:", err);
        // Only clear if this was the latest query
        if (lastQuery === queryId && awesompleteInstance) {
          inputEl.__bev_currentResults = [];
          awesompleteInstance.list = [];
        }
      },
    });
  }, 250); // Reduced from 350ms to 250ms for faster response

  // Bind input listener
  field.$input.on("input", (e) => {
    const q = e.target.value;
    searchPlaces(q);
  });

  // When user chooses a suggestion
  inputEl.addEventListener("awesomplete-selectcomplete", (evt) => {
    const currentResults = inputEl.__bev_currentResults || [];
    const label = evt.text && (evt.text.value || evt.text);
    const match = currentResults.find((r) => r.label === label);
    if (!match) return;

    // Set name from selected location
    if (frm.doc.service_area !== match.value) {
      frm.set_value("service_area", match.value);
    }

    // CRITICAL: Save location coordinates to the location field
    // Frappe Geolocation field expects JSON string with lat and lng
    // Validate coordinates are valid before saving
    const lat = parseFloat(match.lat);
    const lng = parseFloat(match.lng);

    // Only save if coordinates are valid (not 0,0 and within valid ranges)
    if (
      !isNaN(lat) &&
      !isNaN(lng) &&
      lat !== 0 &&
      lng !== 0 &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      const locationData = JSON.stringify({
        lat: lat,
        lng: lng,
      });

      if (frm.doc.location !== locationData) {
        frm.set_value("location", locationData);
      }
    } else {
      console.warn("Invalid coordinates detected:", lat, lng);
    }
  });
}
