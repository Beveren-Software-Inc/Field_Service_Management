"""
API endpoints for geocoding and location search
Proxies Nominatim OpenStreetMap API requests to avoid CORS and rate limiting issues
"""

import json
import time

import frappe

try:
	import requests

	HAS_REQUESTS = True
except ImportError:
	HAS_REQUESTS = False


# In-memory cache for rate limiting (per-session to avoid blocking other users)
_request_times = {}  # Store last request time per session
_min_request_interval = 0.5  # Reduced to 0.5 seconds for better UX (still respects Nominatim's limits)


@frappe.whitelist()
def search_places(query: str, limit: int = 7):
	"""
	Search for places using Nominatim OpenStreetMap API

	Args:
		query: Search query string (minimum 2 characters)
		limit: Maximum number of results to return (default: 7)

	Returns:
		List of place dictionaries with label, lat, lng
	"""
	if not query or len(query.strip()) < 2:
		return []

	# Rate limiting: ensure minimum interval between requests per session
	# Use session ID or user to avoid blocking other users
	session_key = frappe.session.user or "default"
	current_time = time.time()

	if session_key in _request_times:
		time_since_last = current_time - _request_times[session_key]
		if time_since_last < _min_request_interval:
			time.sleep(_min_request_interval - time_since_last)

	try:
		url = "https://nominatim.openstreetmap.org/search"
		params = {
			"format": "jsonv2",
			"q": query.strip(),
			"limit": min(limit, 10),  # Cap at 10 for safety
			"addressdetails": "1",
			"accept-language": frappe.local.lang or "en",
		}

		headers = {
			"Accept": "application/json",
			"User-Agent": frappe.conf.get("app_name") or "BeverenFSM/1.0",
		}

		if HAS_REQUESTS:
			response = requests.get(url, params=params, headers=headers, timeout=5)
			response.raise_for_status()
			data = response.json()
		else:
			# Fallback to urllib if requests is not available
			import urllib.parse
			import urllib.request

			url_with_params = url + "?" + urllib.parse.urlencode(params)
			req = urllib.request.Request(url_with_params, headers=headers)
			with urllib.request.urlopen(req, timeout=5) as response:
				data = json.loads(response.read().decode())

		# Update request time after successful API call
		_request_times[session_key] = time.time()

		# Ensure data is a list
		if not isinstance(data, list):
			frappe.log_error(
				message=f"Unexpected data type from Nominatim: {type(data)}\nQuery: {query}\nData: {data}",
				title="Geocoding API Error",
			)
			return []

		results = []
		for item in data:
			try:
				display_name = item.get("display_name", "")
				lat = item.get("lat")
				lon = item.get("lon")

				# Skip if missing required fields
				if not display_name or not lat or not lon:
					continue

				results.append(
					{
						"label": display_name,
						"value": display_name,
						"lat": float(lat),
						"lng": float(lon),
					}
				)
			except (ValueError, TypeError) as e:
				# Skip invalid entries
				frappe.log_error(
					message=f"Error parsing place data: {e!s}\nItem: {item}",
					title="Geocoding Parse Error",
				)
				continue

		return results

	except Exception as e:
		# Log error for debugging
		frappe.log_error(
			message=f"Error fetching places from Nominatim: {e!s}\nQuery: {query}",
			title="Geocoding API Error",
		)
		# Return empty list instead of raising exception
		return []
