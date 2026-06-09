from datetime import datetime
from decimal import Decimal
from typing import Optional

import enum
from sqlalchemy import (
    DECIMAL,
    JSON,
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CaseStatus(str, enum.Enum):
    PENDING = "pending"
    INVESTIGATING = "investigating"
    CLOSED = "closed"


class CaseRiskLevel(str, enum.Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class CaseConclusion(str, enum.Enum):
    PASS = "pass"
    FRAUD = "fraud"
    FALSE_POSITIVE = "false_positive"


class FraudCase(Base):
    __tablename__ = "fraud_cases"
    __table_args__ = (
        Index("ix_fraud_case_status", "status"),
        Index("ix_fraud_case_risk_level", "risk_level"),
        Index("ix_fraud_case_assigned_to", "assigned_to"),
        Index("ix_fraud_case_created_at", "created_at"),
        Index("ix_fraud_case_transaction_id", "transaction_id"),
        UniqueConstraint("case_no", name="uq_fraud_case_case_no"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_no: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    status: Mapped[CaseStatus] = mapped_column(
        Enum(CaseStatus), nullable=False, default=CaseStatus.PENDING, index=True
    )
    risk_level: Mapped[CaseRiskLevel] = mapped_column(
        Enum(CaseRiskLevel), nullable=False, index=True
    )
    risk_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    assigned_to: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    assigned_to_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    assigned_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    conclusion: Mapped[Optional[CaseConclusion]] = mapped_column(
        Enum(CaseConclusion), nullable=True
    )
    conclusion_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    transaction_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rule_hits: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)

    is_overtime: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    transaction: Mapped["Transaction"] = relationship("Transaction", backref="fraud_cases")
    notes: Mapped[list["CaseNote"]] = relationship(
        "CaseNote",
        back_populates="case",
        cascade="all, delete-orphan",
        order_by="CaseNote.created_at.asc()",
    )


class CaseNote(Base):
    __tablename__ = "case_notes"
    __table_args__ = (Index("ix_case_note_case_id", "case_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("fraud_cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    operator: Mapped[str] = mapped_column(String(100), nullable=False)
    operator_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )

    case: Mapped[FraudCase] = relationship("FraudCase", back_populates="notes")
