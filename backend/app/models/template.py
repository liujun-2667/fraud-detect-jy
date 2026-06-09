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
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TemplateCategory(str, enum.Enum):
    AMOUNT = "amount"
    FREQUENCY = "frequency"
    GEOGRAPHY = "geography"
    TIME = "time"
    DEVICE = "device"
    BEHAVIOR = "behavior"


class RuleTemplate(Base):
    __tablename__ = "rule_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[TemplateCategory] = mapped_column(
        Enum(TemplateCategory), nullable=False, index=True
    )
    applicable_scene: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rule_type: Mapped[str] = mapped_column(String(50), nullable=False)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    default_weight: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    default_priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    default_is_immediate_block: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    default_logic_expression: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    use_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, index=True)
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
