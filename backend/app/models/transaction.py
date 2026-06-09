from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    DECIMAL,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_transaction_card_hash", "card_hash"),
        Index("ix_transaction_device_id", "device_id"),
        Index("ix_transaction_merchant_id", "merchant_id"),
        Index("ix_transaction_time", "transaction_time"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_no: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    card_no: Mapped[str] = mapped_column(String(32), nullable=False)
    card_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    device_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    amount: Mapped[Decimal] = mapped_column(DECIMAL(18, 2), nullable=False)
    merchant_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    merchant_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    region_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_overseas: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    transaction_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    evaluation_result: Mapped[Optional["EvaluationResult"]] = relationship(
        "EvaluationResult",
        back_populates="transaction",
        uselist=False,
        cascade="all, delete-orphan",
    )
