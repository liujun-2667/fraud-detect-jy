from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from app.models.template import TemplateCategory
from app.schemas.rule import (
    LogicExpression,
    RuleConfig,
    RuleType,
)


class RuleTemplateBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    category: TemplateCategory
    applicable_scene: Optional[str] = None
    rule_type: RuleType
    config: RuleConfig = Field(default_factory=RuleConfig)
    default_weight: int = Field(default=5, ge=1, le=10)
    default_priority: int = Field(default=100, ge=1)
    default_is_immediate_block: bool = False
    default_logic_expression: LogicExpression = Field(
        default_factory=lambda: LogicExpression(
            expression={"type": "AND", "conditions": []}
        )
    )
    tags: list[str] = Field(default_factory=list)
    is_active: bool = True


class RuleTemplateCreate(RuleTemplateBase):
    is_builtin: bool = False


class RuleTemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    category: Optional[TemplateCategory] = None
    applicable_scene: Optional[str] = None
    rule_type: Optional[RuleType] = None
    config: Optional[RuleConfig] = None
    default_weight: Optional[int] = Field(default=None, ge=1, le=10)
    default_priority: Optional[int] = Field(default=None, ge=1)
    default_is_immediate_block: Optional[bool] = None
    default_logic_expression: Optional[LogicExpression] = None
    tags: Optional[list[str]] = None
    is_active: Optional[bool] = None


class RuleTemplateResponse(RuleTemplateBase):
    id: int
    use_count: int
    is_builtin: bool
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None

    model_config = {"from_attributes": True}


class RuleTemplateListResponse(BaseModel):
    items: list[RuleTemplateResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class TemplateUsageStat(BaseModel):
    template_id: int
    template_name: str
    use_count: int
    percentage: float


class TemplateDiffItem(BaseModel):
    field: str
    template_value: Any
    rule_value: Any


class TemplateRuleDiff(BaseModel):
    template_id: int
    template_name: str
    diffs: list[TemplateDiffItem]
