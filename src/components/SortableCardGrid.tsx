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
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { useMemo } from "react";
import type { CardLayoutState } from "../lib/card-layout";

interface SortableCardGridProps {
  layout: CardLayoutState;
  onLayoutChange: (next: CardLayoutState) => void;
  className?: string;
  children: (id: string, controls: CardControls) => ReactNode;
}

export interface CardControls {
  dragHandleProps: Record<string, unknown>;
  dragListeners: Record<string, unknown>;
  isDragging: boolean;
}

function SortableItem({
  id,
  children,
}: {
  id: string;
  children: (controls: CardControls) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="sortable-card-item">
      {children({
        dragHandleProps: { ...attributes, ref: setActivatorNodeRef },
        dragListeners: listeners ?? {},
        isDragging,
      })}
    </div>
  );
}

export function SortableCardGrid({ layout, onLayoutChange, className, children }: SortableCardGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const hidden = useMemo(() => new Set(layout.hidden), [layout.hidden]);
  const visibleIds = useMemo(
    () => layout.order.filter((id) => !hidden.has(id)),
    [layout.order, hidden],
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const oldIndex = layout.order.indexOf(activeId);
    const newIndex = layout.order.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) return;

    onLayoutChange({
      ...layout,
      order: arrayMove(layout.order, oldIndex, newIndex),
    });
  };

  if (visibleIds.length === 0) {
    return <p className="muted card-grid-empty">当前没有显示的卡片，请在「卡片管理」中开启。</p>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
        <div className={className ?? "dash-grid"}>
          {visibleIds.map((id) => (
            <SortableItem key={id} id={id}>
              {(controls) => children(id, controls)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
