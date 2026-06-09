from datetime import datetime, timedelta
from typing import Optional

import redis.asyncio as redis
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import EvaluationResult, Transaction
from app.models.case import (
    CaseConclusion,
    CaseNote,
    CaseRiskLevel,
    CaseStatus,
    FraudCase,
)
from app.schemas.case import (
    CaseCloseRequest,
    CaseCreateFromTransaction,
    CaseNoteCreate,
    CaseResponse,
    CaseStatsResponse,
    CaseTransactionInfo,
    CaseHistoryTxn,
    CaseRuleHit,
    CaseNoteResponse,
)


CASE_NO_COUNTER_KEY = "fraud:case:counter:{date}"
CASE_LOCK_KEY = "fraud:case:lock:{case_id}"
CASE_LOCK_TTL = 30


def score_to_risk_level(score: int) -> CaseRiskLevel:
    if score >= 71:
        return CaseRiskLevel.HIGH
    if score >= 41:
        return CaseRiskLevel.MEDIUM
    return CaseRiskLevel.LOW


async def generate_case_no(redis_client: redis.Redis, created_at: Optional[datetime] = None) -> str:
    """
    并发安全的案件编号生成
    使用Redis INCR保证每日序号的原子性递增
    格式: CAS-YYYYMMDD-XXXX
    """
    if created_at is None:
        created_at = datetime.utcnow()
    date_str = created_at.strftime("%Y%m%d")
    redis_key = CASE_NO_COUNTER_KEY.format(date=date_str)

    seq = await redis_client.incr(redis_key)
    if seq == 1:
        await redis_client.expire(redis_key, 86400 * 2)

    return f"CAS-{date_str}-{str(seq).zfill(4)}"


async def acquire_case_lock(redis_client: redis.Redis, case_id: int) -> bool:
    """
    获取案件分布式锁，用于认领操作的并发控制
    """
    lock_key = CASE_LOCK_KEY.format(case_id=case_id)
    result = await redis_client.set(lock_key, "1", ex=CASE_LOCK_TTL, nx=True)
    return bool(result)


async def release_case_lock(redis_client: redis.Redis, case_id: int) -> None:
    """释放案件分布式锁"""
    lock_key = CASE_LOCK_KEY.format(case_id=case_id)
    await redis_client.delete(lock_key)


async def create_case_from_transaction(
    db: AsyncSession,
    redis_client: redis.Redis,
    request: CaseCreateFromTransaction,
) -> FraudCase:
    """从交易评估结果创建案件"""
    stmt = select(Transaction).where(Transaction.id == request.transaction_id)
    result = await db.execute(stmt)
    txn = result.scalar_one_or_none()
    if txn is None:
        raise ValueError(f"Transaction {request.transaction_id} not found")

    case_no = await generate_case_no(redis_client)

    case = FraudCase(
        case_no=case_no,
        status=CaseStatus.PENDING,
        risk_level=score_to_risk_level(request.risk_score),
        risk_score=request.risk_score,
        transaction_id=request.transaction_id,
        rule_hits=[rh.model_dump() for rh in request.rule_hits],
    )
    db.add(case)
    await db.flush()
    await db.refresh(case)
    return case


async def get_case_by_id(db: AsyncSession, case_id: int) -> Optional[FraudCase]:
    stmt = (
        select(FraudCase)
        .options(
            selectinload(FraudCase.transaction),
            selectinload(FraudCase.notes),
        )
        .where(FraudCase.id == case_id)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_cases(
    db: AsyncSession,
    page: int,
    page_size: int,
    status: Optional[CaseStatus] = None,
    risk_level: Optional[CaseRiskLevel] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    assigned_to: Optional[str] = None,
    case_no: Optional[str] = None,
) -> tuple[list[FraudCase], int]:
    conditions = []
    if status is not None:
        conditions.append(FraudCase.status == status)
    if risk_level is not None:
        conditions.append(FraudCase.risk_level == risk_level)
    if start_time is not None:
        conditions.append(FraudCase.created_at >= start_time)
    if end_time is not None:
        conditions.append(FraudCase.created_at <= end_time)
    if assigned_to is not None:
        conditions.append(FraudCase.assigned_to == assigned_to)
    if case_no is not None:
        conditions.append(FraudCase.case_no.ilike(f"%{case_no}%"))

    count_stmt = select(func.count(FraudCase.id))
    if conditions:
        count_stmt = count_stmt.where(and_(*conditions))
    total_result = await db.execute(count_stmt)
    total: int = int(total_result.scalar_one())

    offset = (page - 1) * page_size
    stmt = (
        select(FraudCase)
        .options(
            selectinload(FraudCase.transaction),
            selectinload(FraudCase.notes),
        )
    )
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(FraudCase.created_at.desc()).offset(offset).limit(page_size)

    result = await db.execute(stmt)
    cases = list(result.scalars().all())
    return cases, total


async def assign_case(
    db: AsyncSession,
    redis_client: redis.Redis,
    case_id: int,
    user_id: str,
    user_name: str,
) -> Optional[FraudCase]:
    """
    认领案件，使用Redis分布式锁保证并发安全
    """
    lock_acquired = await acquire_case_lock(redis_client, case_id)
    if not lock_acquired:
        return None

    try:
        case = await get_case_by_id(db, case_id)
        if case is None or case.status != CaseStatus.PENDING:
            return None

        case.status = CaseStatus.INVESTIGATING
        case.assigned_to = user_id
        case.assigned_to_name = user_name
        case.assigned_at = datetime.utcnow()
        case.updated_at = datetime.utcnow()

        await db.flush()
        await db.refresh(case)
        return case
    finally:
        await release_case_lock(redis_client, case_id)


async def close_case(
    db: AsyncSession,
    case_id: int,
    user_id: str,
    request: CaseCloseRequest,
) -> Optional[FraudCase]:
    case = await get_case_by_id(db, case_id)
    if case is None:
        return None
    if case.status != CaseStatus.INVESTIGATING:
        return None
    if case.assigned_to != user_id:
        return None

    case.status = CaseStatus.CLOSED
    case.conclusion = request.conclusion
    case.conclusion_note = request.conclusion_note
    case.closed_at = datetime.utcnow()
    case.updated_at = datetime.utcnow()

    await db.flush()
    await db.refresh(case)
    return case


async def add_case_note(
    db: AsyncSession,
    case_id: int,
    operator_name: str,
    operator_id: Optional[str],
    request: CaseNoteCreate,
) -> Optional[FraudCase]:
    case = await get_case_by_id(db, case_id)
    if case is None:
        return None
    if case.status == CaseStatus.CLOSED:
        return None

    note = CaseNote(
        case_id=case_id,
        content=request.content,
        operator=operator_name,
        operator_id=operator_id,
    )
    db.add(note)
    case.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(case)
    return case


async def get_case_stats(db: AsyncSession) -> CaseStatsResponse:
    pending_stmt = select(func.count(FraudCase.id)).where(FraudCase.status == CaseStatus.PENDING)
    investigating_stmt = select(func.count(FraudCase.id)).where(
        FraudCase.status == CaseStatus.INVESTIGATING
    )

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_closed_stmt = select(func.count(FraudCase.id)).where(
        and_(FraudCase.status == CaseStatus.CLOSED, FraudCase.closed_at >= today_start)
    )

    pending_result = await db.execute(pending_stmt)
    investigating_result = await db.execute(investigating_stmt)
    today_closed_result = await db.execute(today_closed_stmt)

    pending_count = int(pending_result.scalar_one())
    investigating_count = int(investigating_result.scalar_one())
    today_closed_count = int(today_closed_result.scalar_one())

    avg_hours_stmt = select(FraudCase).where(
        and_(FraudCase.status == CaseStatus.CLOSED, FraudCase.closed_at.isnot(None))
    )
    avg_result = await db.execute(avg_hours_stmt)
    closed_cases = list(avg_result.scalars().all())

    total_hours = 0.0
    for c in closed_cases:
        if c.closed_at and c.created_at:
            delta: timedelta = c.closed_at - c.created_at
            total_hours += delta.total_seconds() / 3600.0

    avg_hours = round(total_hours / len(closed_cases), 1) if closed_cases else 0.0

    return CaseStatsResponse(
        pending_count=pending_count,
        investigating_count=investigating_count,
        today_closed_count=today_closed_count,
        avg_processing_hours=avg_hours,
    )


async def get_user_history_transactions(
    db: AsyncSession, card_hash: str, days: int = 7
) -> list[CaseHistoryTxn]:
    since = datetime.utcnow() - timedelta(days=days)
    stmt = (
        select(Transaction)
        .options(selectinload(Transaction.evaluation_result))
        .where(
            and_(
                Transaction.card_hash == card_hash,
                Transaction.transaction_time >= since,
            )
        )
        .order_by(Transaction.transaction_time.desc())
        .limit(50)
    )
    result = await db.execute(stmt)
    txns = list(result.scalars().all())

    history: list[CaseHistoryTxn] = []
    for txn in txns:
        risk_score = 0
        decision = "allow"
        if txn.evaluation_result is not None:
            risk_score = txn.evaluation_result.risk_score
            decision = (
                txn.evaluation_result.decision.value
                if hasattr(txn.evaluation_result.decision, "value")
                else str(txn.evaluation_result.decision)
            )
        history.append(
            CaseHistoryTxn(
                id=txn.id,
                transaction_no=txn.transaction_no,
                amount=txn.amount,
                transaction_time=txn.transaction_time,
                risk_score=risk_score,
                decision=decision,
                is_abnormal=risk_score >= 70,
            )
        )
    return history


def build_case_response(case: FraudCase, history_txns: Optional[list[CaseHistoryTxn]] = None) -> CaseResponse:
    txn_info = CaseTransactionInfo(
        id=case.transaction.id,
        transaction_no=case.transaction.transaction_no,
        card_no=case.transaction.card_no,
        card_hash=case.transaction.card_hash,
        device_id=case.transaction.device_id,
        amount=case.transaction.amount,
        merchant_id=case.transaction.merchant_id,
        merchant_name=case.transaction.merchant_name,
        region=case.transaction.region,
        region_code=case.transaction.region_code,
        is_overseas=case.transaction.is_overseas,
        transaction_time=case.transaction.transaction_time,
        lat=case.transaction.lat,
        lng=case.transaction.lng,
    )

    rule_hits = [
        CaseRuleHit(
            rule_name=str(rh.get("rule_name", "")),
            trigger_condition=str(rh.get("trigger_condition", "")),
            score=int(rh.get("score", 0)),
        )
        if isinstance(rh, dict)
        else CaseRuleHit.model_validate(rh)
        for rh in (case.rule_hits or [])
    ]

    notes = [CaseNoteResponse.model_validate(n) for n in (case.notes or [])]

    return CaseResponse(
        id=case.id,
        case_no=case.case_no,
        status=case.status,
        risk_level=case.risk_level,
        risk_score=case.risk_score,
        assigned_to=case.assigned_to,
        assigned_to_name=case.assigned_to_name,
        assigned_at=case.assigned_at,
        conclusion=case.conclusion,
        conclusion_note=case.conclusion_note,
        closed_at=case.closed_at,
        created_at=case.created_at,
        updated_at=case.updated_at,
        transaction_id=case.transaction_id,
        transaction=txn_info,
        rule_hits=rule_hits,
        notes=notes,
        history_transactions=history_txns or [],
    )
