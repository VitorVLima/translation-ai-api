"""Bound speech requests before multipart/JSON parsing and expensive inference."""

from threading import BoundedSemaphore


class BoundedSpeechRequest:
    def __init__(self, app, path: str, max_body_bytes: int, max_concurrent: int = 1):
        self.app = app
        self.path = path
        self.max_body_bytes = max_body_bytes
        self._slot = BoundedSemaphore(max_concurrent)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("path") != self.path or scope.get("method") != "POST":
            await self.app(scope, receive, send)
            return
        if not self._slot.acquire(blocking=False):
            await self._reject(send, 503, b"Speech service is busy", [(b"retry-after", b"1")])
            return
        try:
            lengths = [value for key, value in scope.get("headers", []) if key.lower() == b"content-length"]
            if lengths:
                try:
                    if len(lengths) != 1 or int(lengths[0]) > self.max_body_bytes:
                        await self._reject(send, 413, b"Request is too large")
                        return
                except ValueError:
                    await self._reject(send, 400, b"Invalid content length")
                    return
            body = bytearray()
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                chunk = message.get("body", b"")
                if len(body) + len(chunk) > self.max_body_bytes:
                    await self._reject(send, 413, b"Request is too large")
                    return
                body.extend(chunk)
                if not message.get("more_body", False):
                    break
            delivered = False

            async def replay():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": bytes(body), "more_body": False}
                return await receive()

            await self.app(scope, replay, send)
        finally:
            self._slot.release()

    @staticmethod
    async def _reject(send, status: int, detail: bytes, headers=None):
        await send({"type": "http.response.start", "status": status,
                    "headers": [(b"content-type", b"text/plain; charset=utf-8"), *(headers or [])]})
        await send({"type": "http.response.body", "body": detail})
