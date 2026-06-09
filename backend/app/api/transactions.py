import csv
import io
import json
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import redis.asyncio as redis

from app.api.deps import CommonQueryParams, get_db_session, get_redis_client
from app.models import DecisionType, EvaluationResult, Transaction
from app.schemas import (
    EvaluateTransactionRequest,
    EvaluateTransactionResponse,
    EvaluationResultListResponse,
    EvaluationResultResponse,
    RuleHit,
    TransactionListResponse,
    TransactionResponse,
)
from app.services import detect_fraud

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.post("/evaluate", response_model=EvaluateTransactionResponse)
async def evaluate_transaction(
    request: EvaluateTransactionRequest,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    txn_data = request.transaction.model_dump()
    txn_dict: dict[str, Any] = {k: v for k, v in txn_data.items()}

    start_ms = int(datetime.utcnow().timestamp() * 1000)
    result = await detect_fraud(txn_dict, db, redis_client)
    end_ms = int(datetime.utcnow().timestamp() * 1000)
    execution_ms = max(0, end_ms - start_ms)

    stmt = select(Transaction).where(Transaction.transaction_no == txn_dict["transaction_no"])
    existing = await db.execute(stmt)
    txn = existing.scalar_one_or_none()

    if txn is None:
        txn = Transaction(
            transaction_no=txn_dict["transaction_no"],
            card_no=txn_dict["card_no"],
            card_hash=txn_dict["card_hash"],
            device_id=txn_dict.get("device_id"),
            amount=txn_dict["amount"],
            merchant_id=txn_dict.get("merchant_id"),
            merchant_name=txn_dict.get("merchant_name"),
            region=txn_dict.get("region"),
            region_code=txn_dict.get("region_code"),
            is_overseas=bool(txn_dict.get("is_overseas", False)),
            transaction_time=txn_dict["transaction_time"],
            lat=txn_dict.get("lat"),
            lng=txn_dict.get("lng"),
        )
        db.add(txn)
        await db.flush()
        await db.refresh(txn)
    else:
        txn.device_id = txn_dict.get("device_id") or txn.device_id
        txn.merchant_id = txn_dict.get("merchant_id") or txn.merchant_id
        txn.merchant_name = txn_dict.get("merchant_name") or txn.merchant_name
        txn.region = txn_dict.get("region") or txn.region
        txn.region_code = txn_dict.get("region_code") or txn.region_code
        txn.is_overseas = bool(txn_dict.get("is_overseas", txn.is_overseas))
        txn.lat = txn_dict.get("lat") or txn.lat
        txn.lng = txn_dict.get("lng") or txn.lng

    decision_str = str(result.get("decision", "allow"))
    decision_enum = DecisionType(decision_str)
    score = int(result.get("score", 0))

    rule_hits_raw = result.get("hit_rules", []) or []
    rule_hits_pydantic: list[RuleHit] = []
    for rh in rule_hits_raw:
        rule_hits_pydantic.append(
            RuleHit(
                rule_version_id=int(rh.get("version_id") or rh.get("rule_version_id") or 0),
                rule_name=str(rh.get("rule_name", "")),
                weight=int(rh.get("weight", 5)),
                score=int(rh.get("score") or score),
                is_hit=True,
            )
        )

    if txn.evaluation_result is not None:
        txn.evaluation_result.risk_score = score
        txn.evaluation_result.decision = decision_enum
        txn.evaluation_result.rule_hits = [r.model_dump() for r in rule_hits_pydantic]
        txn.evaluation_result.execution_ms = execution_ms
    else:
        eval_result = EvaluationResult(
            transaction_id=txn.id,
            risk_score=score,
            decision=decision_enum,
            rule_hits=[r.model_dump() for r in rule_hits_pydantic],
            execution_ms=execution_ms,
        )
        db.add(eval_result)

    await db.commit()
    await db.refresh(txn)

    return EvaluateTransactionResponse(
        transaction_id=txn.id,
        transaction_no=txn.transaction_no,
        risk_score=score,
        decision=decision_enum,
        rule_hits=rule_hits_pydantic,
        execution_ms=execution_ms,
        evaluated_at=datetime.utcnow(),
        is_cached=False,
    )


@router.get("", response_model=TransactionListResponse)
async def list_transactions(
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
    commons: CommonQueryParams = Depends(),
    card_no: Optional[str] = Query(None, description="卡号筛选"),
    transaction_no: Optional[str] = Query(None, description="交易号筛选"),
    start_time: Optional[datetime] = Query(None, description="开始时间"),
    end_time: Optional[datetime] = Query(None, description="结束时间"),
    decision: Optional[DecisionType] = Query(None, description="决策筛选"),
):
    conditions = []
    if card_no:
        conditions.append(Transaction.card_no == card_no)
    if transaction_no:
        conditions.append(Transaction.transaction_no == transaction_no)
    if start_time is not None:
        conditions.append(Transaction.transaction_time >= start_time)
    if end_time is not None:
        conditions.append(Transaction.transaction_time <= end_time)

    decision_filter_ids: Optional[list[int]] = None
    if decision is not None:
        eval_stmt = select(EvaluationResult.transaction_id).where(EvaluationResult.decision == decision)
        eval_result = await db.execute(eval_stmt)
        decision_filter_ids = [row[0] for row in eval_result.all()]
        if not decision_filter_ids:
            return TransactionListResponse(
                items=[],
                total=0,
                page=commons.page,
                page_size=commons.page_size,
            )
        conditions.append(Transaction.id.in_(decision_filter_ids))

    count_stmt = select(func.count(Transaction.id))
    if conditions:
        count_stmt = count_stmt.where(and_(*conditions))
    total_result = await db.execute(count_stmt)
    total: int = int(total_result.scalar_one())

    stmt = (
        select(Transaction)
        .options(selectinload(Transaction.evaluation_result))
    )
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(Transaction.transaction_time.desc()).offset(commons.offset).limit(commons.page_size)

    result = await db.execute(stmt)
    transactions = list(result.scalars().all())

    items = [TransactionResponse.model_validate(t) for t in transactions]
    return TransactionListResponse(
        items=items,
        total=total,
        page=commons.page,
        page_size=commons.page_size,
    )


@router.get("/{transaction_id}", response_model=TransactionResponse)
async def get_transaction_detail(
    transaction_id: int,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    stmt = (
        select(Transaction)
        .options(selectinload(Transaction.evaluation_result))
        .where(Transaction.id == transaction_id)
    )
    result = await db.execute(stmt)
    txn = result.scalar_one_or_none()
    if txn is None:
        raise HTTPException(status_code=404, detail="交易不存在")
    return TransactionResponse.model_validate(txn)


@router.get("/{transaction_id}/evaluations", response_model=EvaluationResultListResponse)
async def get_transaction_evaluations(
    transaction_id: int,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
    commons: CommonQueryParams = Depends(),
):
    count_stmt = select(func.count(EvaluationResult.id)).where(EvaluationResult.transaction_id == transaction_id)
    total_result = await db.execute(count_stmt)
    total: int = int(total_result.scalar_one())

    stmt = (
        select(EvaluationResult)
        .where(EvaluationResult.transaction_id == transaction_id)
        .order_by(EvaluationResult.created_at.desc())
        .offset(commons.offset)
        .limit(commons.page_size)
    )
    result = await db.execute(stmt)
    evaluations = list(result.scalars().all())

    items = [EvaluationResultResponse.model_validate(e) for e in evaluations]
    return EvaluationResultListResponse(
        items=items,
        total=total,
        page=commons.page,
        page_size=commons.page_size,
    )


@router.get("/card/{card_hash}", response_model=TransactionListResponse)
async def get_transactions_by_card(
    card_hash: str,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
    commons: CommonQueryParams = Depends(),
):
    count_stmt = select(func.count(Transaction.id)).where(Transaction.card_hash == card_hash)
    total_result = await db.execute(count_stmt)
    total: int = int(total_result.scalar_one())

    stmt = (
        select(Transaction)
        .options(selectinload(Transaction.evaluation_result))
        .where(Transaction.card_hash == card_hash)
        .order_by(Transaction.transaction_time.desc())
        .offset(commons.offset)
        .limit(commons.page_size)
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


@router.get("/export/csv")
async def export_transactions_csv(
    start_time: datetime = Query(..., description="开始时间"),
    end_time: datetime = Query(..., description="结束时间"),
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    stmt = (
        select(Transaction)
        .options(selectinload(Transaction.evaluation_result))
        .where(
            and_(
                Transaction.transaction_time >= start_time,
                Transaction.transaction_time <= end_time,
            )
        )
        .order_by(Transaction.transaction_time.desc())
    )
    result = await db.execute(stmt)
    transactions = list(result.scalars().all())

    def csv_generator():
        output = io.StringIO()
        writer = csv.writer(output)
        header = ["交易号", "卡号", "金额", "地区", "时间", "评分", "决策", "命中规则"]
        writer.writerow(header)
        yield output.getvalue()
        output.seek(0)
        output.truncate()

        for txn in transactions:
            risk_score = ""
            decision = ""
            hit_rules_str = ""
            if txn.evaluation_result is not None:
                risk_score = str(txn.evaluation_result.risk_score)
                decision = str(txn.evaluation_result.decision.value if hasattr(txn.evaluation_result.decision, "value") else txn.evaluation_result.decision)
                rule_hits = txn.evaluation_result.rule_hits or []
                rule_names = [str(rh.get("rule_name", "")) for rh in rule_hits if isinstance(rh, dict)]
                hit_rules_str = ";".join(rule_names)

            row = [
                txn.transaction_no,
                txn.card_no,
                str(txn.amount),
                txn.region or "",
                txn.transaction_time.strftime("%Y-%m-%d %H:%M:%S") if txn.transaction_time else "",
                risk_score,
                decision,
                hit_rules_str,
            ]
            writer.writerow(row)
            yield output.getvalue()
            output.seek(0)
            output.truncate()

    filename = f"transactions_{start_time.strftime('%Y%m%d')}_{end_time.strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        csv_generator(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
        },
    )
