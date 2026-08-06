"""
Global error handling + typed error codes.
Never leaks sensitive information.
"""
from typing import Optional
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException


ERROR_CODES = {
    "AUTH_INVALID": "Invalid credentials",
    "AUTH_LOCKED": "Account temporarily locked",
    "AUTH_REQUIRED": "Authentication required",
    "AUTH_EXPIRED": "Session expired",
    "PERMISSION_DENIED": "Permission denied",
    "NOT_FOUND": "Resource not found",
    "VALIDATION": "Validation failed",
    "PROVIDER_ERROR": "Provider unavailable",
    "SERVER_ERROR": "Internal server error",
}


class AppError(Exception):
    def __init__(self, code: str, status: int = 400, detail: Optional[str] = None):
        self.code = code
        self.status = status
        self.detail = detail or ERROR_CODES.get(code, "Error")
        super().__init__(self.detail)


def register_error_handlers(app) -> None:
    @app.exception_handler(AppError)
    async def _app_err(_: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status,
            content={"error": {"code": exc.code, "detail": exc.detail}},
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_err(_: Request, exc: StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": "HTTP", "detail": str(exc.detail)}},
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        msgs = []
        for e in exc.errors():
            loc = ".".join(str(x) for x in e.get("loc", []) if x != "body")
            msgs.append(f"{loc}: {e.get('msg', 'invalid')}")
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "VALIDATION", "detail": "; ".join(msgs)}},
        )

    @app.exception_handler(Exception)
    async def _server(_: Request, exc: Exception):
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "SERVER_ERROR", "detail": "Internal server error"}},
        )