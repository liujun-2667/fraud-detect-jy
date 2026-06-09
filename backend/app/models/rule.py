import enum
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
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
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RuleType(str, enum.Enum):
    THRESHOLD = "threshold"
    ASSOCIATION = "association"
    BEHAVIOR = "behavior"


class RuleVersionStatus(str, enum.Enum):
    DRAFT = "draft"
    REVIEWING = "reviewing"
    ACTIVE = "active"
    DISABLED = "disabled"


class Rule(Base):
    __tablename__ = "rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rule_type: Mapped[RuleType] = mapped_column(Enum(RuleType), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )

    versions: Mapped[list["RuleVersion"]] = relationship(
        "RuleVersion",
        back_populates="rule",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        "AuditLog",
        back_populates="rule",
        cascade="all, delete-orphan",
    )


class RuleVersion(Base):
    __tablename__ = "rule_versions"
    __table_args__ = (
        Index("ix_rule_version_rule_id_version", "rule_id", "version_num", unique=True),
        Index("ix_rule_version_status", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rule_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("rules.id", ondelete="CASCADE"), nullable=False
    )
    version_num: Mapped[int] = mapped_column(Integer, nullable=False)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    weight: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    status: Mapped[RuleVersionStatus] = mapped_column(
        Enum(RuleVersionStatus), nullable=False, default=RuleVersionStatus.DRAFT, index=True
    )
    logic_expression: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    is_immediate_block: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    activated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    rule: Mapped[Rule] = relationship("Rule", back_populates="versions")
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        "AuditLog",
        back_populates="rule_version",
        cascade="all, delete-orphan",
    )
