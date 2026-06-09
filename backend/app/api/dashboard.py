from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, cast, Date, extract, func, Integer, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import redis.asyncio as redis

from app.api.deps import CommonQueryParams, get_db_session, get_redis_client
from app.models import DecisionType, EvaluationResult, Rule, Transaction
from app.schemas import TransactionListResponse, TransactionResponse

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _get_date_range(days: int) -> tuple[datetime, datetime]:
    end = datetime.utcnow()
    start = end - timedelta(days=max(1, days))
    return start, end


@router.get("/overview", response_model=dict)
async def get_dashboard_overview(
    days: int = Query(1, ge=1, le=365, description="统计天数: 1/7/30"),
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    start_time, end_time = _get_date_range(days)

    total_stmt = (
        select(func.count(Transaction.id))
        .where(
            and_(
                Transaction.transaction_time >= start_time,
                Transaction.transaction_time <= end_time,
            )
        )
    )
    total_result = await db.execute(total_stmt)
    total_transactions: int = int(total_result.scalar_one())

    eval_conditions = and_(
        Transaction.transaction_time >= start_time,
        Transaction.transaction_time <= end_time,
        EvaluationResult.transaction_id == Transaction.id,
    )

    block_stmt = select(func.count(Transaction.id)).where(
        and_(eval_conditions, EvaluationResult.decision == DecisionType.BLOCK)
    )
    block_result = await db.execute(block_stmt)
    block_count: int = int(block_result.scalar_one())

    review_stmt = select(func.count(Transaction.id)).where(
        and_(eval_conditions, EvaluationResult.decision == DecisionType.REVIEW)
    )
    review_result = await db.execute(review_stmt)
    review_count: int = int(review_result.scalar_one())

    allow_stmt = select(func.count(Transaction.id)).where(
        and_(eval_conditions, EvaluationResult.decision == DecisionType.ALLOW)
    )
    allow_result = await db.execute(allow_stmt)
    allow_count: int = int(allow_result.scalar_one())

    block_rate: float = round((block_count / total_transactions) * 100, 2) if total_transactions > 0 else 0.0
    false_positive_rate: float = 0.0
    if review_count > 0:
        false_positive_rate = 0.0

    return {
        "total_transactions": total_transactions,
        "block_count": block_count,
        "review_count": review_count,
        "allow_count": allow_count,
        "block_rate": block_rate,
        "false_positive_rate": false_positive_rate,
    }


@router.get("/trend", response_model=list[dict])
async def get_transaction_trend(
    days: int = Query(7, ge=1, le=365, description="趋势天数"),
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    start_time, end_time = _get_date_range(days)

    date_col = cast(Transaction.transaction_time, Date).label("date")

    stmt = (
        select(
            date_col,
            func.count(Transaction.id).label("total"),
            func.sum(case((EvaluationResult.decision == DecisionType.BLOCK, 1), else_=0)).label("block"),
            func.sum(case((EvaluationResult.decision == DecisionType.REVIEW, 1), else_=0)).label("review"),
            func.sum(case((EvaluationResult.decision == DecisionType.ALLOW, 1), else_=0)).label("allow"),
        )
        .select_from(Transaction)
        .outerjoin(EvaluationResult, EvaluationResult.transaction_id == Transaction.id)
        .where(
            and_(
                Transaction.transaction_time >= start_time,
                Transaction.transaction_time <= end_time,
            )
        )
        .group_by(date_col)
        .order_by(date_col)
    )

    result = await db.execute(stmt)
    rows = result.all()

    date_map: dict[str, dict[str, Any]] = {}
    for row in rows:
        date_str = str(row[0])
        date_map[date_str] = {
            "date": date_str,
            "total": int(row[1] or 0),
            "block": int(row[2] or 0),
            "review": int(row[3] or 0),
            "allow": int(row[4] or 0),
        }

    trend: list[dict[str, Any]] = []
    current = start_time.date()
    end_date = end_time.date()
    while current <= end_date:
        date_str = current.isoformat()
        if date_str in date_map:
            trend.append(date_map[date_str])
        else:
            trend.append({
                "date": date_str,
                "total": 0,
                "block": 0,
                "review": 0,
                "allow": 0,
            })
        current += timedelta(days=1)

    return trend


@router.get("/rules/hit-stats", response_model=list[dict])
async def get_rule_hit_stats(
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    all_rules_stmt = select(Rule)
    all_rules_result = await db.execute(all_rules_stmt)
    all_rules = list(all_rules_result.scalars().all())

    rule_map: dict[int, Rule] = {}
    for rule in all_rules:
        rule_map[rule.id] = rule

    eval_stmt = select(EvaluationResult).where(EvaluationResult.decision == DecisionType.BLOCK)
    eval_result = await db.execute(eval_stmt)
    block_evals = list(eval_result.scalars().all())

    hit_count_map: dict[int, int] = {}
    block_contribution_map: dict[int, int] = {}

    for eval_item in block_evals:
        rule_hits = eval_item.rule_hits or []
        for rh in rule_hits:
            if isinstance(rh, dict):
                rid = int(rh.get("rule_id") or 0)
                if rid > 0:
                    hit_count_map[rid] = hit_count_map.get(rid, 0) + 1
                    block_contribution_map[rid] = block_contribution_map.get(rid, 0) + int(rh.get("score") or 0)

    stats: list[dict[str, Any]] = []
    for rule_id, rule in rule_map.items():
        hit_count = hit_count_map.get(rule_id, 0)
        if hit_count > 0 or True:
            stats.append({
                "rule_id": rule_id,
                "rule_name": rule.name,
                "hit_count": hit_count,
                "block_contribution": block_contribution_map.get(rule_id, 0),
            })

    stats.sort(key=lambda x: x["hit_count"], reverse=True)
    return stats


@router.get("/heatmap/region", response_model=list[dict])
async def get_region_heatmap(
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    stmt = (
        select(
            Transaction.region_code,
            Transaction.region,
            func.count(Transaction.id).label("total_count"),
            func.sum(
                case(
                    (and_(EvaluationResult.decision == DecisionType.BLOCK, EvaluationResult.risk_score >= 70), 1),
                    else_=0,
                )
            ).label("high_risk_count"),
        )
        .select_from(Transaction)
        .outerjoin(EvaluationResult, EvaluationResult.transaction_id == Transaction.id)
        .where(Transaction.region_code.isnot(None))
        .group_by(Transaction.region_code, Transaction.region)
        .order_by(func.count(Transaction.id).desc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    heatmap: list[dict[str, Any]] = []
    for row in rows:
        total_count = int(row[2] or 0)
        high_risk_count = int(row[3] or 0)
        risk_ratio = round((high_risk_count / total_count) * 100, 2) if total_count > 0 else 0.0
        heatmap.append({
            "region_code": row[0] or "",
            "region": row[1] or "",
            "total_count": total_count,
            "high_risk_count": high_risk_count,
            "risk_ratio": risk_ratio,
        })

    return heatmap


@router.get("/heatmap/hour", response_model=list[dict])
async def get_hour_heatmap(
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    hour_col = cast(extract("hour", Transaction.transaction_time), Integer).label("hour")

    stmt = (
        select(
            hour_col,
            func.count(Transaction.id).label("total_count"),
            func.sum(
                case(
                    (and_(EvaluationResult.decision == DecisionType.BLOCK, EvaluationResult.risk_score >= 70), 1),
                    else_=0,
                )
            ).label("high_risk_count"),
        )
        .select_from(Transaction)
        .outerjoin(EvaluationResult, EvaluationResult.transaction_id == Transaction.id)
        .group_by(hour_col)
        .order_by(hour_col)
    )

    result = await db.execute(stmt)
    rows = result.all()

    hour_map: dict[int, dict[str, Any]] = {}
    for row in rows:
        hour = int(row[0] or 0)
        total_count = int(row[1] or 0)
        high_risk_count = int(row[2] or 0)
        risk_ratio = round((high_risk_count / total_count) * 100, 2) if total_count > 0 else 0.0
        hour_map[hour] = {
            "hour": hour,
            "total_count": total_count,
            "high_risk_count": high_risk_count,
            "risk_ratio": risk_ratio,
        }

    heatmap: list[dict[str, Any]] = []
    for h in range(24):
        if h in hour_map:
            heatmap.append(hour_map[h])
        else:
            heatmap.append({
                "hour": h,
                "total_count": 0,
                "high_risk_count": 0,
                "risk_ratio": 0.0,
            })

    return heatmap


@router.get("/heatmap/amount-range", response_model=list[dict])
async def get_amount_range_heatmap(
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    ranges = [
        ("0-100", Decimal("0"), Decimal("100")),
        ("100-500", Decimal("100"), Decimal("500")),
        ("500-1000", Decimal("500"), Decimal("1000")),
        ("1000-5000", Decimal("1000"), Decimal("5000")),
        ("5000-10000", Decimal("5000"), Decimal("10000")),
        ("10000+", Decimal("10000"), Decimal("999999999999")),
    ]

    heatmap: list[dict[str, Any]] = []

    for range_label, min_amount, max_amount in ranges:
        stmt = (
            select(
                func.count(Transaction.id).label("total_count"),
                func.sum(
                    case(
                        (and_(EvaluationResult.decision == DecisionType.BLOCK, EvaluationResult.risk_score >= 70), 1),
                        else_=0,
                    )
                ).label("high_risk_count"),
            )
            .select_from(Transaction)
            .outerjoin(EvaluationResult, EvaluationResult.transaction_id == Transaction.id)
            .where(
                and_(
                    Transaction.amount >= min_amount,
                    Transaction.amount < max_amount if range_label != "10000+" else Transaction.amount >= min_amount,
                )
            )
        )
        result = await db.execute(stmt)
        row = result.first()
        total_count = int(row[0] or 0) if row else 0
        high_risk_count = int(row[1] or 0) if row else 0
        risk_ratio = round((high_risk_count / total_count) * 100, 2) if total_count > 0 else 0.0
        heatmap.append({
            "range_label": range_label,
            "min_amount": float(min_amount),
            "max_amount": float(max_amount) if range_label != "10000+" else None,
            "total_count": total_count,
            "high_risk_count": high_risk_count,
            "risk_ratio": risk_ratio,
        })

    return heatmap


@router.get("/alerts", response_model=list[dict])
async def get_daily_alerts(
    days: int = Query(7, ge=1, le=365, description="统计天数"),
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    start_time, end_time = _get_date_range(days)
    date_col = cast(Transaction.transaction_time, Date).label("date")

    stmt = (
        select(
            date_col,
            func.sum(case((EvaluationResult.decision == DecisionType.REVIEW, 1), else_=0)).label("new_count"),
            func.sum(case((EvaluationResult.decision.in_([DecisionType.ALLOW, DecisionType.BLOCK]), 1), else_=0)).label("reviewed_count"),
        )
        .select_from(Transaction)
        .outerjoin(EvaluationResult, EvaluationResult.transaction_id == Transaction.id)
        .where(
            and_(
                Transaction.transaction_time >= start_time,
                Transaction.transaction_time <= end_time,
            )
        )
        .group_by(date_col)
        .order_by(date_col)
    )

    result = await db.execute(stmt)
    rows = result.all()

    date_map: dict[str, dict[str, Any]] = {}
    for row in rows:
        date_str = str(row[0])
        new_count = int(row[1] or 0)
        reviewed_count = int(row[2] or 0)
        total_alerts = new_count + reviewed_count
        processed_rate = round((reviewed_count / total_alerts) * 100, 2) if total_alerts > 0 else 0.0
        date_map[date_str] = {
            "date": date_str,
            "new_count": new_count,
            "reviewed_count": reviewed_count,
            "processed_rate": processed_rate,
        }

    alerts: list[dict[str, Any]] = []
    current = start_time.date()
    end_date = end_time.date()
    while current <= end_date:
        date_str = current.isoformat()
        if date_str in date_map:
            alerts.append(date_map[date_str])
        else:
            alerts.append({
                "date": date_str,
                "new_count": 0,
                "reviewed_count": 0,
                "processed_rate": 0.0,
            })
        current += timedelta(days=1)

    return alerts


@router.get("/rules/{rule_id}/transactions", response_model=TransactionListResponse)
async def get_rule_hit_transactions(
    rule_id: int,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
    commons: CommonQueryParams = Depends(),
):
    rule_stmt = select(Rule).where(Rule.id == rule_id)
    rule_result = await db.execute(rule_stmt)
    rule = rule_result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="规则不存在")

    all_evals_stmt = select(EvaluationResult)
    all_evals_result = await db.execute(all_evals_stmt)
    all_evals = list(all_evals_result.scalars().all())

    matching_txn_ids: list[int] = []
    for eval_item in all_evals:
        rule_hits = eval_item.rule_hits or []
        for rh in rule_hits:
            if isinstance(rh, dict) and int(rh.get("rule_id") or 0) == rule_id:
                matching_txn_ids.append(eval_item.transaction_id)
                break

    total = len(matching_txn_ids)
    page_ids = matching_txn_ids[commons.offset: commons.offset + commons.page_size]

    transactions: list[Transaction] = []
    if page_ids:
        stmt = (
            select(Transaction)
            .options(selectinload(Transaction.evaluation_result))
            .where(Transaction.id.in_(page_ids))
            .order_by(Transaction.transaction_time.desc())
        )
        result = await db.execute(stmt)
        transactions = list(result.scalars().all())

    items = [TransactionResponse.model_validate(t) for t in transactions]
    return TransactionListResponse(
        items=items,
        total=total,
        page=commons.page,
        page_size=commons.page_size,
    )
