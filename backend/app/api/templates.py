from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

import redis.asyncio as redis

from app.api.deps import CommonQueryParams, get_client_ip, get_db_session, get_redis_client
from app.models import RuleTemplate, TemplateCategory
from app.schemas import (
    RuleTemplateCreate,
    RuleTemplateListResponse,
    RuleTemplateResponse,
    RuleTemplateUpdate,
)

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=RuleTemplateListResponse)
async def list_templates(
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
    commons: CommonQueryParams = Depends(),
    category: Optional[TemplateCategory] = Query(None, description="分类筛选"),
    is_active: Optional[bool] = Query(None, description="是否启用"),
    keyword: Optional[str] = Query(None, description="名称/描述关键词搜索"),
    tag: Optional[str] = Query(None, description="标签筛选"),
    sort_by: str = Query("use_count", description="排序字段: use_count/created_at/name"),
    sort_order: str = Query("desc", description="排序方向: asc/desc"),
):
    conditions = []
    if category is not None:
        conditions.append(RuleTemplate.category == category)
    if is_active is not None:
        conditions.append(RuleTemplate.is_active == is_active)
    if keyword:
        like_pattern = f"%{keyword}%"
        conditions.append(
            or_(
                RuleTemplate.name.ilike(like_pattern),
                RuleTemplate.description.ilike(like_pattern),
            )
        )
    if tag:
        conditions.append(func.json_contains(RuleTemplate.tags, func.json_array(tag)))

    count_stmt = select(func.count(RuleTemplate.id))
    if conditions:
        count_stmt = count_stmt.where(and_(*conditions))
    total_result = await db.execute(count_stmt)
    total: int = int(total_result.scalar_one())

    stmt = select(RuleTemplate)
    if conditions:
        stmt = stmt.where(and_(*conditions))

    order_col = {
        "use_count": RuleTemplate.use_count,
        "created_at": RuleTemplate.created_at,
        "name": RuleTemplate.name,
    }.get(sort_by, RuleTemplate.use_count)

    if sort_order.lower() == "asc":
        stmt = stmt.order_by(order_col.asc())
    else:
        stmt = stmt.order_by(order_col.desc())

    stmt = stmt.offset(commons.offset).limit(commons.page_size)

    result = await db.execute(stmt)
    templates = list(result.scalars().all())

    items = [RuleTemplateResponse.model_validate(t) for t in templates]
    return RuleTemplateListResponse(
        items=items,
        total=total,
        page=commons.page,
        page_size=commons.page_size,
    )


@router.post("", response_model=RuleTemplateResponse)
async def create_template(
    data: RuleTemplateCreate,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
    x_operator: Optional[str] = Header(None, alias="X-Operator"),
):
    operator = x_operator or "system"
    payload = data.model_dump()
    payload["created_by"] = operator

    template = RuleTemplate(**payload)
    db.add(template)
    await db.commit()
    await db.refresh(template)

    return RuleTemplateResponse.model_validate(template)


@router.get("/{template_id}", response_model=RuleTemplateResponse)
async def get_template_detail(
    template_id: int,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    stmt = select(RuleTemplate).where(RuleTemplate.id == template_id)
    result = await db.execute(stmt)
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=404, detail="模板不存在")
    return RuleTemplateResponse.model_validate(template)


@router.put("/{template_id}", response_model=RuleTemplateResponse)
async def update_template(
    template_id: int,
    data: RuleTemplateUpdate,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    stmt = select(RuleTemplate).where(RuleTemplate.id == template_id)
    result = await db.execute(stmt)
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=404, detail="模板不存在")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(template, key, value)

    await db.commit()
    await db.refresh(template)
    return RuleTemplateResponse.model_validate(template)


@router.delete("/{template_id}", response_model=dict)
async def delete_template(
    template_id: int,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    stmt = select(RuleTemplate).where(RuleTemplate.id == template_id)
    result = await db.execute(stmt)
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=404, detail="模板不存在")

    if template.is_builtin:
        raise HTTPException(status_code=400, detail="内置模板不可删除，可停用")

    await db.delete(template)
    await db.commit()
    return {"success": True, "message": "模板删除成功"}


@router.post("/{template_id}/toggle", response_model=RuleTemplateResponse)
async def toggle_template_status(
    template_id: int,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    stmt = select(RuleTemplate).where(RuleTemplate.id == template_id)
    result = await db.execute(stmt)
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=404, detail="模板不存在")

    template.is_active = not template.is_active
    await db.commit()
    await db.refresh(template)
    return RuleTemplateResponse.model_validate(template)


@router.get("/stats/usage-distribution", response_model=list[dict])
async def get_template_usage_distribution(
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.Redis = Depends(get_redis_client),
):
    stmt = select(RuleTemplate).where(RuleTemplate.use_count > 0).order_by(RuleTemplate.use_count.desc())
    result = await db.execute(stmt)
    templates = list(result.scalars().all())

    total_use = sum(t.use_count for t in templates)

    distribution = []
    for t in templates:
        percentage = round((t.use_count / total_use) * 100, 2) if total_use > 0 else 0.0
        distribution.append({
            "template_id": t.id,
            "template_name": t.name,
            "use_count": t.use_count,
            "percentage": percentage,
        })

    return distribution
