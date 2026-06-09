import json
import time
import uuid
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

import redis.asyncio as redis

from app.api.deps import CommonQueryParams, get_db_session, get_redis_client
from app.models import DecisionType, EvaluationResult, Transaction

router = APIRouter(prefix="/sandbox", tags=["sandbox"])

SANDBOX_KEY_PREFIX = "sandbox:test:"
SANDBOX_LIST_KEY = "sandbox:tests"
SANDBOX_TTL_SECONDS = 86400 * 7


def _parse_sandbox_data(data: Optional[str]) -> dict[str, Any]:
    if not data:
        return {}
    try:
        return json.loads(data)
    except (json.JSONDecodeError, ValueError):
        return {}


@router.post("/tests", response_model=dict)
async def create_sandbox_test(
    body: dict,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    test_id = str(uuid.uuid4())
    rule_config = body.get("rule_config", {}) or {}
    weight = int(body.get("weight", 5))
    priority = int(body.get("priority", 100))
    days_to_replay = int(body.get("days_to_replay", 7))

    test_record: dict[str, Any] = {
        "test_id": test_id,
        "status": "running",
        "rule_config": rule_config,
        "weight": weight,
        "priority": priority,
        "days_to_replay": days_to_replay,
        "total_transactions": 0,
        "hit_count": 0,
        "block_count": 0,
        "miss_count": 0,
        "estimated_hit_rate": 0.0,
        "estimated_block_rate": 0.0,
        "estimated_miss_rate": 0.0,
        "sample_results": [],
        "created_at": datetime.utcnow().isoformat(),
        "completed_at": None,
    }

    await redis_client.setex(
        f"{SANDBOX_KEY_PREFIX}{test_id}",
        SANDBOX_TTL_SECONDS,
        json.dumps(test_record, ensure_ascii=False),
    )
    await redis_client.lpush(SANDBOX_LIST_KEY, test_id)
    await redis_client.ltrim(SANDBOX_LIST_KEY, 0, 99)

    start_time = datetime.utcnow() - timedelta(days=max(1, days_to_replay))
    count_stmt = (
        select(func.count(Transaction.id))
        .where(Transaction.transaction_time >= start_time)
    )
    count_result = await db.execute(count_stmt)
    total_transactions: int = int(count_result.scalar_one())

    txn_stmt = (
        select(Transaction)
        .where(Transaction.transaction_time >= start_time)
        .order_by(Transaction.transaction_time.desc())
    )
    txn_result = await db.execute(txn_stmt)
    transactions = list(txn_result.scalars().all())

    hit_count = 0
    block_count = 0
    miss_count = 0
    sample_results: list[dict[str, Any]] = []

    def _rule_matches(txn: Transaction, config: dict[str, Any]) -> bool:
        threshold_cfg = config.get("threshold") or {}
        if isinstance(threshold_cfg, dict) and threshold_cfg:
            field = str(threshold_cfg.get("field", ""))
            operator = str(threshold_cfg.get("operator", ">"))
            value = threshold_cfg.get("value")
            txn_val: Any = None
            if field == "amount":
                txn_val = float(txn.amount)
            elif field == "is_overseas":
                txn_val = bool(txn.is_overseas)
            else:
                txn_val = getattr(txn, field, None)

            if txn_val is not None and value is not None:
                try:
                    if operator == ">":
                        return float(txn_val) > float(value)
                    if operator == ">=":
                        return float(txn_val) >= float(value)
                    if operator == "<":
                        return float(txn_val) < float(value)
                    if operator == "<=":
                        return float(txn_val) <= float(value)
                    if operator == "==":
                        return str(txn_val) == str(value)
                    if operator == "!=":
                        return str(txn_val) != str(value)
                except (ValueError, TypeError):
                    return False
        return False

    for txn in transactions:
        is_hit = _rule_matches(txn, rule_config)
        if is_hit:
            hit_count += 1
            if len(sample_results) < 20:
                sample_results.append({
                    "transaction_id": txn.id,
                    "transaction_no": txn.transaction_no,
                    "card_no": txn.card_no,
                    "amount": float(txn.amount),
                    "region": txn.region,
                    "transaction_time": txn.transaction_time.isoformat() if txn.transaction_time else None,
                    "is_overseas": txn.is_overseas,
                })

    if total_transactions > 0:
        estimated_hit_rate = round((hit_count / total_transactions) * 100, 2)
    else:
        estimated_hit_rate = 0.0

    estimated_block_rate = round(estimated_hit_rate * (weight / 10.0), 2)
    estimated_miss_rate = 0.0

    test_record["status"] = "completed"
    test_record["total_transactions"] = total_transactions
    test_record["hit_count"] = hit_count
    test_record["block_count"] = block_count
    test_record["miss_count"] = miss_count
    test_record["estimated_hit_rate"] = estimated_hit_rate
    test_record["estimated_block_rate"] = estimated_block_rate
    test_record["estimated_miss_rate"] = estimated_miss_rate
    test_record["sample_results"] = sample_results
    test_record["completed_at"] = datetime.utcnow().isoformat()

    await redis_client.setex(
        f"{SANDBOX_KEY_PREFIX}{test_id}",
        SANDBOX_TTL_SECONDS,
        json.dumps(test_record, ensure_ascii=False, default=str),
    )

    return test_record


@router.get("/tests/{test_id}", response_model=dict)
async def get_sandbox_test_result(
    test_id: str,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    raw = await redis_client.get(f"{SANDBOX_KEY_PREFIX}{test_id}")
    test_data = _parse_sandbox_data(raw)
    if not test_data:
        raise HTTPException(status_code=404, detail="沙盒测试不存在")
    return test_data


@router.get("/tests", response_model=list[dict])
async def list_sandbox_tests(
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
    commons: CommonQueryParams = Depends(),
):
    raw_ids = await redis_client.lrange(SANDBOX_LIST_KEY, 0, -1)
    test_ids = [tid for tid in raw_ids if isinstance(tid, str)]

    start = commons.offset
    end = commons.offset + commons.page_size
    page_ids = test_ids[start:end]

    tests: list[dict[str, Any]] = []
    for tid in page_ids:
        raw = await redis_client.get(f"{SANDBOX_KEY_PREFIX}{tid}")
        data = _parse_sandbox_data(raw)
        if data:
            tests.append(data)

    return tests
