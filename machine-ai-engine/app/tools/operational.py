# app/tools/operational.py
import os
import json
import httpx

# Set this to where your Node.js API is running (e.g., http://localhost:3000/api)
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
            elif response.status_code == 403 or response.status_code == 401:
                return "Access Denied: Your role does not permit this action."
            elif response.status_code == 404:
                return "Data not found."
            return f"API Error {response.status_code}: {response.text}"
        except Exception as e:
            return f"Network Error contacting internal API: {str(e)}"

# ---------------------------------------------------------
# OPERATIONAL TOOLS
# ---------------------------------------------------------

async def get_machine_configuration(machine_id: str, auth_token: str) -> str:
    """
    Fetches the physical configuration profile (nominal rate, voltage, head type) for a machine.
    Call this BEFORE evaluating telemetry data to know what is normal for this exact machine.
    """
    # Assuming your Node backend has an endpoint like /machines/:id
    result = await _make_api_call(f"/machines/{machine_id}", auth_token)
    return json.dumps(result, indent=2)

async def query_telemetry(machine_id: str, auth_token: str) -> str:
    """
    Retrieves the most recent hourly telemetry snapshots for the active machine.
    NOTE: uptimePercentage = 0 simply means the machine is not producing. It does NOT mean it is broken.
    """
    # Assuming your Node backend has an endpoint like /machines/:id/telemetry
    result = await _make_api_call(f"/machines/{machine_id}/telemetry", auth_token)
    return json.dumps(result, indent=2)

async def query_alarms(machine_id: str, auth_token: str) -> str:
    """
    Retrieves the recent alarms for the active machine. 
    Look at the 'code' (e.g., AL017_LOW_AIR_PRESSURE) and extract the mnemonic to search the manual!
    """
    result = await _make_api_call(f"/machines/{machine_id}/alarms", auth_token)
    return json.dumps(result, indent=2)

async def query_maintenance_tickets(machine_id: str, auth_token: str) -> str:
    """
    Retrieves maintenance tickets for the machine.
    """
    result = await _make_api_call(f"/machines/{machine_id}/maintenance", auth_token)
    return json.dumps(result, indent=2)