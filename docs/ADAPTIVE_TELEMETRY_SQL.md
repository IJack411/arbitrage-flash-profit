# Adaptive Telemetry SQL Playbook

Use these queries in Supabase SQL Editor after running migration `008_create_live_auto_adaptive_threshold_events.sql`.

## 1) Recent Adaptive Events

```sql
select
  occurred_at,
  direction,
  previous_threshold,
  next_threshold,
  quality_blocked,
  considered,
  transport_failures,
  base_threshold,
  adaptive_offset,
  reason
from live_auto_adaptive_threshold_events
order by occurred_at desc
limit 200;
```

## 2) Event Pressure Ratio

```sql
select
  date_trunc('hour', occurred_at) as hour_bucket,
  count(*) as events,
  avg(case when considered > 0 then quality_blocked::numeric / considered::numeric else 0 end) as avg_quality_pressure,
  avg(transport_failures) as avg_transport_failures
from live_auto_adaptive_threshold_events
group by 1
order by 1 desc
limit 72;
```

## 3) Tighten vs Relax Mix

```sql
select
  direction,
  count(*) as events,
  avg(next_threshold - previous_threshold) as avg_delta,
  avg(case when considered > 0 then quality_blocked::numeric / considered::numeric else 0 end) as avg_quality_pressure
from live_auto_adaptive_threshold_events
group by direction
order by direction;
```

## 4) Link Adaptive Events to Trade Outcomes (15m Window)

This compares trade outcomes after each adaptive decision by joining to `trade_execution_logs` in a 15-minute post-event window.

```sql
with event_windows as (
  select
    event_id,
    occurred_at,
    direction,
    next_threshold,
    occurred_at as window_start,
    occurred_at + interval '15 minutes' as window_end
  from live_auto_adaptive_threshold_events
),
window_trades as (
  select
    e.event_id,
    e.occurred_at,
    e.direction,
    e.next_threshold,
    t.id as trade_id,
    coalesce(t.actual_profit, 0) as actual_profit,
    case when coalesce(t.actual_profit, 0) > 0 then 1 else 0 end as is_win
  from event_windows e
  left join trade_execution_logs t
    on t.executed_at >= e.window_start
   and t.executed_at < e.window_end
)
select
  direction,
  count(distinct event_id) as events,
  count(trade_id) as trades_in_window,
  avg(actual_profit) as avg_trade_profit,
  case when count(trade_id) = 0 then 0 else avg(is_win::numeric) * 100 end as win_rate_pct
from window_trades
group by direction
order by direction;
```

## 5) Before/After Comparison Around Tighten Events

Compares the 15 minutes before and after each `up` event.

```sql
with tighten_events as (
  select event_id, occurred_at
  from live_auto_adaptive_threshold_events
  where direction = 'up'
),
trade_slices as (
  select
    e.event_id,
    case
      when t.executed_at >= e.occurred_at - interval '15 minutes' and t.executed_at < e.occurred_at then 'before'
      when t.executed_at >= e.occurred_at and t.executed_at < e.occurred_at + interval '15 minutes' then 'after'
      else null
    end as period,
    coalesce(t.actual_profit, 0) as actual_profit,
    case when coalesce(t.actual_profit, 0) > 0 then 1 else 0 end as is_win
  from tighten_events e
  left join trade_execution_logs t
    on t.executed_at >= e.occurred_at - interval '15 minutes'
   and t.executed_at < e.occurred_at + interval '15 minutes'
)
select
  period,
  count(*) as trades,
  avg(actual_profit) as avg_profit,
  avg(is_win::numeric) * 100 as win_rate_pct
from trade_slices
where period is not null
group by period
order by period;
```

## 6) Queue Health Check

If remote sync is delayed, this helps confirm data is arriving.

```sql
select
  count(*) as total_rows,
  max(occurred_at) as latest_event_at,
  min(occurred_at) as earliest_event_at
from live_auto_adaptive_threshold_events;
```

## Notes

- `trade_execution_logs.executed_at` is used as execution timestamp.
- If your clock skew is significant, increase windows from 15m to 30m.
- For production analysis, segment by network/execution_mode when those dimensions are populated.
