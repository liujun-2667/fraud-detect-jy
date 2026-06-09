import asyncio
import logging

from app.database import Base, engine
from app.models import AuditLog, EvaluationResult, Rule, RuleVersion, Transaction

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def init_database() -> None:
    logger.info("Starting database initialization...")

    _ = (Rule, RuleVersion, Transaction, EvaluationResult, AuditLog)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    logger.info("Database tables created successfully.")


async def drop_database() -> None:
    logger.info("Starting database drop...")

    _ = (Rule, RuleVersion, Transaction, EvaluationResult, AuditLog)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    logger.info("Database tables dropped successfully.")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "drop":
        asyncio.run(drop_database())
    else:
        asyncio.run(init_database())
