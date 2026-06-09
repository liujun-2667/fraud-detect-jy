from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class AuditLogBase(BaseModel):
    operator: str = Field(..., max_length=100)
    action: str = Field(..., max_length=50)
    rule_id: Optional[int] = None
    rule_version_id: Optional[int] = None
    old_status: Optional[str] = Field(default=None, max_length=50)
    new_status: Optional[str] = Field(default=None, max_length=50)
    detail: dict[str, Any] = Field(default_factory=dict)
    ip_address: Optional[str] = Field(default=None, max_length=45)


class AuditLogCreate(AuditLogBase):
    pass


class AuditLogResponse(AuditLogBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    items: list[AuditLogResponse]
    total: int
    page: int
    page_size: int
