import json
from typing import Any

from fastapi import WebSocket


class WebSocketManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict[str, Any]):
        data = json.dumps(message, ensure_ascii=False, default=str)
        for connection in list(self.active_connections):
            try:
                await connection.send_text(data)
            except Exception:
                self.disconnect(connection)

    async def send_case_overtime(self, case_id: int, case_no: str):
        await self.broadcast(
            {
                "type": "case_overtime",
                "data": {
                    "case_id": case_id,
                    "case_no": case_no,
                    "message": f"案件{case_no}已超时，请尽快处理",
                },
            }
        )

    async def send_case_assigned(self, case_id: int, case_no: str, assigned_to_name: str):
        await self.broadcast(
            {
                "type": "case_assigned",
                "data": {
                    "case_id": case_id,
                    "case_no": case_no,
                    "assigned_to_name": assigned_to_name,
                },
            }
        )


ws_manager = WebSocketManager()
