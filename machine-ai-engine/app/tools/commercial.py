# app/tools/commercial.py
import os
import json
import urllib.parse
import httpx
from datetime import datetime, timedelta

# Set this to where your Node.js API is running
NODE_API_BASE = os.getenv("NODE_API_BASE", "http://localhost:5000/api")

async def _make_api_call(endpoint: str, auth_token: str, method: str = "GET", payload: dict = None) -> dict | str:
    """Helper function to make authenticated requests to the Node backend."""
    if not auth_token:
        return "Authentication token missing. Cannot access secure systems."
        
    async with httpx.AsyncClient() as client:
        headers = {"Authorization": f"Bearer {auth_token}"}
        try:
            if method.upper() == "POST":
                response = await client.post(f"{NODE_API_BASE}{endpoint}", json=payload, headers=headers)
            elif method.upper() == "PUT":
                response = await client.put(f"{NODE_API_BASE}{endpoint}", json=payload, headers=headers)
            elif method.upper() == "DELETE":
                response = await client.delete(f"{NODE_API_BASE}{endpoint}", headers=headers)
            else: # Default to GET
                response = await client.get(f"{NODE_API_BASE}{endpoint}", headers=headers)
                
            if response.status_code in (200, 201):
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

async def get_order_history(company_id: str, auth_token: str) -> str:
    """Retrieves recent commercial orders and their fulfillment status for the tenant."""
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

# =========================================================
# MUTATION TOOLS (CREATE QUOTE)
# =========================================================

async def create_draft_quote(
    company_id: str,
    description: str,
    currency: str,
    lines: list,
    auth_token: str
) -> str:
    """
    Programmatically orchestrates the creation of a Quote, an initial Revision, 
    and the associated Line Items in the Node.js API.
    """
    
    # 1. Generate Quote
    # Defaults validity to 30 days from today
    valid_until = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
    
    quote_payload = {
        "companyId": company_id,
        "currency": currency,
        "validUntil": valid_until,
        "description": description
    }
    
    quote_res = await _make_api_call("/quotes", auth_token, method="POST", payload=quote_payload)
    
    # Handle error strings or error dicts from _make_api_call
    if isinstance(quote_res, str) or ("error" in quote_res if isinstance(quote_res, dict) else False):
        return json.dumps({"error": quote_res})
        
    quote_id = quote_res.get("id")

    # 2. Generate Revision 1
    rev_payload = {
        "revisionNumber": 1,
        "revisionStatus": "Draft",
        "discountRate": 0,
        "changeSummary": "Initial Draft created via AI Assistant"
    }
    
    rev_res = await _make_api_call(f"/quotes/{quote_id}/revisions", auth_token, method="POST", payload=rev_payload)
    
    if isinstance(rev_res, str) or ("error" in rev_res if isinstance(rev_res, dict) else False):
        return json.dumps({"error": rev_res})
        
    rev_id = rev_res.get("id")

    # 3. Generate Line Items
    added_lines = []
    for line in lines:
        line_payload = {
            "modelCode": line.get("model_code"),
            "serialNumber": line.get("serial_number"),
            "price": line.get("price"),
            "description": line.get("item_description")
        }
        line_res = await _make_api_call(f"/quotes/revisions/{rev_id}/lines", auth_token, method="POST", payload=line_payload)
        
        if isinstance(line_res, dict) and "id" in line_res:
            added_lines.append(line_res)

    return json.dumps({
        "status": "success",
        "message": "Quote drafted successfully.",
        "quoteId": quote_id,
        "revisionId": rev_id,
        "linesAdded": len(added_lines)
    }, indent=2)