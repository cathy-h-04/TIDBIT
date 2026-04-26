from fastapi import WebSocket
from typing import DefaultDict
from collections import defaultdict
import json

class WebSocketManager:
    def __init__(self):
        self.connections: DefaultDict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, project_id: str, ws: WebSocket):
        await ws.accept()
        self.connections[project_id].append(ws)

    def disconnect(self, project_id: str, ws: WebSocket):
        self.connections[project_id].remove(ws)

    async def broadcast(self, project_id: str, event: str, data: dict):
        payload = json.dumps({"event": event, "data": data})
        dead = []
        for ws in self.connections[project_id]:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.connections[project_id].remove(ws)

ws_manager = WebSocketManager()
