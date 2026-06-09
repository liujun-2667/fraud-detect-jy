import json
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.config import settings
from ..utils.geo import haversine_distance


def _get_txn_amount(transaction: Dict[str, Any]) -> float:
    raw_amount: Any = transaction.get("amount", 0)
    try:
        from decimal import Decimal
        if isinstance(raw_amount, Decimal):
            return float(raw_amount)
        return float(raw_amount)
    except (ValueError, TypeError):
        return 0.0


async def check_threshold_rules(
    transaction: Dict[str, Any],
    rule_config: Dict[str, Any],
    redis: Any,
) -> Tuple[bool, Dict[str, Any]]:
    rule_type: str = str(rule_config.get("rule_type", ""))
    details: Dict[str, Any] = {}
    hit = False

    if rule_type == "single_amount":
        threshold: float = float(rule_config.get("threshold", 0))
        txn_amount: float = _get_txn_amount(transaction)
        hit = txn_amount > threshold
        details = {"transaction_amount": txn_amount, "threshold": threshold}

    elif rule_type == "daily_total":
        card_hash: str = str(transaction.get("card_hash", ""))
        amount_threshold: float = float(rule_config.get("amount_threshold", 0))
        txn_amount: float = _get_txn_amount(transaction)
        today_key: str = f"daily:{card_hash}:{datetime.now().strftime('%Y%m%d')}"
        total: float = float(await redis.incrbyfloat(today_key, txn_amount))
        await redis.expire(today_key, int(timedelta(days=2).total_seconds()))
        hit = total > amount_threshold
        details = {"daily_total": total, "amount_threshold": amount_threshold}

    elif rule_type == "card_frequency":
        card_hash: str = str(transaction.get("card_hash", ""))
        count_threshold: int = int(rule_config.get("count_threshold", 0))
        time_window_minutes: int = int(rule_config.get("time_window_minutes", 0))
        window_key: str = f"freq:{card_hash}:{int(datetime.now().timestamp() // (time_window_minutes * 60))}"
        count: int = int(await redis.incr(window_key))
        await redis.expire(window_key, int(timedelta(minutes=time_window_minutes * 2).total_seconds()))
        hit = count > count_threshold
        details = {
            "transaction_count": count,
            "count_threshold": count_threshold,
            "time_window_minutes": time_window_minutes,
        }

    return hit, details


async def check_association_rules(
    transaction: Dict[str, Any],
    rule_config: Dict[str, Any],
    redis: Any,
    db: Any,
) -> Tuple[bool, Dict[str, Any]]:
    rule_type: str = str(rule_config.get("rule_type", ""))
    details: Dict[str, Any] = {}
    hit = False

    if rule_type == "multi_card_same_device":
        device_id: str = str(transaction.get("device_id", ""))
        card_hash: str = str(transaction.get("card_hash", ""))
        threshold: int = int(rule_config.get("threshold", 0))
        time_window_minutes: int = int(rule_config.get("time_window_minutes", 0))
        device_key: str = f"device:{device_id}"
        await redis.sadd(device_key, card_hash)
        await redis.expire(device_key, int(timedelta(minutes=time_window_minutes).total_seconds()))
        card_count: int = int(await redis.scard(device_key))
        hit = card_count > threshold
        details = {"device_id": device_id, "distinct_cards": card_count, "threshold": threshold}

    elif rule_type == "multi_region_short_time":
        card_hash: str = str(transaction.get("card_hash", ""))
        distance_km: float = float(rule_config.get("distance_km", 0))
        time_window_minutes: int = int(rule_config.get("time_window_minutes", 0))
        current_lat: float = float(transaction.get("lat", 0) or 0)
        current_lng: float = float(transaction.get("lng", 0) or 0)
        txn_time_raw: Any = transaction.get("transaction_time", datetime.now().isoformat())
        if isinstance(txn_time_raw, datetime):
            current_time: datetime = txn_time_raw
        else:
            current_time = datetime.fromisoformat(str(txn_time_raw))

        window_start: datetime = current_time - timedelta(minutes=time_window_minutes)
        location_key: str = f"locations:{card_hash}"
        locations_data: List[Tuple[float, float, datetime]] = []
        raw_data: Optional[str] = await redis.get(location_key)
        if raw_data:
            try:
                parsed = json.loads(raw_data)
                locations_data = [
                    (float(l[0]), float(l[1]), datetime.fromisoformat(l[2]))
                    for l in parsed
                ]
            except (json.JSONDecodeError, ValueError, IndexError, TypeError):
                locations_data = []

        locations_data = [loc for loc in locations_data if loc[2] >= window_start]
        locations_data.append((current_lat, current_lng, current_time))

        await redis.setex(
            location_key,
            int(timedelta(minutes=time_window_minutes * 2).total_seconds()),
            json.dumps([(lat, lng, t.isoformat()) for lat, lng, t in locations_data]),
        )

        max_distance: float = 0.0
        for i in range(len(locations_data)):
            for j in range(i + 1, len(locations_data)):
                dist = haversine_distance(
                    locations_data[i][0], locations_data[i][1],
                    locations_data[j][0], locations_data[j][1],
                )
                if dist > max_distance:
                    max_distance = dist
        hit = max_distance > distance_km
        details = {
            "max_distance_km": round(max_distance, 2),
            "distance_threshold_km": distance_km,
            "location_count": len(locations_data),
        }

    elif rule_type == "blacklist_merchant":
        merchant_blacklist: List[str] = list(rule_config.get("merchant_blacklist", []))
        merchant_id: str = str(transaction.get("merchant_id", ""))
        hit = merchant_id in merchant_blacklist
        details = {"merchant_id": merchant_id, "blacklisted_merchants": merchant_blacklist}

    return hit, details


async def check_behavior_rules(
    transaction: Dict[str, Any],
    rule_config: Dict[str, Any],
    db: Any,
) -> Tuple[bool, Dict[str, Any]]:
    rule_type: str = str(rule_config.get("rule_type", ""))
    details: Dict[str, Any] = {}
    hit = False

    if rule_type == "habit_deviation":
        card_hash: str = str(transaction.get("card_hash", ""))
        avg_amount_30d: float = float(rule_config.get("avg_amount_30d", 0))
        deviation_threshold: float = float(rule_config.get("deviation_threshold", 0))
        txn_amount: float = _get_txn_amount(transaction)

        if avg_amount_30d > 0:
            deviation_pct: float = abs(txn_amount - avg_amount_30d) / avg_amount_30d * 100
        else:
            deviation_pct = 0.0
        hit = deviation_pct > deviation_threshold
        details = {
            "transaction_amount": txn_amount,
            "avg_amount_30d": avg_amount_30d,
            "deviation_percent": round(deviation_pct, 2),
            "deviation_threshold": deviation_threshold,
        }

    elif rule_type == "night_transaction":
        night_start_hour: int = int(rule_config.get("night_start_hour", 22))
        night_end_hour: int = int(rule_config.get("night_end_hour", 6))
        amount_threshold: float = float(rule_config.get("amount_threshold", 0))
        txn_amount: float = _get_txn_amount(transaction)
        txn_time_raw: Any = transaction.get("transaction_time", datetime.now().isoformat())
        if isinstance(txn_time_raw, datetime):
            txn_time: datetime = txn_time_raw
        else:
            txn_time = datetime.fromisoformat(str(txn_time_raw))
        txn_hour: int = txn_time.hour

        is_night: bool = False
        if night_start_hour > night_end_hour:
            is_night = txn_hour >= night_start_hour or txn_hour < night_end_hour
        else:
            is_night = night_start_hour <= txn_hour < night_end_hour

        hit = is_night and txn_amount > amount_threshold
        details = {
            "transaction_hour": txn_hour,
            "night_start_hour": night_start_hour,
            "night_end_hour": night_end_hour,
            "transaction_amount": txn_amount,
            "amount_threshold": amount_threshold,
            "is_night": is_night,
        }

    elif rule_type == "first_overseas":
        card_hash: str = str(transaction.get("card_hash", ""))
        is_overseas: bool = bool(transaction.get("is_overseas", False))
        if not is_overseas:
            hit = False
            details = {"is_overseas": False}
        else:
            has_prior_overseas = False
            if db is not None:
                try:
                    from sqlalchemy import select, text
                    result = await db.execute(
                        text(
                            "SELECT COUNT(*) as cnt FROM transactions "
                            "WHERE card_hash = :ch AND is_overseas = true LIMIT 1"
                        ),
                        {"ch": card_hash},
                    )
                    row = result.fetchone()
                    if row and int(row[0]) > 0:
                        has_prior_overseas = True
                except Exception:
                    has_prior_overseas = False
            hit = is_overseas and not has_prior_overseas
            details = {
                "is_overseas": is_overseas,
                "has_prior_overseas_transactions": has_prior_overseas,
            }

    return hit, details


def evaluate_logic_expression(expression: Dict[str, Any], evaluation_context: Dict[str, bool]) -> bool:
    if not isinstance(expression, dict):
        return bool(evaluation_context.get(str(expression), False))

    node_type: Optional[str] = expression.get("type")
    if node_type == "AND":
        operands: List[Any] = expression.get("conditions", []) or []
        return all(evaluate_logic_expression(op, evaluation_context) for op in operands)
    if node_type == "OR":
        operands = expression.get("conditions", []) or []
        return any(evaluate_logic_expression(op, evaluation_context) for op in operands)
    if node_type == "NOT":
        operands = expression.get("conditions", []) or []
        if operands:
            return not evaluate_logic_expression(operands[0], evaluation_context)
        return not evaluate_logic_expression(expression.get("expression", {}), evaluation_context)
    if node_type == "condition":
        field: str = str(expression.get("field", ""))
        return bool(evaluation_context.get(field, False))

    if "AND" in expression:
        operands = expression["AND"]
        return all(evaluate_logic_expression(op, evaluation_context) for op in operands)
    if "OR" in expression:
        operands = expression["OR"]
        return any(evaluate_logic_expression(op, evaluation_context) for op in operands)
    if "NOT" in expression:
        return not evaluate_logic_expression(expression["NOT"], evaluation_context)

    return False


def calculate_weighted_score(hit_rules: List[Dict[str, Any]], all_rules: List[Dict[str, Any]]) -> int:
    hit_sum: float = sum(float(rule.get("weight", 1)) * 10 for rule in hit_rules)
    active_rules = [r for r in all_rules if r.get("status") == "active"]
    if not active_rules:
        return 0
    total_sum: float = sum(float(rule.get("weight", 1)) * 10 for rule in active_rules)
    if total_sum <= 0:
        return 0
    score: float = (hit_sum / total_sum) * 100
    return int(min(round(score), 100))


def _normalize_config(config: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(config, dict):
        return {}
    if "threshold" in config and isinstance(config["threshold"], dict):
        t = config["threshold"]
        if "value" in t and t.get("field") == "amount":
            return {"rule_type": "single_amount", "threshold": float(t["value"])}
    if "behavior" in config and isinstance(config["behavior"], dict):
        b = config["behavior"]
        btype = b.get("behavior_type")
        params = b.get("parameters", {}) or {}
        if btype == "amount_anomaly":
            return {
                "rule_type": "habit_deviation",
                "avg_amount_30d": float(params.get("avg_amount_30d", 0)),
                "deviation_threshold": float(params.get("deviation_threshold", 0)),
            }
        if btype == "geographic_jump":
            return {
                "rule_type": "multi_region_short_time",
                "distance_km": float(params.get("distance_km", 0)),
                "time_window_minutes": int(b.get("window_minutes", 0)),
            }
    return config


async def detect_fraud(transaction_data: Dict[str, Any], db: Any, redis: Any) -> Dict[str, Any]:
    from sqlalchemy import text

    rules_query = text(
        "SELECT r.id, r.name, r.rule_type, rv.id as version_id, rv.version_num, rv.config, "
        "rv.weight, rv.priority, rv.status, rv.is_immediate_block, rv.logic_expression "
        "FROM rules r JOIN rule_versions rv ON rv.rule_id = r.id "
        "WHERE rv.status = 'active' ORDER BY rv.priority DESC"
    )
    rules_result = await db.execute(rules_query)
    all_rules_rows = rules_result.fetchall()
    all_rules: List[Dict[str, Any]] = []
    for row in all_rules_rows:
        rule_type_raw = row[2]
        rule_type_str: str = rule_type_raw.value if hasattr(rule_type_raw, "value") else str(rule_type_raw)
        status_raw = row[8]
        status_str: str = status_raw.value if hasattr(status_raw, "value") else str(status_raw)
        config_raw = row[5]
        config_dict: Dict[str, Any] = config_raw if isinstance(config_raw, dict) else {}
        logic_raw = row[10]
        logic_dict: Dict[str, Any] = logic_raw if isinstance(logic_raw, dict) else {}

        normalized = _normalize_config(config_dict)
        if "rule_type" not in normalized:
            normalized["rule_type"] = rule_type_str

        all_rules.append({
            "id": int(row[0]),
            "rule_name": str(row[1]),
            "rule_type": normalized.get("rule_type", rule_type_str),
            "category": rule_type_str,
            "version_id": int(row[3]),
            "version_num": int(row[4]),
            "config": normalized,
            "weight": int(row[6]),
            "priority": int(row[7]),
            "status": status_str,
            "is_immediate_block": bool(row[9]),
            "logic_expression": logic_dict,
        })

    hit_rules: List[Dict[str, Any]] = []
    sub_results: Dict[str, bool] = {}

    for rule in all_rules:
        rule_type: str = rule.get("rule_type", "")
        category: str = rule.get("category", "")
        config: Dict[str, Any] = rule.get("config", {})
        rule_id: int = rule["id"]
        version_id: int = rule["version_id"]

        single_hit = False
        single_details: Dict[str, Any] = {}

        threshold_like = {"single_amount", "daily_total", "card_frequency"}
        association_like = {"multi_card_same_device", "multi_region_short_time", "blacklist_merchant"}
        behavior_like = {"habit_deviation", "night_transaction", "first_overseas"}

        if rule_type in threshold_like or category == "threshold":
            single_hit, single_details = await check_threshold_rules(
                transaction_data, config, redis
            )
        elif rule_type in association_like or category == "association":
            single_hit, single_details = await check_association_rules(
                transaction_data, config, redis, db
            )
        elif rule_type in behavior_like or category == "behavior":
            single_hit, single_details = await check_behavior_rules(
                transaction_data, config, db
            )

        sub_results[f"rule_{rule_id}"] = single_hit
        sub_results[f"version_{version_id}"] = single_hit
        sub_results[str(rule_id)] = single_hit

        final_hit = single_hit
        logic_expr: Optional[Dict[str, Any]] = rule.get("logic_expression")
        if logic_expr and isinstance(logic_expr, dict) and logic_expr:
            expr_to_eval: Dict[str, Any] = logic_expr
            if "expression" in logic_expr and isinstance(logic_expr["expression"], dict):
                expr_to_eval = logic_expr["expression"]
            try:
                final_hit = evaluate_logic_expression(expr_to_eval, sub_results)
            except Exception:
                final_hit = single_hit

        if final_hit:
            hit_entry = {**rule, "hit_details": single_details}
            hit_rules.append(hit_entry)
            if bool(rule.get("is_immediate_block", False)):
                return {
                    "score": 100,
                    "decision": "block",
                    "hit_rules": [
                        {
                            "rule_id": r["id"],
                            "version_id": r.get("version_id"),
                            "rule_name": r["rule_name"],
                            "rule_type": r["rule_type"],
                            "weight": int(r.get("weight", 5)),
                            "score": int(r.get("weight", 5)) * 10,
                            "details": r.get("hit_details", {}),
                        }
                        for r in hit_rules
                    ],
                    "reason": "immediate_block_rule_triggered",
                }

    score: int = calculate_weighted_score(hit_rules, all_rules)

    card_hash: str = str(transaction_data.get("card_hash", ""))
    now_ts: int = int(datetime.now().timestamp())
    alert_window_seconds: int = int(settings.ESCALATION_MINUTES * 60)
    alert_key: str = f"med_alert:{card_hash}"
    pipe = redis.pipeline()
    pipe.zremrangebyscore(alert_key, 0, now_ts - alert_window_seconds)
    if settings.RISK_THRESHOLD <= score < settings.BLOCK_THRESHOLD:
        pipe.zadd(alert_key, {f"txn_{now_ts}_{score}": now_ts})
    pipe.zcard(alert_key)
    pipe.expire(alert_key, alert_window_seconds + 60)
    pipe_results = await pipe.execute()
    med_alert_count: int = int(pipe_results[-2]) if len(pipe_results) >= 2 else 0

    decision: str = "allow"
    if score >= settings.BLOCK_THRESHOLD:
        decision = "block"
    elif score >= settings.RISK_THRESHOLD:
        decision = "review"

    if med_alert_count >= int(settings.ESCALATION_COUNT) and decision == "review":
        decision = "block"

    return {
        "score": score,
        "decision": decision,
        "hit_rules": [
            {
                "rule_id": r["id"],
                "version_id": r.get("version_id"),
                "rule_name": r["rule_name"],
                "rule_type": r["rule_type"],
                "category": r.get("category"),
                "weight": int(r.get("weight", 5)),
                "score": int(r.get("weight", 5)) * 10,
                "details": r.get("hit_details", {}),
            }
            for r in hit_rules
        ],
        "medium_alert_count_10min": med_alert_count,
    }
