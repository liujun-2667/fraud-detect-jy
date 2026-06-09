from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.models.rule import RuleType, RuleVersionStatus


class ThresholdRuleConfig(BaseModel):
    field: str
    operator: Literal[">", ">=", "<", "<=", "==", "!=", "in", "not_in", "between"]
    value: Any
    unit: Optional[str] = None


class AssociationRuleCondition(BaseModel):
    field: str
    operator: Literal[">", ">=", "<", "<=", "==", "!=", "in", "not_in", "between"]
    value: Any


class AssociationRuleConfig(BaseModel):
    conditions: list[AssociationRuleCondition]
    min_match_count: int = Field(default=1, ge=1)


class BehaviorRuleConfig(BaseModel):
    behavior_type: Literal[
        "high_frequency",
        "geographic_jump",
        "amount_anomaly",
        "device_change",
        "merchant_risk",
    ]
    window_minutes: int = Field(default=60, ge=1, le=1440)
    threshold: int = Field(default=5, ge=1)
    parameters: dict[str, Any] = Field(default_factory=dict)


class RuleConfig(BaseModel):
    threshold: Optional[ThresholdRuleConfig] = None
    association: Optional[AssociationRuleConfig] = None
    behavior: Optional[BehaviorRuleConfig] = None


class LogicExpressionNode(BaseModel):
    type: Literal["AND", "OR", "NOT", "condition"]
    conditions: Optional[list["LogicExpressionNode"]] = None
    field: Optional[str] = None
    operator: Optional[str] = None
    value: Optional[Any] = None


LogicExpressionNode.model_rebuild()


class LogicExpression(BaseModel):
    expression: LogicExpressionNode


class RuleVersionBase(BaseModel):
    version_num: int = Field(..., ge=1)
    config: RuleConfig = Field(default_factory=RuleConfig)
    weight: int = Field(default=5, ge=1, le=10)
    priority: int = Field(default=100, ge=1)
    status: RuleVersionStatus = RuleVersionStatus.DRAFT
    logic_expression: LogicExpression = Field(default_factory=lambda: LogicExpression(
        expression=LogicExpressionNode(type="AND", conditions=[])
    ))
    is_immediate_block: bool = False


class RuleVersionCreate(RuleVersionBase):
    pass


class RuleVersionUpdate(BaseModel):
    config: Optional[RuleConfig] = None
    weight: Optional[int] = Field(default=None, ge=1, le=10)
    priority: Optional[int] = Field(default=None, ge=1)
    status: Optional[RuleVersionStatus] = None
    logic_expression: Optional[LogicExpression] = None
    is_immediate_block: Optional[bool] = None


class RuleVersionResponse(RuleVersionBase):
    id: int
    rule_id: int
    created_by: Optional[str] = None
    created_at: datetime
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    activated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class RuleBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    rule_type: RuleType


class RuleCreate(RuleBase):
    initial_version: Optional[RuleVersionCreate] = None


class RuleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None


class RuleResponse(RuleBase):
    id: int
    created_at: datetime
    versions: list[RuleVersionResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class RuleListResponse(BaseModel):
    items: list[RuleResponse]
    total: int
    page: int
    page_size: int
