import json
from datetime import datetime
from typing import Any, Dict, Optional


def _json_diff(obj1: Any, obj2: Any, path: str = "") -> Dict[str, Any]:
    diff: Dict[str, Any] = {}
    if isinstance(obj1, dict) and isinstance(obj2, dict):
        all_keys = set(obj1.keys()) | set(obj2.keys())
        for key in sorted(all_keys):
            sub_path = f"{path}.{key}" if path else key
            if key not in obj1:
                diff[sub_path] = {"action": "added", "new_value": obj2[key]}
            elif key not in obj2:
                diff[sub_path] = {"action": "removed", "old_value": obj1[key]}
            else:
                sub_diff = _json_diff(obj1[key], obj2[key], sub_path)
                if sub_diff:
                    diff.update(sub_diff)
    elif isinstance(obj1, list) and isinstance(obj2, list):
        if len(obj1) != len(obj2) or obj1 != obj2:
            diff[path] = {"action": "modified", "old_value": obj1, "new_value": obj2}
    else:
        if obj1 != obj2:
            diff[path] = {"action": "modified", "old_value": obj1, "new_value": obj2}
    return diff


async def _insert_audit_log(
    db: Any,
    rule_id: Optional[int],
    rule_version_id: Optional[int],
    operator: str,
    action: str,
    old_status: Optional[str],
    new_status: Optional[str],
    detail: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
) -> None:
    from sqlalchemy import text

    await db.execute(
        text(
            "INSERT INTO audit_logs (rule_id, rule_version_id, operator, action, "
            "old_status, new_status, detail, created_at, ip_address) "
            "VALUES (:rule_id, :rule_version_id, :operator, :action, "
            ":old_status, :new_status, :detail, :created_at, :ip_address)"
        ),
        {
            "rule_id": rule_id,
            "rule_version_id": rule_version_id,
            "operator": operator,
            "action": action,
            "old_status": old_status,
            "new_status": new_status,
            "detail": json.dumps(detail or {}),
            "created_at": datetime.utcnow(),
            "ip_address": ip_address,
        },
    )


def _status_str(value: Any) -> str:
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)


async def create_rule(db: Any, rule_data: Dict[str, Any]) -> Dict[str, Any]:
    from sqlalchemy import text

    name: str = str(rule_data.get("name", ""))
    description: Optional[str] = rule_data.get("description")
    rule_type: str = str(rule_data.get("rule_type", "threshold"))
    created_by: str = str(rule_data.get("created_by", "system"))

    initial_version_data: Dict[str, Any] = rule_data.get("initial_version", {}) or {}
    version_num: int = int(initial_version_data.get("version_num", 1))
    config: Dict[str, Any] = initial_version_data.get("config", {}) or {}
    weight: int = int(initial_version_data.get("weight", 5))
    priority: int = int(initial_version_data.get("priority", 100))
    initial_status: str = "draft"
    logic_expression: Dict[str, Any] = initial_version_data.get("logic_expression", {}) or {}
    is_immediate_block: bool = bool(initial_version_data.get("is_immediate_block", False))

    now: datetime = datetime.utcnow()

    rule_result = await db.execute(
        text(
            "INSERT INTO rules (name, description, rule_type, created_at) "
            "VALUES (:name, :description, :rule_type, :created_at) RETURNING id"
        ),
        {
            "name": name,
            "description": description,
            "rule_type": rule_type,
            "created_at": now,
        },
    )
    rule_id: int = int(rule_result.fetchone()[0])

    version_result = await db.execute(
        text(
            "INSERT INTO rule_versions (rule_id, version_num, config, weight, priority, status, "
            "logic_expression, is_immediate_block, created_by, created_at) "
            "VALUES (:rule_id, :version_num, :config, :weight, :priority, :status, "
            ":logic_expression, :is_immediate_block, :created_by, :created_at) RETURNING id"
        ),
        {
            "rule_id": rule_id,
            "version_num": version_num,
            "config": json.dumps(config),
            "weight": weight,
            "priority": priority,
            "status": initial_status,
            "logic_expression": json.dumps(logic_expression),
            "is_immediate_block": is_immediate_block,
            "created_by": created_by,
            "created_at": now,
        },
    )
    rule_version_id: int = int(version_result.fetchone()[0])

    await db.commit()

    await _insert_audit_log(
        db,
        rule_id=rule_id,
        rule_version_id=rule_version_id,
        operator=created_by,
        action="create",
        old_status=None,
        new_status=initial_status,
        detail={"message": "规则创建", "rule_name": name},
    )
    await db.commit()

    return {
        "rule_id": rule_id,
        "rule_version_id": rule_version_id,
        "version_num": version_num,
        "status": initial_status,
    }


async def submit_for_review(db: Any, rule_id: int, operator: str) -> Dict[str, Any]:
    from sqlalchemy import text

    row = await db.execute(
        text(
            "SELECT rv.id, rv.status FROM rule_versions rv "
            "WHERE rv.rule_id = :rid ORDER BY rv.version_num DESC LIMIT 1"
        ),
        {"rid": rule_id},
    )
    result = row.fetchone()
    if not result:
        raise ValueError(f"规则 {rule_id} 不存在或无版本")

    version_id: int = int(result[0])
    current_status: str = _status_str(result[1])
    if current_status != "draft":
        raise ValueError(f"只有草稿状态的版本才能提交审核, 当前状态: {current_status}")

    target_status: str = "reviewing"
    now: datetime = datetime.utcnow()
    await db.execute(
        text(
            "UPDATE rule_versions SET status = :ts, reviewed_by = :op, reviewed_at = :uat "
            "WHERE id = :vid"
        ),
        {"ts": target_status, "op": operator, "uat": now, "vid": version_id},
    )
    await db.commit()

    await _insert_audit_log(
        db,
        rule_id=rule_id,
        rule_version_id=version_id,
        operator=operator,
        action="submit_review",
        old_status=current_status,
        new_status=target_status,
        detail={"message": "提交审核"},
    )
    await db.commit()

    return {
        "rule_id": rule_id,
        "rule_version_id": version_id,
        "from_status": current_status,
        "to_status": target_status,
    }


async def approve_rule(
    db: Any, rule_id: int, operator: str, rule_version_id: int
) -> Dict[str, Any]:
    from sqlalchemy import text

    row = await db.execute(
        text(
            "SELECT rv.status, rv.version_num FROM rule_versions rv WHERE rv.id = :vid AND rv.rule_id = :rid"
        ),
        {"vid": rule_version_id, "rid": rule_id},
    )
    result = row.fetchone()
    if not result:
        raise ValueError(f"规则版本不存在: rule_id={rule_id}, version_id={rule_version_id}")

    current_status: str = _status_str(result[0])
    version_num: int = int(result[1])
    if current_status != "reviewing":
        raise ValueError(f"只有审核中的版本才能通过审核, 当前状态: {current_status}")

    target_status: str = "active"
    now: datetime = datetime.utcnow()

    await db.execute(
        text(
            "UPDATE rule_versions SET status = 'disabled' "
            "WHERE rule_id = :rid AND status = 'active' AND id != :vid"
        ),
        {"rid": rule_id, "vid": rule_version_id},
    )
    await db.execute(
        text(
            "UPDATE rule_versions SET status = :ts, reviewed_by = :op, reviewed_at = :rat, activated_at = :aat "
            "WHERE id = :vid"
        ),
        {
            "ts": target_status,
            "op": operator,
            "rat": now,
            "aat": now,
            "vid": rule_version_id,
        },
    )
    await db.commit()

    await _insert_audit_log(
        db,
        rule_id=rule_id,
        rule_version_id=rule_version_id,
        operator=operator,
        action="approve",
        old_status=current_status,
        new_status=target_status,
        detail={"message": "审核通过并激活", "version_num": version_num},
    )
    await db.commit()

    return {
        "rule_id": rule_id,
        "rule_version_id": rule_version_id,
        "version_num": version_num,
        "from_status": current_status,
        "to_status": target_status,
    }


async def reject_rule(
    db: Any, rule_id: int, operator: str, rule_version_id: int, reason: str
) -> Dict[str, Any]:
    from sqlalchemy import text

    row = await db.execute(
        text(
            "SELECT rv.status, rv.version_num FROM rule_versions rv WHERE rv.id = :vid AND rv.rule_id = :rid"
        ),
        {"vid": rule_version_id, "rid": rule_id},
    )
    result = row.fetchone()
    if not result:
        raise ValueError(f"规则版本不存在: rule_id={rule_id}, version_id={rule_version_id}")

    current_status: str = _status_str(result[0])
    version_num: int = int(result[1])
    if current_status != "reviewing":
        raise ValueError(f"只有审核中的版本才能驳回, 当前状态: {current_status}")

    target_status: str = "draft"
    now: datetime = datetime.utcnow()
    await db.execute(
        text(
            "UPDATE rule_versions SET status = :ts, reviewed_by = :op, reviewed_at = :uat "
            "WHERE id = :vid"
        ),
        {"ts": target_status, "op": operator, "uat": now, "vid": rule_version_id},
    )
    await db.commit()

    await _insert_audit_log(
        db,
        rule_id=rule_id,
        rule_version_id=rule_version_id,
        operator=operator,
        action="reject",
        old_status=current_status,
        new_status=target_status,
        detail={"message": "审核驳回", "reason": reason, "version_num": version_num},
    )
    await db.commit()

    return {
        "rule_id": rule_id,
        "rule_version_id": rule_version_id,
        "version_num": version_num,
        "from_status": current_status,
        "to_status": target_status,
        "reason": reason,
    }


async def disable_rule(
    db: Any, rule_id: int, operator: str, rule_version_id: int
) -> Dict[str, Any]:
    from sqlalchemy import text

    row = await db.execute(
        text(
            "SELECT rv.status, rv.version_num FROM rule_versions rv WHERE rv.id = :vid AND rv.rule_id = :rid"
        ),
        {"vid": rule_version_id, "rid": rule_id},
    )
    result = row.fetchone()
    if not result:
        raise ValueError(f"规则版本不存在: rule_id={rule_id}, version_id={rule_version_id}")

    current_status: str = _status_str(result[0])
    version_num: int = int(result[1])
    if current_status not in ("active", "reviewing"):
        raise ValueError(f"只有激活或审核中的版本才能停用, 当前状态: {current_status}")

    target_status: str = "disabled"
    now: datetime = datetime.utcnow()
    await db.execute(
        text("UPDATE rule_versions SET status = :ts WHERE id = :vid"),
        {"ts": target_status, "vid": rule_version_id},
    )
    await db.commit()

    await _insert_audit_log(
        db,
        rule_id=rule_id,
        rule_version_id=rule_version_id,
        operator=operator,
        action="disable",
        old_status=current_status,
        new_status=target_status,
        detail={"message": "版本停用", "version_num": version_num, "reviewed_by": operator, "reviewed_at": now.isoformat()},
    )
    await db.commit()

    return {
        "rule_id": rule_id,
        "rule_version_id": rule_version_id,
        "version_num": version_num,
        "from_status": current_status,
        "to_status": target_status,
    }


async def modify_active_rule(
    db: Any, rule_id: int, operator: str, new_config: Dict[str, Any]
) -> Dict[str, Any]:
    from sqlalchemy import text

    row = await db.execute(
        text(
            "SELECT rv.id, rv.version_num, rv.config, rv.weight, rv.priority, rv.status, "
            "rv.logic_expression, rv.is_immediate_block "
            "FROM rule_versions rv WHERE rv.rule_id = :rid ORDER BY rv.version_num DESC LIMIT 1"
        ),
        {"rid": rule_id},
    )
    result = row.fetchone()
    if not result:
        raise ValueError(f"规则 {rule_id} 不存在或无版本")

    old_version_id: int = int(result[0])
    old_version_num: int = int(result[1])
    old_status: str = _status_str(result[5])

    if old_status not in ("active", "disabled"):
        raise ValueError(f"只有已启用或已停用的版本才能修改生成新版本, 当前状态: {old_status}")

    new_version_num: int = old_version_num + 1
    now: datetime = datetime.utcnow()

    old_config_raw = result[2]
    old_config: Dict[str, Any] = (
        old_config_raw if isinstance(old_config_raw, dict)
        else (json.loads(old_config_raw) if isinstance(old_config_raw, str) else {})
    )
    old_weight: int = int(result[3])
    old_priority: int = int(result[4])
    old_logic_raw = result[6]
    old_logic_expression: Dict[str, Any] = (
        old_logic_raw if isinstance(old_logic_raw, dict)
        else (json.loads(old_logic_raw) if isinstance(old_logic_raw, str) else {})
    )
    old_is_immediate_block: bool = bool(result[7])

    final_config: Dict[str, Any] = new_config.get("config", old_config) or old_config
    final_weight: int = int(new_config.get("weight", old_weight))
    final_priority: int = int(new_config.get("priority", old_priority))
    final_logic_expression: Dict[str, Any] = new_config.get("logic_expression", old_logic_expression) or old_logic_expression
    final_is_immediate_block: bool = bool(new_config.get("is_immediate_block", old_is_immediate_block))

    rule_name_update: Optional[str] = new_config.get("name")
    rule_description_update: Optional[str] = new_config.get("description")
    if rule_name_update is not None or rule_description_update is not None:
        updates = []
        params: Dict[str, Any] = {"rid": rule_id}
        if rule_name_update is not None:
            updates.append("name = :nm")
            params["nm"] = rule_name_update
        if rule_description_update is not None:
            updates.append("description = :ds")
            params["ds"] = rule_description_update
        if updates:
            await db.execute(text(f"UPDATE rules SET {', '.join(updates)} WHERE id = :rid"), params)

    new_version_result = await db.execute(
        text(
            "INSERT INTO rule_versions (rule_id, version_num, config, weight, priority, status, "
            "logic_expression, is_immediate_block, created_by, created_at) "
            "VALUES (:rule_id, :version_num, :config, :weight, :priority, :status, "
            ":logic_expression, :is_immediate_block, :created_by, :created_at) RETURNING id"
        ),
        {
            "rule_id": rule_id,
            "version_num": new_version_num,
            "config": json.dumps(final_config),
            "weight": final_weight,
            "priority": final_priority,
            "status": "draft",
            "logic_expression": json.dumps(final_logic_expression),
            "is_immediate_block": final_is_immediate_block,
            "created_by": operator,
            "created_at": now,
        },
    )
    new_version_id: int = int(new_version_result.fetchone()[0])
    await db.commit()

    await _insert_audit_log(
        db,
        rule_id=rule_id,
        rule_version_id=new_version_id,
        operator=operator,
        action="modify_new_version",
        old_status=old_status,
        new_status="draft",
        detail={
            "message": "修改规则生成新版本",
            "old_version_id": old_version_id,
            "old_version_num": old_version_num,
            "new_version_num": new_version_num,
            "old_version_still_active": old_status == "active",
        },
    )
    await db.commit()

    return {
        "rule_id": rule_id,
        "new_version_id": new_version_id,
        "new_version_num": new_version_num,
        "old_version_id": old_version_id,
        "old_version_num": old_version_num,
        "new_status": "draft",
        "old_version_still_active": old_status == "active",
    }


async def compare_versions(
    db: Any, version_id_1: int, version_id_2: int
) -> Dict[str, Any]:
    from sqlalchemy import text

    async def _load_version(vid: int) -> Optional[Dict[str, Any]]:
        row = None
        try:
            row_result = await db.execute(
                text(
                    "SELECT id, rule_id, version_num, config, weight, priority, status, "
                    "logic_expression, is_immediate_block, created_at, created_by "
                    "FROM rule_versions WHERE id = :vid"
                ),
                {"vid": vid},
            )
            row = row_result.fetchone()
        except Exception:
            return None
        if not row:
            return None
        cfg_raw = row[3]
        cfg: Dict[str, Any] = (
            cfg_raw if isinstance(cfg_raw, dict)
            else (json.loads(cfg_raw) if isinstance(cfg_raw, str) else {})
        )
        logic_raw = row[7]
        logic: Dict[str, Any] = (
            logic_raw if isinstance(logic_raw, dict)
            else (json.loads(logic_raw) if isinstance(logic_raw, str) else {})
        )
        return {
            "id": int(row[0]),
            "rule_id": int(row[1]),
            "version_num": int(row[2]),
            "config": cfg,
            "weight": int(row[4]),
            "priority": int(row[5]),
            "status": _status_str(row[6]),
            "logic_expression": logic,
            "is_immediate_block": bool(row[8]),
            "created_at": row[9].isoformat() if row[9] else None,
            "created_by": str(row[10]) if row[10] else None,
        }

    v1 = await _load_version(version_id_1)
    if not v1:
        raise ValueError(f"版本不存在: {version_id_1}")
    v2 = await _load_version(version_id_2)
    if not v2:
        raise ValueError(f"版本不存在: {version_id_2}")

    if v1["rule_id"] != v2["rule_id"]:
        raise ValueError("只能比较同一规则的不同版本")

    full_v1 = {
        "config": v1["config"],
        "weight": v1["weight"],
        "priority": v1["priority"],
        "logic_expression": v1["logic_expression"],
        "is_immediate_block": v1["is_immediate_block"],
    }
    full_v2 = {
        "config": v2["config"],
        "weight": v2["weight"],
        "priority": v2["priority"],
        "logic_expression": v2["logic_expression"],
        "is_immediate_block": v2["is_immediate_block"],
    }
    diff: Dict[str, Any] = _json_diff(full_v1, full_v2)

    return {
        "version_1": v1,
        "version_2": v2,
        "diff": diff,
        "has_changes": len(diff) > 0,
    }
