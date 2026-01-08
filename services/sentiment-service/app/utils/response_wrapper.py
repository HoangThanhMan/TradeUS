"""
Standardized API response wrappers for API Gateway compatibility.
Provides consistent response format across all endpoints.
"""

from datetime import datetime, timezone
from typing import Any, Generic, Optional, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    """
    Standard API response wrapper.
    Provides consistent response format for API Gateway.
    """
    
    success: bool = Field(..., description="Whether the request was successful")
    data: Optional[T] = Field(None, description="Response payload")
    error: Optional[str] = Field(None, description="Error message if failed")
    message: Optional[str] = Field(None, description="Optional message")
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Response timestamp"
    )
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class PaginatedResponse(BaseModel, Generic[T]):
    """
    Paginated API response wrapper.
    """
    
    success: bool = True
    data: list[T] = Field(default_factory=list, description="List of items")
    pagination: dict[str, Any] = Field(..., description="Pagination info")
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


def success_response(
    data: Any,
    message: Optional[str] = None
) -> dict[str, Any]:
    """Create a successful API response."""
    return {
        "success": True,
        "data": data,
        "message": message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def error_response(
    error: str,
    data: Optional[Any] = None
) -> dict[str, Any]:
    """Create an error API response."""
    return {
        "success": False,
        "data": data,
        "error": error,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def paginated_response(
    items: list[Any],
    total: int,
    page: int,
    page_size: int,
    message: Optional[str] = None
) -> dict[str, Any]:
    """Create a paginated API response."""
    total_pages = (total + page_size - 1) // page_size if page_size > 0 else 0
    
    return {
        "success": True,
        "data": items,
        "pagination": {
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1,
        },
        "message": message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
