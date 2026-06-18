import { Fragment, useMemo, useState } from "react";
import { DashCard, RowItem, StatusPill } from "./ui";
import { IconSwap } from "./icons";
import {
  analyzeServiceOrders,
  fmtMoney,
  fmtSwapDate,
  orderAmount,
  orderDetailLines,
  orderLocation,
  orderStatusTone,
  orderTypeLabel,
  type ChangeResponse,
} from "../lib/change";
import { ORDER_CARDS, toggleCardVisibility } from "../lib/card-layout";
import { useCardLayout } from "../hooks/useCardLayout";
import { SortableCardGrid, type CardControls } from "./SortableCardGrid";

interface Props {
  data: ChangeResponse;
}

export function SwapHistory({ data }: Props) {
  const [layout, updateLayout] = useCardLayout("orders", ORDER_CARDS);
  const summary = useMemo(() => analyzeServiceOrders(data), [data]);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedNo, setExpandedNo] = useState<string | null>(null);

  const filteredOrders = useMemo(() => {
    if (typeFilter === "all") return summary.orders;
    return summary.orders.filter((o) => o.orderType === typeFilter);
  }, [summary.orders, typeFilter]);

  const effectiveLayout = useMemo(() => {
    if (summary.topSwapStations.length > 0) return layout;
    const hidden = new Set(layout.hidden);
    hidden.add("top_stations");
    return { ...layout, hidden: [...hidden] };
  }, [layout, summary.topSwapStations.length]);

  const onLayoutChange = (next: typeof layout) => {
    let hidden = next.hidden;
    if (summary.topSwapStations.length === 0) {
      const userHidTopStations = layout.hidden.includes("top_stations");
      hidden = userHidTopStations ? next.hidden : next.hidden.filter((id) => id !== "top_stations");
    }
    updateLayout({ ...next, hidden });
  };

  const hideCard = (id: string) => updateLayout(toggleCardVisibility(layout, id));

  const renderCard = (id: string, controls: CardControls) => {
    const chrome = {
      dragHandleProps: controls.dragHandleProps,
      dragListeners: controls.dragListeners,
      onHide: () => hideCard(id),
    };

    switch (id) {
      case "order_overview":
        return (
          <DashCard
            icon={<IconSwap />}
            title="订单概览"
            badge={<StatusPill tone="neutral">{summary.total} 笔</StatusPill>}
            {...chrome}
          >
            <RowItem label="最近订单" value={summary.lastOrderTime ? fmtSwapDate(summary.lastOrderTime) : "—"} />
            {summary.byType.slice(0, 4).map((t) => (
              <RowItem key={t.type} label={t.label} value={`${t.count} 笔`} />
            ))}
          </DashCard>
        );

      case "swap_stats":
        return (
          <DashCard
            icon={<IconSwap />}
            title="换电统计"
            badge={<StatusPill tone="success">{summary.swapCompleted} 次完成</StatusPill>}
            {...chrome}
          >
            <RowItem label="换电花费" value={fmtMoney(summary.swapSpent)} />
            <RowItem label="换电均价" value={fmtMoney(summary.swapAvgSpent)} />
            <RowItem label="换电取消" value={`${summary.swapCancelled} 笔`} />
            {summary.upgradeCount > 0 && (
              <>
                <div className="card-section-divider swap-card-divider">
                  <span>
                    灵活升级（日租 {summary.upgradeDayCount} 天 · 月租 {summary.upgradeMonthCount} 天）
                  </span>
                </div>
                <RowItem label="完成" value={`${summary.upgradeCompleted} 笔`} />
                <RowItem label="花费" value={fmtMoney(summary.upgradeSpent)} />
              </>
            )}
          </DashCard>
        );

      case "top_stations":
        if (summary.topSwapStations.length === 0) return null;
        return (
          <DashCard
            icon={<IconSwap />}
            title="常用换电站"
            headerExtra={<span className="door-summary">Top {summary.topSwapStations.length}</span>}
            {...chrome}
          >
            <div className="swap-station-list">
              {summary.topSwapStations.map((station) => (
                <div key={station.name} className="swap-station-row">
                  <div className="swap-station-meta">
                    <span className="swap-station-name">{station.name}</span>
                    <span className="swap-station-sub">
                      {station.count} 次 · {fmtMoney(station.spent)}
                    </span>
                  </div>
                  <div className="swap-station-bar">
                    <div
                      className="swap-station-fill"
                      style={{
                        width: `${Math.round((station.count / summary.topSwapStations[0].count) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </DashCard>
        );

      case "order_table":
        return (
          <DashCard
            className="dash-card-wide order-table-card"
            icon={<IconSwap />}
            title="全部订单"
            badge={
              <StatusPill tone="neutral">
                {filteredOrders.length}
                {typeFilter !== "all" ? ` / ${summary.total}` : ""} 笔
              </StatusPill>
            }
            {...chrome}
          >
            <details className="order-table-details">
              <summary className="order-table-summary">
                <span>订单表格</span>
                <span className="drawer-summary-meta">
                  {filteredOrders.length}
                  {typeFilter !== "all" ? ` / ${summary.total}` : ""} 笔 · 点击展开
                </span>
              </summary>
              <div className="order-table-details-body">
                <div className="order-type-chips order-type-chips-in-card">
                  <button
                    type="button"
                    className={`order-type-chip ${typeFilter === "all" ? "order-type-chip-active" : ""}`}
                    onClick={() => setTypeFilter("all")}
                  >
                    全部 {summary.total}
                  </button>
                  {summary.byType.map((t) => (
                    <button
                      key={t.type}
                      type="button"
                      className={`order-type-chip ${typeFilter === t.type ? "order-type-chip-active" : ""}`}
                      onClick={() => setTypeFilter(t.type)}
                    >
                      {t.label} {t.count}
                    </button>
                  ))}
                </div>
                <div className="swap-table-wrap">
                  <table className="swap-table">
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>类型</th>
                        <th>地点 / 详情</th>
                        <th>状态</th>
                        <th>金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order) => {
                        const expanded = expandedNo === order.orderNo;
                        const details = orderDetailLines(order);
                        return (
                          <Fragment key={order.orderNo}>
                            <tr
                              className="swap-table-row-clickable"
                              onClick={() => setExpandedNo(expanded ? null : order.orderNo)}
                            >
                              <td>{fmtSwapDate(order.createTime)}</td>
                              <td>
                                <StatusPill tone="neutral">{orderTypeLabel(order)}</StatusPill>
                              </td>
                              <td className="swap-table-station">{orderLocation(order)}</td>
                              <td>
                                <StatusPill tone={orderStatusTone(order)}>{order.orderStatusName}</StatusPill>
                              </td>
                              <td className="swap-table-price">{orderAmount(order)}</td>
                            </tr>
                            {expanded && details.length > 0 && (
                              <tr className="swap-table-detail-row">
                                <td colSpan={5}>
                                  <div className="order-detail-grid">
                                    {details.map((d) => (
                                      <div key={`${order.orderNo}-${d.label}-${d.value}`} className="order-detail-item">
                                        <span className="order-detail-label">{d.label}</span>
                                        <span className="order-detail-value">{d.value}</span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="muted swap-table-hint">点击行可展开更多订单详情</p>
              </div>
            </details>
          </DashCard>
        );

      default:
        return null;
    }
  };

  return (
    <section className="swap-section">
      <div className="swap-section-head">
        <h2>服务订单</h2>
        <p className="muted">
          来自 change.json · 共 {summary.total} 笔
          {summary.byType.length > 0 &&
            ` · ${summary.byType.map((t) => `${t.label} ${t.count}`).join(" · ")}`}
        </p>
      </div>

      <SortableCardGrid
        layout={effectiveLayout}
        onLayoutChange={onLayoutChange}
        className="dash-grid swap-grid"
      >
        {renderCard}
      </SortableCardGrid>
    </section>
  );
}
