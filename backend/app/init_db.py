import asyncio
import logging

from sqlalchemy import select, text

from app.database import Base, AsyncSessionLocal, engine
from app.models import (
    AuditLog,
    EvaluationResult,
    Rule,
    RuleTemplate,
    RuleVersion,
    TemplateCategory,
    Transaction,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


BUILTIN_TEMPLATES = [
    {
        "name": "大额单笔拦截",
        "description": "单笔交易金额超过阈值时直接触发拦截，适用于防范大额欺诈交易",
        "category": TemplateCategory.AMOUNT,
        "applicable_scene": "适用于银行卡转账、线上支付等场景，拦截异常高额交易",
        "rule_type": "threshold",
        "config": {
            "threshold": {
                "field": "amount",
                "operator": ">",
                "value": 100000,
                "unit": "CNY",
            }
        },
        "default_weight": 10,
        "default_priority": 10,
        "default_is_immediate_block": True,
        "default_logic_expression": {"expression": {"type": "AND", "conditions": []}},
        "tags": ["金额类", "高风险", "直接拦截"],
        "is_builtin": True,
        "is_active": True,
    },
    {
        "name": "短时高频交易",
        "description": "短时间内同一账户交易次数超过阈值，可能存在账户被盗风险",
        "category": TemplateCategory.FREQUENCY,
        "applicable_scene": "适用于信用卡、电子钱包等场景，检测短时间内的高频交易",
        "rule_type": "behavior",
        "config": {
            "behavior": {
                "behavior_type": "high_frequency",
                "window_minutes": 10,
                "threshold": 10,
                "parameters": {},
            }
        },
        "default_weight": 8,
        "default_priority": 20,
        "default_is_immediate_block": False,
        "default_logic_expression": {"expression": {"type": "AND", "conditions": []}},
        "tags": ["频次类", "行为分析", "盗刷风险"],
        "is_builtin": True,
        "is_active": True,
    },
    {
        "name": "异地快速切换",
        "description": "同一账户短时间内出现在相距较远的不同地域，存在盗刷嫌疑",
        "category": TemplateCategory.GEOGRAPHY,
        "applicable_scene": "适用于线下刷卡、线上支付等场景，检测不合理的地域切换",
        "rule_type": "behavior",
        "config": {
            "behavior": {
                "behavior_type": "geographic_jump",
                "window_minutes": 60,
                "threshold": 500,
                "parameters": {"distance_unit": "km"},
            }
        },
        "default_weight": 9,
        "default_priority": 15,
        "default_is_immediate_block": True,
        "default_logic_expression": {"expression": {"type": "AND", "conditions": []}},
        "tags": ["地域类", "盗刷", "高风险"],
        "is_builtin": True,
        "is_active": True,
    },
    {
        "name": "夜间大额转账",
        "description": "夜间时段（22:00-06:00）的大额转账交易，风险较高",
        "category": TemplateCategory.TIME,
        "applicable_scene": "适用于网银转账、手机银行等场景，监控非正常时段的大额交易",
        "rule_type": "association",
        "config": {
            "association": {
                "conditions": [
                    {"field": "amount", "operator": ">", "value": 50000},
                    {"field": "transaction_hour", "operator": "in", "value": [22, 23, 0, 1, 2, 3, 4, 5]},
                ],
                "min_match_count": 2,
            }
        },
        "default_weight": 7,
        "default_priority": 25,
        "default_is_immediate_block": False,
        "default_logic_expression": {"expression": {"type": "AND", "conditions": []}},
        "tags": ["时段类", "金额类", "组合规则"],
        "is_builtin": True,
        "is_active": True,
    },
    {
        "name": "新设备首次大额交易",
        "description": "新设备首次交易即进行大额操作，可能存在账户被盗风险",
        "category": TemplateCategory.DEVICE,
        "applicable_scene": "适用于手机银行、第三方支付等场景，监控新设备大额交易",
        "rule_type": "association",
        "config": {
            "association": {
                "conditions": [
                    {"field": "is_new_device", "operator": "==", "value": True},
                    {"field": "amount", "operator": ">", "value": 30000},
                ],
                "min_match_count": 2,
            }
        },
        "default_weight": 8,
        "default_priority": 30,
        "default_is_immediate_block": False,
        "default_logic_expression": {"expression": {"type": "AND", "conditions": []}},
        "tags": ["设备类", "金额类", "新设备"],
        "is_builtin": True,
        "is_active": True,
    },
    {
        "name": "境外高风险地区交易",
        "description": "交易发生在高风险国家/地区，直接触发风控审核",
        "category": TemplateCategory.GEOGRAPHY,
        "applicable_scene": "适用于跨境支付、境外刷卡等场景",
        "rule_type": "threshold",
        "config": {
            "threshold": {
                "field": "is_high_risk_region",
                "operator": "==",
                "value": True,
            }
        },
        "default_weight": 9,
        "default_priority": 12,
        "default_is_immediate_block": True,
        "default_logic_expression": {"expression": {"type": "AND", "conditions": []}},
        "tags": ["地域类", "境外", "高风险"],
        "is_builtin": True,
        "is_active": True,
    },
]


async def _seed_builtin_templates() -> None:
    async with AsyncSessionLocal() as session:
        for tpl_data in BUILTIN_TEMPLATES:
            stmt = select(RuleTemplate).where(RuleTemplate.name == tpl_data["name"])
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing is None:
                template = RuleTemplate(**tpl_data)
                session.add(template)
                logger.info(f"Seeded builtin template: {tpl_data['name']}")
        await session.commit()


async def init_database() -> None:
    logger.info("Starting database initialization...")

    _ = (Rule, RuleVersion, Transaction, EvaluationResult, AuditLog, RuleTemplate)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    logger.info("Database tables created successfully.")

    await _seed_builtin_templates()
    logger.info("Builtin templates seeded successfully.")


async def drop_database() -> None:
    logger.info("Starting database drop...")

    _ = (Rule, RuleVersion, Transaction, EvaluationResult, AuditLog, RuleTemplate)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    logger.info("Database tables dropped successfully.")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "drop":
        asyncio.run(drop_database())
    else:
        asyncio.run(init_database())
