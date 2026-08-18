# app/agents/tools.py
from typing import Dict, Any

class ToolRegistry:
    """
    Central registry for all tools available to the agents.
    """
    
    @staticmethod
    def create_commercial_request(title: str, request_type: str, urgency: str) -> Dict[str, Any]:
        """
        [HITL Tool] Triggers a commercial request. Does not execute immediately.
        Instead, returns a payload that halts the AI and asks the human for permission.
        """
        return {
            "is_tool_call": True,
            "tool_type": "hitl",
            "payload": {
                "action": "create_commercial_request",
                "details": {
                    "title": title,
                    "type": request_type,
                    "urgency": urgency
                }
            }
        }

    @staticmethod
    def query_telemetry_sql(machine_id: str, metric: str) -> str:
        """
        [Operational Tool] Simulates a Text-to-SQL query on IoT data.
        """
        # In production, this would execute a read-only SQL query
        mock_db = {
            "motor_temp": "65°C (Warning Threshold: 75°C)",
            "air_pressure": "6.0 bar (Stable)",
            "capping_speed": "400 bpm"
        }
        return mock_db.get(metric, "Metric not found for this machine.")