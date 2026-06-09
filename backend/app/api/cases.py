from datetime import datetime
from typing import Optional

import redis.asyncio as redis
from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CommonQueryParams, get_db_session, get_redis_client
from app.models.case import CaseRiskLevel, CaseStatus
from app.schemas.case import (
    AnalystInfo,
    CaseCloseRequest,
    CaseListResponse,
    CaseNoteCreate,
    CaseResponse,
    CaseStatsResponse,
    CaseTransferRequest,
)
from app.services.case_service import (
    add_case_note,
    assign_case,
    auto_assign_case,
    build_case_response,
    check_and_mark_overtime,
    close_case,
    count_fraud_history,
    get_analysts_with_stats,
    get_case_by_id,
    get_case_stats,
    get_related_cases,
    get_user_history_transactions,
    list_cases,
    transfer_case,
)
from app.websocket_manager import ws_manager

router = APIRouter(prefix="/cases", tags=["cases"])


def _get_current_user(request: Request) -> tuple[str, str]:
    user_id = request.headers.get("X-User-Id", "user_1")
    user_name = request.headers.get("X-User-Name", "张伟")
    return user_id, user_name


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


@router.get("", response_model=CaseListResponse)
async def get_case_list(
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
    commons: CommonQueryParams = Depends(),
    status: Optional[CaseStatus] = Query(None, description="案件状态筛选"),
    risk_level: Optional[CaseRiskLevel] = Query(None, description="风险等级筛选"),
    start_time: Optional[datetime] = Query(None, description="创建开始时间"),
    end_time: Optional[datetime] = Query(None, description="创建结束时间"),
    assigned_to: Optional[str] = Query(None, description="认领人ID筛选"),
    case_no: Optional[str] = Query(None, description="案件编号模糊搜索"),
):
    cases, total = await list_cases(
        db=db,
        page=commons.page,
        page_size=commons.page_size,
        status=status,
        risk_level=risk_level,
        start_time=start_time,
        end_time=end_time,
        assigned_to=assigned_to,
        case_no=case_no,
    )
    total_pages = (total + commons.page_size - 1) // commons.page_size

    items = []
    for case in cases:
        history = await get_user_history_transactions(db, case.transaction.card_hash, days=7)
        related = await get_related_cases(db, case.transaction.card_hash, case.id)
        fraud_count = await count_fraud_history(db, case.transaction.card_hash, case.id)
        items.append(build_case_response(case, history, related, fraud_count))

    return CaseListResponse(
        items=items,
        total=total,
        page=commons.page,
        page_size=commons.page_size,
        total_pages=total_pages,
    )


@router.get("/stats", response_model=CaseStatsResponse)
async def get_cases_stats(
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    return await get_case_stats(db)


@router.get("/analysts", response_model=list[AnalystInfo])
async def get_analysts(
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    return await get_analysts_with_stats(db, redis_client)


@router.get("/{case_id}", response_model=CaseResponse)
async def get_case_detail(
    case_id: int,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    case = await get_case_by_id(db, case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="案件不存在")
    history = await get_user_history_transactions(db, case.transaction.card_hash, days=7)
    related = await get_related_cases(db, case.transaction.card_hash, case.id)
    fraud_count = await count_fraud_history(db, case.transaction.card_hash, case.id)
    return build_case_response(case, history, related, fraud_count)


@router.post("/{case_id}/auto-assign", response_model=CaseResponse)
async def auto_assign_case_api(
    case_id: int,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    case = await auto_assign_case(db, redis_client, case_id)
    if case is None:
        raise HTTPException(
            status_code=409,
            detail="案件自动分配失败，可能已被分配或状态已变更",
        )
    await ws_manager.send_case_assigned(case.id, case.case_no, case.assigned_to_name or "")
    history = await get_user_history_transactions(db, case.transaction.card_hash, days=7)
    related = await get_related_cases(db, case.transaction.card_hash, case.id)
    fraud_count = await count_fraud_history(db, case.transaction.card_hash, case.id)
    return build_case_response(case, history, related, fraud_count)


@router.post("/{case_id}/assign", response_model=CaseResponse)
async def assign_case_to_user(
    case_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    user_id, user_name = _get_current_user(request)
    case = await assign_case(db, redis_client, case_id, user_id, user_name)
    if case is None:
        raise HTTPException(
            status_code=409,
            detail="案件认领失败，可能已被其他分析师认领或状态已变更",
        )
    history = await get_user_history_transactions(db, case.transaction.card_hash, days=7)
    related = await get_related_cases(db, case.transaction.card_hash, case.id)
    fraud_count = await count_fraud_history(db, case.transaction.card_hash, case.id)
    return build_case_response(case, history, related, fraud_count)


@router.post("/{case_id}/transfer", response_model=CaseResponse)
async def transfer_case_api(
    case_id: int,
    payload: CaseTransferRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    if len(payload.reason.strip()) < 10:
        raise HTTPException(status_code=400, detail="转派原因不少于10字")
    if not payload.target_user_id.strip() or not payload.target_user_name.strip():
        raise HTTPException(status_code=400, detail="请选择目标分析师")

    user_id, _ = _get_current_user(request)
    case = await transfer_case(db, case_id, user_id, payload)
    if case is None:
        raise HTTPException(
            status_code=400,
            detail="案件转派失败，仅调查中且为认领人本人可操作",
        )
    history = await get_user_history_transactions(db, case.transaction.card_hash, days=7)
    related = await get_related_cases(db, case.transaction.card_hash, case.id)
    fraud_count = await count_fraud_history(db, case.transaction.card_hash, case.id)
    return build_case_response(case, history, related, fraud_count)


@router.post("/{case_id}/close", response_model=CaseResponse)
async def close_case_api(
    case_id: int,
    payload: CaseCloseRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    if len(payload.conclusion_note.strip()) < 20:
        raise HTTPException(status_code=400, detail="调查结论不少于20字")

    user_id, _ = _get_current_user(request)
    case = await close_case(db, case_id, user_id, payload)
    if case is None:
        raise HTTPException(
            status_code=400,
            detail="案件结案失败，仅调查中且为认领人本人可操作",
        )
    history = await get_user_history_transactions(db, case.transaction.card_hash, days=7)
    related = await get_related_cases(db, case.transaction.card_hash, case.id)
    fraud_count = await count_fraud_history(db, case.transaction.card_hash, case.id)
    return build_case_response(case, history, related, fraud_count)


@router.post("/{case_id}/notes", response_model=CaseResponse)
async def add_note_to_case(
    case_id: int,
    payload: CaseNoteCreate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    user_id, user_name = _get_current_user(request)
    case = await add_case_note(db, case_id, user_name, user_id, payload)
    if case is None:
        raise HTTPException(
            status_code=400,
            detail="添加备注失败，案件不存在或已结案",
        )
    history = await get_user_history_transactions(db, case.transaction.card_hash, days=7)
    related = await get_related_cases(db, case.transaction.card_hash, case.id)
    fraud_count = await count_fraud_history(db, case.transaction.card_hash, case.id)
    return build_case_response(case, history, related, fraud_count)


@router.post("/check-overtime", response_model=list[CaseResponse])
async def run_overtime_check(
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    overtime_cases = await check_and_mark_overtime(db)
    result = []
    for case in overtime_cases:
        await ws_manager.send_case_overtime(case.id, case.case_no)
        history = await get_user_history_transactions(db, case.transaction.card_hash, days=7)
        related = await get_related_cases(db, case.transaction.card_hash, case.id)
        fraud_count = await count_fraud_history(db, case.transaction.card_hash, case.id)
        result.append(build_case_response(case, history, related, fraud_count))
    return result
