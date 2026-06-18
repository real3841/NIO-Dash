import {
  ORDER_CARDS,
  VEHICLE_CARDS,
  cardLabel,
  resetCardLayout,
  toggleCardVisibility,
  type CardDef,
  type CardSection,
} from "../lib/card-layout";
import { useCardLayout } from "../hooks/useCardLayout";
import { IconGrip } from "./icons";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableCardRow({
  id,
  label,
  description,
  visible,
  onToggle,
}: {
  id: string;
  label: string;
  description?: string;
  visible: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="card-manager-row">
      <button
        type="button"
        className="card-tool-btn card-drag-btn"
        title="拖拽排序"
        aria-label="拖拽排序"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
      >
        <IconGrip />
      </button>
      <label className="card-manager-label">
        <input type="checkbox" checked={visible} onChange={onToggle} />
        <span>
          <strong>{label}</strong>
          {description && <span className="muted card-manager-desc">{description}</span>}
        </span>
      </label>
    </div>
  );
}

function CardSectionManager({
  section,
  defs,
  title,
  twoColumn = false,
}: {
  section: CardSection;
  defs: CardDef[];
  title: string;
  twoColumn?: boolean;
}) {
  const [layout, updateLayout] = useCardLayout(section, defs);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const oldIndex = layout.order.indexOf(activeId);
    const newIndex = layout.order.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) return;

    updateLayout({
      ...layout,
      order: arrayMove(layout.order, oldIndex, newIndex),
    });
  };

  const toggleVisible = (id: string) => {
    updateLayout(toggleCardVisibility(layout, id));
  };

  const handleReset = () => {
    const next = resetCardLayout(section);
    updateLayout(next);
  };

  return (
    <div className="card-manager-block">
      <div className="card-manager-head">
        <h3>{title}</h3>
        <button type="button" className="btn ghost btn-sm" onClick={handleReset}>
          恢复默认
        </button>
      </div>
      <p className="muted card-manager-hint">勾选显示卡片，拖拽调整顺序。看板中也可通过卡片右上角按钮隐藏。</p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={layout.order}
          strategy={twoColumn ? rectSortingStrategy : verticalListSortingStrategy}
        >
          <div className={`card-manager-list${twoColumn ? " card-manager-list-cols2" : ""}`}>
            {layout.order.map((id) => (
              <SortableCardRow
                key={id}
                id={id}
                label={cardLabel(defs, id)}
                description={defs.find((d) => d.id === id)?.description}
                visible={!layout.hidden.includes(id)}
                onToggle={() => toggleVisible(id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export function CardLayoutSettings() {
  return (
    <details className="card-manager-details">
      <summary className="card-manager-summary">
        <span>卡片管理</span>
        <span className="drawer-summary-meta">点击展开</span>
      </summary>
      <div className="card-manager-panel">
        <div className="card-manager-split">
          <CardSectionManager section="vehicle" defs={VEHICLE_CARDS} title="车辆看板" twoColumn />
          <CardSectionManager section="orders" defs={ORDER_CARDS} title="服务订单" />
        </div>
      </div>
    </details>
  );
}
