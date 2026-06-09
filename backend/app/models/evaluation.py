import enum
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, Column, DateTime, Enum, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DecisionType(str, enum.Enum):
    ALLOW = "allow"
    REVIEW = "review"
    BLOCK = "block"


class EvaluationResult(Base):
    __tablename__ = "evaluation_results"
    __table_args__ = (
        Index("ix_evaluation_transaction_id", "transaction_id"),
        Index("ix_evaluation_decision", "decision"),
        Index("ix_evaluation_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    risk_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    decision: Mapped[DecisionType] = mapped_column(
        Enum(DecisionType), nullable=False, default=DecisionType.ALLOW, index=True
    )
    rule_hits: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    execution_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True
    )

    transaction: Mapped["Transaction"] = relationship(
        "Transaction", back_populates="evaluation_result"
    )
