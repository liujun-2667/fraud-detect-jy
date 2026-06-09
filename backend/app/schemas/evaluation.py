from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

from app.models.evaluation import DecisionType


class RuleHit(BaseModel):
    rule_version_id: int
    rule_name: str
    weight: int = Field(..., ge=1, le=10)
    score: int = Field(..., ge=0, le=100)
    is_hit: bool


class EvaluationResultBase(BaseModel):
    transaction_id: int
    risk_score: int = Field(..., ge=0, le=100)
    decision: DecisionType
    rule_hits: list[RuleHit] = Field(default_factory=list)
    execution_ms: int = Field(default=0, ge=0)


class EvaluationResultCreate(EvaluationResultBase):
    pass


class EvaluationResultUpdate(BaseModel):
    risk_score: Optional[int] = Field(default=None, ge=0, le=100)
    decision: Optional[DecisionType] = None
    rule_hits: Optional[list[RuleHit]] = None


class EvaluationResultResponse(EvaluationResultBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class EvaluationResultListResponse(BaseModel):
    items: list[EvaluationResultResponse]
    total: int
    page: int
    page_size: int


class EvaluateTransactionResponse(BaseModel):
    transaction_id: int
    transaction_no: str
    risk_score: int = Field(..., ge=0, le=100)
    decision: DecisionType
    rule_hits: list[RuleHit] = Field(default_factory=list)
    execution_ms: int = 0
    evaluated_at: datetime
    is_cached: bool = False

    @field_validator("decision", mode="before")
    @classmethod
    def validate_decision(cls, v: Any) -> DecisionType:
        if isinstance(v, str):
            return DecisionType(v)
        return v
