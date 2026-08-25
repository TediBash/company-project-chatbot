# app/tools/commercial.py
import os
import json
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

async def get_spare_parts_catalog(machine_model: str, auth_token: str) -> str:
    """
    Retrieves the available spare parts and pricing for a specific machine model.
    """
    result = await _make_api_call(f"/commercial/parts?model={machine_model}", auth_token)
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