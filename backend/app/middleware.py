from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response


class UnifiedResponseMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Any) -> Response:
        response = await call_next(request)

        if request.url.path.startswith("/docs") or request.url.path.startswith("/redoc") or request.url.path.startswith("/openapi.json"):
            return response

        if response.status_code == 200 and isinstance(response, JSONResponse):
            import json
            body = b""
            async for chunk in response.body_iterator:
                body += chunk
            try:
                data = json.loads(body.decode("utf-8"))
                if isinstance(data, dict) and "code" in data and "message" in data:
                    return response
                wrapped = {
                    "code": 0,
                    "message": "success",
                    "data": data,
                }
                return JSONResponse(content=wrapped, status_code=response.status_code, headers=dict(response.headers))
            except Exception:
                return response
        elif response.status_code >= 400:
            import json
            body = b""
            async for chunk in response.body_iterator:
                body += chunk
            try:
                data = json.loads(body.decode("utf-8"))
                detail = data.get("detail", str(data)) if isinstance(data, dict) else str(data)
                wrapped = {
                    "code": response.status_code,
                    "message": detail if isinstance(detail, str) else json.dumps(detail, ensure_ascii=False),
                    "data": None,
                }
                return JSONResponse(content=wrapped, status_code=200, headers=dict(response.headers))
            except Exception:
                return response

        return response
