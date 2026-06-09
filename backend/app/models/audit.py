from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_operator", "operator"),
        Index("ix_audit_rule_id", "rule_id"),
        Index("ix_audit_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    operator: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    rule_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("rules.id", ondelete="SET NULL"), nullable=True, index=True
    )
    rule_version_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("rule_versions.id", ondelete="SET NULL"), nullable=True
    )
    old_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    new_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True
    )
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)

    rule: Mapped[Optional["Rule"]] = relationship("Rule", back_populates="audit_logs")
    rule_version: Mapped[Optional["RuleVersion"]] = relationship(
        "RuleVersion", back_populates="audit_logs"
    )
