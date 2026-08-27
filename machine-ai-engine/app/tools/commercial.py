# app/tools/commercial.py
import os
import json

import urllib.parse
import httpx

# Set this to where your Node.js API is running
NODE_API_BASE = os.getenv("NODE_API_BASE", "http://localhost:5000/api")

async def _make_api_call(endpoint: str, auth_token: str) -> dict | str:
    """Helper function to make authenticated GET requests to the Node backend."""
    if not auth_token:
        return "Authentication token missing. Cannot access secure systems."
        
    async with httpx.AsyncClient() as client:
        headers = {"Authorization": f"Bearer {auth_token}"}
        try:
            response = await client.get(f"{NODE_API_BASE}{endpoint}", headers=headers)
            if response.status_code == 200:
                return response.json()
            elif response.status_code in (401, 403):
                return "Access Denied: Your role does not permit this action."
            elif response.status_code == 404:
                return "Data not found."
            return f"API Error {response.status_code}: {response.text}"
        except Exception as e:
            return f"Network Error contacting internal API: {str(e)}"

# ---------------------------------------------------------
# COMMERCIAL TOOLS
# ---------------------------------------------------------

async def get_spare_parts_catalog(machine_id: str, auth_token: str) -> str:
    """Retrieves the available spare parts and pricing for a specific machine asset."""
    result = await _make_api_call(f"/commercial/parts?machineId={machine_id}", auth_token)
    return json.dumps(result, indent=2)

async def get_order_history(company_id: str, auth_token: str) -> str:
    """
    Retrieves recent commercial orders and their fulfillment status for the tenant.
    """
    result = await _make_api_call(f"/commercial/orders?company={company_id}", auth_token)
    return json.dumps(result, indent=2)

async def get_purchase_details(machine_id: str, auth_token: str) -> str:
    """Gets the original machine delivery date and finalized cost."""
    result = await _make_api_call(f"/commercial/machines/{machine_id}/purchase-details", auth_token)
    return json.dumps(result, indent=2)

async def get_quotation_history(machine_id: str, auth_token: str) -> str:
    """Gets the recent quote revisions to track changes in price or discount."""
    result = await _make_api_call(f"/commercial/machines/{machine_id}/quotations", auth_token)
    return json.dumps(result, indent=2)

async def query_filtered_quotes(
    auth_token: str, 
    company_id: str = None, 
    machine_id: str = None, 
    has_order: bool = None, 
    status: str = None
) -> str:
    """Fetches quotes based on highly specific filters."""
    params = {}
    if company_id: params['companyId'] = company_id
    if machine_id: params['machineId'] = machine_id
    if has_order is True: params['hasOrder'] = 'true'
    if status: params['status'] = status

    query_string = urllib.parse.urlencode(params)
    endpoint = f"/quotes?{query_string}" if query_string else "/quotes"
    
    result = await _make_api_call(endpoint, auth_token)
    return json.dumps(result, indent=2)

async def query_filtered_orders(
    auth_token: str, 
    company_id: str = None, 
    machine_id: str = None
) -> str:
    """Fetches orders filtered by company and/or specific machine assets."""
    params = {}
    if company_id: params['companyId'] = company_id
    if machine_id: params['machineId'] = machine_id

    query_string = urllib.parse.urlencode(params)
    endpoint = f"/orders?{query_string}" if query_string else "/orders"
    
    result = await _make_api_call(endpoint, auth_token)
    return json.dumps(result, indent=2)

async def get_machine_financials(machine_id: str, auth_token: str) -> str:
    """Retrieves the original purchase cost, delivery date, and lifecycle financial data."""
    if not machine_id:
        return json.dumps({"error": "Machine ID is required for financials."})
    result = await _make_api_call(f"/commercial/machines/{machine_id}/financials", auth_token)
    return json.dumps(result, indent=2)

# Remove get_spare_parts_catalog entirely.

async def get_machine_quotations(machine_id: str, auth_token: str) -> str:
    """Gets detailed quote revisions and quote lines for the active machine."""
    if not machine_id: return "{}"
    result = await _make_api_call(f"/commercial/machines/{machine_id}/quotations", auth_token)
    return json.dumps(result, indent=2)

async def get_machine_order_lines(machine_id: str, auth_token: str) -> str:
    """Gets detailed order lines and fulfillment statuses for the active machine."""
    if not machine_id: return "{}"
    result = await _make_api_call(f"/commercial/machines/{machine_id}/order-lines", auth_token)
    return json.dumps(result, indent=2)