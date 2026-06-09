import asyncio
import logging
from datetime import datetime

import redis.asyncio as redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.case import CaseStatus, FraudCase
from app.redis_client import get_redis_client
from app.services.case_service import (
    auto_assign_case,
    check_and_mark_overtime,
)
from app.websocket_manager import ws_manager

logger = logging.getLogger(__name__)

OVERTIME_CHECK_INTERVAL = 600
AUTO_ASSIGN_CHECK_INTERVAL = 30


async def _get_db() -> AsyncSession:
    return AsyncSessionLocal()


async def run_overtime_check_loop():
    while True:
        try:
            db: AsyncSession = await _get_db()
            try:
                overtime_cases = await check_and_mark_overtime(db)
                await db.commit()
                for case in overtime_cases:
                    logger.info(f"案件 {case.case_no} 已超时")
                    await ws_manager.send_case_overtime(case.id, case.case_no)
            except Exception as e:
                logger.error(f"超时检查任务执行失败: {e}")
                await db.rollback()
            finally:
                await db.close()
        except Exception as e:
            logger.error(f"超时检查循环异常: {e}")

        await asyncio.sleep(OVERTIME_CHECK_INTERVAL)


async def run_auto_assign_loop():
    while True:
        try:
            db: AsyncSession = await _get_db()
            redis_client: redis.Redis = get_redis_client()
            try:
                stmt = (
                    select(FraudCase)
                    .where(FraudCase.status == CaseStatus.PENDING)
                    .order_by(FraudCase.created_at.asc())
                )
                result = await db.execute(stmt)
                pending_cases = list(result.scalars().all())

                for case in pending_cases:
                    assigned = await auto_assign_case(db, redis_client, case.id)
                    if assigned:
                        logger.info(
                            f"案件 {case.case_no} 已自动分配给 {assigned.assigned_to_name}"
                        )
                        await ws_manager.send_case_assigned(
                            assigned.id,
                            assigned.case_no,
                            assigned.assigned_to_name or "",
                        )
                        await db.commit()
            except Exception as e:
                logger.error(f"自动分配任务执行失败: {e}")
                await db.rollback()
            finally:
                await db.close()
        except Exception as e:
            logger.error(f"自动分配循环异常: {e}")

        await asyncio.sleep(AUTO_ASSIGN_CHECK_INTERVAL)


async def start_scheduler():
    logger.info("启动定时任务调度器...")
    asyncio.create_task(run_overtime_check_loop())
    asyncio.create_task(run_auto_assign_loop())
    logger.info("定时任务调度器已启动")
