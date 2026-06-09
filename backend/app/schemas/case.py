from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.models.case import CaseConclusion, CaseRiskLevel, CaseStatus


class CaseRuleHit(BaseModel):
    rule_name: str
    trigger_condition: str
    score: int


class CaseNoteBase(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class CaseNoteCreate(CaseNoteBase):
    pass


class CaseNoteResponse(CaseNoteBase):
    id: int
    operator: str
    operator_id: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CaseHistoryTxn(BaseModel):
    id: int
    transaction_no: str
    amount: Decimal
    transaction_time: datetime
    risk_score: int
    decision: str
    is_abnormal: bool


class CaseTransactionInfo(BaseModel):
    id: int
    transaction_no: str
    card_no: str
    card_hash: str
    device_id: Optional[str] = None
    amount: Decimal
    merchant_id: Optional[str] = None
    merchant_name: Optional[str] = None
    region: Optional[str] = None
    region_code: Optional[str] = None
    is_overseas: bool = False
    transaction_time: datetime
    lat: Optional[float] = None
    lng: Optional[float] = None


class CaseBase(BaseModel):
    pass


class CaseCreateFromTransaction(BaseModel):
    transaction_id: int
    risk_score: int
    rule_hits: list[CaseRuleHit] = Field(default_factory=list)


class CaseCloseRequest(BaseModel):
    conclusion: CaseConclusion
    conclusion_note: str = Field(..., min_length=20, max_length=2000)


class CaseTransferRequest(BaseModel):
    target_user_id: str = Field(..., min_length=1)
    target_user_name: str = Field(..., min_length=1)
    reason: str = Field(..., min_length=10, max_length=500)


class CaseListFilter(BaseModel):
    status: Optional[CaseStatus] = None
    risk_level: Optional[CaseRiskLevel] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    assigned_to: Optional[str] = None
    case_no: Optional[str] = None


class AnalystInfo(BaseModel):
    user_id: str
    user_name: str
    active_cases: int = 0
    last_assigned_at: Optional[datetime] = None


class CaseRelatedCase(BaseModel):
    id: int
    case_no: str
    risk_level: CaseRiskLevel
    status: CaseStatus
    created_at: datetime
    conclusion: Optional[CaseConclusion] = None


class CaseResponse(CaseBase):
    id: int
    case_no: str
    status: CaseStatus
    risk_level: CaseRiskLevel
    risk_score: int
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None
    assigned_at: Optional[datetime] = None
    conclusion: Optional[CaseConclusion] = None
    conclusion_note: Optional[str] = None
    closed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    transaction_id: int
    transaction: CaseTransactionInfo
    rule_hits: list[CaseRuleHit] = Field(default_factory=list)
    notes: list[CaseNoteResponse] = Field(default_factory=list)
    history_transactions: list[CaseHistoryTxn] = Field(default_factory=list)
    is_overtime: bool = False
    related_cases: list[CaseRelatedCase] = Field(default_factory=list)
    fraud_history_count: int = 0

    model_config = {"from_attributes": True}


class CaseListResponse(BaseModel):
    items: list[CaseResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class CaseStatsResponse(BaseModel):
    pending_count: int = 0
    investigating_count: int = 0
    today_closed_count: int = 0
    avg_processing_hours: float = 0.0
    overtime_count: int = 0
