import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

import redis.asyncio as redis

from app.api.deps import CommonQueryParams, get_client_ip, get_db_session, get_redis_client
from app.models import AuditLog, Rule, RuleType, RuleVersion, RuleVersionStatus
from app.schemas import (
    AuditLogListResponse,
    AuditLogResponse,
    RuleCreate,
    RuleListResponse,
    RuleResponse,
    RuleVersionResponse,
    TemplateRuleDiff,
    TemplateDiffItem,
)
from app.services import (
    approve_rule,
    compare_versions,
    create_rule,
    disable_rule,
    modify_active_rule,
    reject_rule,
    submit_for_review,
)

router = APIRouter(prefix="/rules", tags=["rules"])


@router.get("", response_model=RuleListResponse)
async def list_rules(
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
    commons: CommonQueryParams = Depends(),
    rule_type: Optional[RuleType] = Query(None, description="规则类型筛选"),
    status: Optional[RuleVersionStatus] = Query(None, description="最新版本状态筛选"),
    keyword: Optional[str] = Query(None, description="名称/描述关键词搜索"),
):
    conditions = []
    if rule_type is not None:
        conditions.append(Rule.rule_type == rule_type)
    if keyword:
        like_pattern = f"%{keyword}%"
        conditions.append(or_(Rule.name.ilike(like_pattern), Rule.description.ilike(like_pattern)))

    count_stmt = select(func.count(Rule.id))
    if conditions:
        count_stmt = count_stmt.where(and_(*conditions))
    total_result = await db.execute(count_stmt)
    total: int = int(total_result.scalar_one())

    stmt = select(Rule)
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(Rule.created_at.desc()).offset(commons.offset).limit(commons.page_size)

    result = await db.execute(stmt)
    rules = list(result.scalars().all())

    if status is not None:
        filtered_rules = []
        for rule in rules:
            if rule.versions:
                latest = max(rule.versions, key=lambda v: v.version_num)
                if latest.status == status:
                    filtered_rules.append(rule)
        rules = filtered_rules
        total = len(rules)

    items = [RuleResponse.model_validate(r) for r in rules]
    return RuleListResponse(
        items=items,
        total=total,
        page=commons.page,
        page_size=commons.page_size,
    )


@router.post("", response_model=RuleResponse)
async def create_new_rule(
    data: RuleCreate,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
    x_operator: Optional[str] = Header(None, alias="X-Operator"),
    client_ip: str = Depends(get_client_ip),
):
    operator = x_operator or "system"
    payload = data.model_dump()
    payload["created_by"] = operator
    payload["ip_address"] = client_ip

    if data.template_id:
        payload["template_id"] = data.template_id

    created = await create_rule(db, payload)
    rule_id = created["rule_id"]

    stmt = select(Rule).where(Rule.id == rule_id)
    result = await db.execute(stmt)
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="规则创建失败")

    return RuleResponse.model_validate(rule)


@router.get("/{rule_id}", response_model=RuleResponse)
async def get_rule_detail(
    rule_id: int,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    stmt = select(Rule).where(Rule.id == rule_id)
    result = await db.execute(stmt)
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="规则不存在")
    return RuleResponse.model_validate(rule)


@router.put("/{rule_id}", response_model=RuleResponse)
async def modify_rule(
    rule_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
    x_operator: Optional[str] = Header(None, alias="X-Operator"),
    client_ip: str = Depends(get_client_ip),
):
    operator = x_operator or "system"

    try:
        await modify_active_rule(db, rule_id, operator, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    stmt = select(Rule).where(Rule.id == rule_id)
    result = await db.execute(stmt)
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="规则不存在")
    return RuleResponse.model_validate(rule)


@router.post("/{rule_id}/submit", response_model=dict)
async def submit_rule_for_review(
    rule_id: int,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
    x_operator: Optional[str] = Header(None, alias="X-Operator"),
    client_ip: str = Depends(get_client_ip),
):
    operator = x_operator or "system"
    try:
        result = await submit_for_review(db, rule_id, operator)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.post("/{rule_id}/approve/{version_id}", response_model=dict)
async def approve_rule_version(
    rule_id: int,
    version_id: int,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
    x_operator: Optional[str] = Header(None, alias="X-Operator"),
    client_ip: str = Depends(get_client_ip),
):
    operator = x_operator or "system"
    try:
        result = await approve_rule(db, rule_id, operator, version_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.post("/{rule_id}/reject/{version_id}", response_model=dict)
async def reject_rule_version(
    rule_id: int,
    version_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
    x_operator: Optional[str] = Header(None, alias="X-Operator"),
    client_ip: str = Depends(get_client_ip),
):
    operator = x_operator or "system"
    reason = body.get("reason", "") or ""
    try:
        result = await reject_rule(db, rule_id, operator, version_id, reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.post("/{rule_id}/disable/{version_id}", response_model=dict)
async def disable_rule_version(
    rule_id: int,
    version_id: int,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
    x_operator: Optional[str] = Header(None, alias="X-Operator"),
    client_ip: str = Depends(get_client_ip),
):
    operator = x_operator or "system"
    try:
        result = await disable_rule(db, rule_id, operator, version_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.get("/{rule_id}/versions", response_model=list[RuleVersionResponse])
async def list_rule_versions(
    rule_id: int,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    stmt = select(RuleVersion).where(RuleVersion.rule_id == rule_id).order_by(RuleVersion.version_num.desc())
    result = await db.execute(stmt)
    versions = list(result.scalars().all())
    return [RuleVersionResponse.model_validate(v) for v in versions]


@router.get("/versions/compare", response_model=dict)
async def compare_rule_versions(
    v1: int = Query(..., description="版本ID 1"),
    v2: int = Query(..., description="版本ID 2"),
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    try:
        result = await compare_versions(db, v1, v2)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.get("/audit-logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
    commons: CommonQueryParams = Depends(),
    rule_id: Optional[int] = Query(None, description="按规则ID筛选"),
    operator: Optional[str] = Query(None, description="按操作人筛选"),
    action: Optional[str] = Query(None, description="按操作类型筛选"),
):
    conditions = []
    if rule_id is not None:
        conditions.append(AuditLog.rule_id == rule_id)
    if operator:
        conditions.append(AuditLog.operator == operator)
    if action:
        conditions.append(AuditLog.action == action)

    count_stmt = select(func.count(AuditLog.id))
    if conditions:
        count_stmt = count_stmt.where(and_(*conditions))
    total_result = await db.execute(count_stmt)
    total: int = int(total_result.scalar_one())

    stmt = select(AuditLog)
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(AuditLog.created_at.desc()).offset(commons.offset).limit(commons.page_size)

    result = await db.execute(stmt)
    logs = list(result.scalars().all())
    items = [AuditLogResponse.model_validate(l) for l in logs]

    return AuditLogListResponse(
        items=items,
        total=total,
        page=commons.page,
        page_size=commons.page_size,
    )


def _json_diff(obj1: Any, obj2: Any, path: str = "") -> list[TemplateDiffItem]:
    diffs: list[TemplateDiffItem] = []
    if isinstance(obj1, dict) and isinstance(obj2, dict):
        all_keys = set(obj1.keys()) | set(obj2.keys())
        for key in sorted(all_keys):
            sub_path = f"{path}.{key}" if path else key
            if key not in obj1:
                diffs.append(TemplateDiffItem(
                    field=sub_path,
                    template_value=None,
                    rule_value=obj2[key],
                ))
            elif key not in obj2:
                diffs.append(TemplateDiffItem(
                    field=sub_path,
                    template_value=obj1[key],
                    rule_value=None,
                ))
            else:
                sub_diffs = _json_diff(obj1[key], obj2[key], sub_path)
                diffs.extend(sub_diffs)
    elif isinstance(obj1, list) and isinstance(obj2, list):
        if obj1 != obj2:
            diffs.append(TemplateDiffItem(
                field=path,
                template_value=obj1,
                rule_value=obj2,
            ))
    else:
        if obj1 != obj2:
            diffs.append(TemplateDiffItem(
                field=path,
                template_value=obj1,
                rule_value=obj2,
            ))
    return diffs


@router.get("/versions/{version_id}/template-diff", response_model=TemplateRuleDiff)
async def get_rule_template_diff(
    version_id: int,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    stmt = select(RuleVersion).where(RuleVersion.id == version_id)
    result = await db.execute(stmt)
    version = result.scalar_one_or_none()
    if version is None:
        raise HTTPException(status_code=404, detail="规则版本不存在")

    if version.source_template_id is None:
        raise HTTPException(status_code=400, detail="该版本不是基于模板创建的")

    template_snapshot = version.template_snapshot
    if template_snapshot is None:
        raise HTTPException(status_code=400, detail="模板快照数据丢失")

    if isinstance(template_snapshot, str):
        template_snapshot = json.loads(template_snapshot)

    version_config_raw = version.config
    if isinstance(version_config_raw, str):
        version_config = json.loads(version_config_raw)
    else:
        version_config = version_config_raw or {}

    template_defaults = {
        "config": template_snapshot.get("config", {}),
        "weight": template_snapshot.get("default_weight"),
        "priority": template_snapshot.get("default_priority"),
        "is_immediate_block": template_snapshot.get("default_is_immediate_block"),
        "logic_expression": template_snapshot.get("default_logic_expression", {}),
    }

    rule_values = {
        "config": version_config,
        "weight": version.weight,
        "priority": version.priority,
        "is_immediate_block": version.is_immediate_block,
        "logic_expression": version.logic_expression or {},
    }

    diffs = _json_diff(template_defaults, rule_values)

    return TemplateRuleDiff(
        template_id=version.source_template_id,
        template_name=version.source_template_name or "",
        diffs=diffs,
    )
