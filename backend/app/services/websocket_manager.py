from fastapi import WebSocket


class ConnectionManager:

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        client = getattr(websocket, "client", None)
        client_info = f"{client[0]}:{client[1]}" if client else "unknown"
        print(f"WebSocket added: {client_info} (total={len(self.active_connections)})")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            client = getattr(websocket, "client", None)
            client_info = f"{client[0]}:{client[1]}" if client else "unknown"
            self.active_connections.remove(websocket)
            print(f"WebSocket removed: {client_info} (total={len(self.active_connections)})")

    async def broadcast(self, message: dict):
        disconnected = []

        print(f"Broadcasting message to {len(self.active_connections)} connections: type={message.get('type')}")

        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"Failed to send to a connection: {e}")
                disconnected.append(connection)

        for connection in disconnected:
            self.disconnect(connection)


manager = ConnectionManager()