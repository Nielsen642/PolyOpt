import sys
import json
import numpy as np
import cvxpy as cp

def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def compute_cvar(losses, beta):
    losses = np.array(losses, dtype=float)
    if losses.size == 0:
        return 0.0
    threshold = np.quantile(losses, beta)
    tail = losses[losses >= threshold]
    if tail.size == 0:
        return float(threshold)
    return float(np.mean(tail))


def build_correlation_matrix(positions, correlation_payload):
    size = len(positions)
    correlation_matrix = np.eye(size)
    if not correlation_payload:
        return correlation_matrix

    market_index = {
        market["id"]: idx for idx, market in enumerate(correlation_payload.get("markets", []))
    }
    source_matrix = correlation_payload.get("matrix", [])

    for i, position_i in enumerate(positions):
        for j, position_j in enumerate(positions):
            if i == j:
                correlation_matrix[i, j] = 1.0
                continue

            source_i = market_index.get(position_i["marketId"])
            source_j = market_index.get(position_j["marketId"])
            if source_i is None or source_j is None:
                continue

            if source_i >= len(source_matrix) or source_j >= len(source_matrix[source_i]):
                continue

            correlation_matrix[i, j] = safe_float(source_matrix[source_i][source_j], 0.0)

    return correlation_matrix


def build_scenarios(prices, covariance):
    size = len(prices)
    if size == 0:
        return np.zeros((0, 0))

    diagonal = np.clip(np.diag(covariance), 1e-6, None)
    vol = np.sqrt(diagonal)
    scenarios = [
        vol,
        -vol,
        0.5 * vol,
        -0.5 * vol,
    ]

    try:
        eigenvalues, eigenvectors = np.linalg.eigh(covariance)
        order = np.argsort(eigenvalues)[::-1]
        for idx in order[: min(2, size)]:
            if eigenvalues[idx] <= 0:
                continue
            vector = eigenvectors[:, idx] * np.sqrt(eigenvalues[idx])
            scenarios.append(vector)
            scenarios.append(-vector)
    except np.linalg.LinAlgError:
        pass

    normalized = []
    for scenario in scenarios:
        bounded = np.array([
            clamp(value, -0.35, 0.35) for value in scenario
        ])
        normalized.append(bounded)

    return np.array(normalized)


def optimize(payload):
    request = payload.get("request", {})
    positions = payload.get("positions", [])
    correlations = payload.get("correlations", {})

    count = len(positions)
    budget = max(safe_float(request.get("budget", 0.0)), 0.0)
    risk_tolerance = clamp(safe_float(request.get("riskTolerance", 0.5)), 0.0, 1.0)
    max_position_weight = clamp(safe_float(request.get("maxPositionWeight", 0.35)), 0.05, 1.0)
    scenario_preset = str(request.get("scenarioPreset", "baseline"))

    if count == 0 or budget == 0:
        return {
            "trades": [],
            "metrics": {
                "cvarBefore": 0.0,
                "cvarAfter": 0.0,
                "expectedReturnBefore": 0.0,
                "expectedReturnAfter": 0.0,
                "stressLossBefore": 0.0,
                "stressLossAfter": 0.0,
                "budgetUsed": 0.0,
            },
        }

    prices = np.array([clamp(safe_float(p["currentPrice"]), 0.01, 0.99) for p in positions])
    yes_shares = np.array([safe_float(p["yesShares"]) for p in positions])
    no_shares = np.array([safe_float(p["noShares"]) for p in positions])
    current_values = np.array([safe_float(p["currentValue"]) for p in positions])
    net_exposures = np.array([safe_float(p["netExposure"]) for p in positions])
    allocation_weights = np.array([safe_float(p["allocationWeight"]) for p in positions])

    liquidity_score = np.clip(1.0 - allocation_weights, 0.15, 1.0)
    volatility = 0.06 + np.abs(prices - 0.5) * 0.28 + (1.0 - liquidity_score) * 0.12
    if scenario_preset == "vol_spike":
        volatility = volatility * 1.45
    elif scenario_preset == "liquidity_crunch":
        volatility = volatility * 1.25 + (1.0 - liquidity_score) * 0.2
    elif scenario_preset == "market_gap":
        volatility = volatility * 1.65
    correlation_matrix = build_correlation_matrix(positions, correlations)
    covariance = np.outer(volatility, volatility) * correlation_matrix
    scenarios = build_scenarios(prices, covariance)
    scenario_count = scenarios.shape[0]

    shocked_prices = np.clip(prices[None, :] + scenarios, 0.01, 0.99)
    current_position_values = yes_shares[None, :] * shocked_prices + no_shares[None, :] * (1.0 - shocked_prices)
    base_position_values = yes_shares * prices + no_shares * (1.0 - prices)
    current_position_pnl = current_position_values - base_position_values[None, :]
    portfolio_pnl_before = np.sum(current_position_pnl, axis=1)

    trade_types = []
    hedge_entry_prices = []
    hedge_returns_per_dollar = []
    expected_returns_per_dollar = []

    for index in range(count):
        buy_no = net_exposures[index] >= 0
        if buy_no:
            trade_types.append("buy_no")
            hedge_price = 1.0 - prices[index]
            per_dollar = (prices[index] - shocked_prices[:, index]) / hedge_price
        else:
            trade_types.append("buy_yes")
            hedge_price = prices[index]
            per_dollar = (shocked_prices[:, index] - prices[index]) / hedge_price

        hedge_entry_prices.append(clamp(hedge_price, 0.01, 0.99))
        hedge_returns_per_dollar.append(per_dollar)
        expected_returns_per_dollar.append(float(np.mean(per_dollar)))

    hedge_entry_prices = np.array(hedge_entry_prices)
    hedge_returns_per_dollar = np.array(hedge_returns_per_dollar).T
    expected_returns_per_dollar = np.array(expected_returns_per_dollar)

    allocation_cap = max(max_position_weight * max(np.sum(current_values), 1.0), budget * max_position_weight)
    beta = 0.9
    reward_strength = 0.05 + risk_tolerance * 0.2

    x = cp.Variable(count, nonneg=True)
    alpha = cp.Variable()
    u = cp.Variable(scenario_count, nonneg=True)

    hedge_pnl = hedge_returns_per_dollar @ x
    total_pnl_after = portfolio_pnl_before + hedge_pnl
    losses_after = -total_pnl_after

    constraints = [
        cp.sum(x) <= budget,
        x <= allocation_cap,
        u >= losses_after - alpha,
    ]

    expected_reward = expected_returns_per_dollar @ x
    cvar_objective = alpha + (1.0 / ((1.0 - beta) * scenario_count)) * cp.sum(u)
    objective = cp.Minimize(cvar_objective - reward_strength * expected_reward)

    problem = cp.Problem(objective, constraints)
    try:
        problem.solve(solver=cp.SCS, verbose=False)
    except cp.SolverError:
        problem.solve(verbose=False)

    allocation = x.value if x.value is not None else np.zeros(count)
    allocation = np.maximum(allocation, 0.0)

    hedge_pnl_realized = hedge_returns_per_dollar @ allocation
    portfolio_pnl_after = portfolio_pnl_before + hedge_pnl_realized

    losses_before = -portfolio_pnl_before
    losses_after = -portfolio_pnl_after
    worst_before_index = int(np.argmax(losses_before))

    trades = []
    for index, amount in enumerate(allocation):
        if amount <= 1e-3:
            continue

        shares = amount / hedge_entry_prices[index]
        trade_pnl_series = hedge_returns_per_dollar[:, index] * amount
        worst_case_protection = (
            -current_position_pnl[worst_before_index, index]
            - (-(current_position_pnl[worst_before_index, index] + trade_pnl_series[worst_before_index]))
        )

        trade = {
            "marketId": positions[index]["marketId"],
            "question": positions[index]["question"],
            "tradeType": trade_types[index],
            "amount": round(float(amount), 2),
            "estimatedShares": round(float(shares), 4),
            "entryPrice": round(float(hedge_entry_prices[index]), 4),
            "expectedScenarioReturn": round(float(np.mean(trade_pnl_series)), 4),
            "worstCaseProtection": round(float(max(worst_case_protection, 0.0)), 4),
        }
        url = positions[index].get("polymarketUrl")
        if url:
            trade["polymarketUrl"] = url

        trades.append(trade)

    return {
        "trades": trades,
        "metrics": {
            "cvarBefore": round(compute_cvar(losses_before, beta), 4),
            "cvarAfter": round(compute_cvar(losses_after, beta), 4),
            "expectedReturnBefore": round(float(np.mean(portfolio_pnl_before)), 4),
            "expectedReturnAfter": round(float(np.mean(portfolio_pnl_after)), 4),
            "stressLossBefore": round(float(np.max(losses_before)), 4),
            "stressLossAfter": round(float(np.max(losses_after)), 4),
            "budgetUsed": round(float(np.sum(allocation)), 2),
        },
    }

def preview_hedge(payload):
    request = payload.get("request", {})
    positions = payload.get("positions", [])
    correlations = payload.get("correlations", {})

    count = len(positions)
    budget = max(safe_float(request.get("budget", 0.0)), 0.0)
    market_ids = request.get("marketIds", []) or []
    split_evenly = request.get("splitEvenly", True)

    if count == 0 or budget == 0 or len(market_ids) == 0:
        return {
            "trades": [],
            "metrics": {
                "cvarBefore": 0.0,
                "cvarAfter": 0.0,
                "expectedReturnBefore": 0.0,
                "expectedReturnAfter": 0.0,
                "stressLossBefore": 0.0,
                "stressLossAfter": 0.0,
                "budgetUsed": 0.0,
            },
        }

    prices = np.array([clamp(safe_float(p["currentPrice"]), 0.01, 0.99) for p in positions])
    yes_shares = np.array([safe_float(p["yesShares"]) for p in positions])
    no_shares = np.array([safe_float(p["noShares"]) for p in positions])
    current_values = np.array([safe_float(p["currentValue"]) for p in positions])
    net_exposures = np.array([safe_float(p["netExposure"]) for p in positions])
    allocation_weights = np.array([safe_float(p["allocationWeight"]) for p in positions])

    selected_indices = [i for i, p in enumerate(positions) if p.get("marketId") in market_ids]
    if len(selected_indices) == 0:
        return {
            "trades": [],
            "metrics": {
                "cvarBefore": 0.0,
                "cvarAfter": 0.0,
                "expectedReturnBefore": 0.0,
                "expectedReturnAfter": 0.0,
                "stressLossBefore": 0.0,
                "stressLossAfter": 0.0,
                "budgetUsed": 0.0,
            },
        }

    # Build the same scenario set as the full optimization so metrics are comparable.
    liquidity_score = np.clip(1.0 - allocation_weights, 0.15, 1.0)
    volatility = 0.06 + np.abs(prices - 0.5) * 0.28 + (1.0 - liquidity_score) * 0.12
    correlation_matrix = build_correlation_matrix(positions, correlations)
    covariance = np.outer(volatility, volatility) * correlation_matrix
    scenarios = build_scenarios(prices, covariance)
    scenario_count = scenarios.shape[0]

    shocked_prices = np.clip(prices[None, :] + scenarios, 0.01, 0.99)
    current_position_values = yes_shares[None, :] * shocked_prices + no_shares[None, :] * (1.0 - shocked_prices)
    base_position_values = yes_shares * prices + no_shares * (1.0 - prices)
    current_position_pnl = current_position_values - base_position_values[None, :]
    portfolio_pnl_before = np.sum(current_position_pnl, axis=1)

    trade_types = []
    hedge_entry_prices = []
    hedge_returns_per_dollar = []
    expected_returns_per_dollar = []

    for index in range(count):
        buy_no = net_exposures[index] >= 0
        if buy_no:
            trade_types.append("buy_no")
            hedge_price = 1.0 - prices[index]
            per_dollar = (prices[index] - shocked_prices[:, index]) / hedge_price
        else:
            trade_types.append("buy_yes")
            hedge_price = prices[index]
            per_dollar = (shocked_prices[:, index] - prices[index]) / hedge_price

        hedge_entry_prices.append(clamp(hedge_price, 0.01, 0.99))
        hedge_returns_per_dollar.append(per_dollar)
        expected_returns_per_dollar.append(float(np.mean(per_dollar)))

    hedge_entry_prices = np.array(hedge_entry_prices)
    hedge_returns_per_dollar = np.array(hedge_returns_per_dollar).T  # (scenario_count, count)

    allocation = np.zeros(count, dtype=float)
    if split_evenly:
        per_amount = budget / max(len(selected_indices), 1)
        for idx in selected_indices:
            allocation[idx] = per_amount
    else:
        for idx in selected_indices:
            allocation[idx] = budget

    hedge_pnl_realized = hedge_returns_per_dollar @ allocation
    portfolio_pnl_after = portfolio_pnl_before + hedge_pnl_realized

    losses_before = -portfolio_pnl_before
    losses_after = -portfolio_pnl_after

    beta = 0.9
    worst_before_index = int(np.argmax(losses_before))

    trades = []
    for index in selected_indices:
        amount = float(allocation[index])
        if amount <= 1e-3:
            continue

        shares = amount / hedge_entry_prices[index]
        trade_pnl_series = hedge_returns_per_dollar[:, index] * amount
        worst_case_protection = (
            -current_position_pnl[worst_before_index, index]
            - (-(current_position_pnl[worst_before_index, index] + trade_pnl_series[worst_before_index]))
        )

        trade = {
            "marketId": positions[index]["marketId"],
            "question": positions[index]["question"],
            "tradeType": trade_types[index],
            "amount": round(float(amount), 2),
            "estimatedShares": round(float(shares), 4),
            "entryPrice": round(float(hedge_entry_prices[index]), 4),
            "expectedScenarioReturn": round(float(np.mean(trade_pnl_series)), 4),
            "worstCaseProtection": round(float(max(worst_case_protection, 0.0)), 4),
        }
        url = positions[index].get("polymarketUrl")
        if url:
            trade["polymarketUrl"] = url

        trades.append(trade)

    return {
        "trades": trades,
        "metrics": {
            "cvarBefore": round(compute_cvar(losses_before, beta), 4),
            "cvarAfter": round(compute_cvar(losses_after, beta), 4),
            "expectedReturnBefore": round(float(np.mean(portfolio_pnl_before)), 4),
            "expectedReturnAfter": round(float(np.mean(portfolio_pnl_after)), 4),
            "stressLossBefore": round(float(np.max(losses_before)), 4),
            "stressLossAfter": round(float(np.max(losses_after)), 4),
            "budgetUsed": round(float(np.sum(allocation)), 2),
        },
    }

if __name__ == "__main__":
    input_data = sys.stdin.read()
    try:
        data = json.loads(input_data)
        mode = data.get("mode") or "optimize"
        if mode == "preview":
            result = preview_hedge(data)
        else:
            result = optimize(data)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)