import {
  closestCorners,
  PointerSensor,
  pointerWithin,
  type CollisionDetection,
} from "@dnd-kit/core";

export class MousePointerSensor extends PointerSensor {
  static activators: typeof PointerSensor.activators =
    PointerSensor.activators.map((activator) => ({
      ...activator,
      handler: (event, options) =>
        event.nativeEvent.pointerType !== "touch" &&
        activator.handler(event, options),
    }));
}

export const columnTarget = (id: string) => `column:${id}`;

export const cardCollisions: CollisionDetection = (args) => {
  const { collisionRect, pointerCoordinates } = args;
  const hits = pointerWithin({
    ...args,
    pointerCoordinates: pointerCoordinates ?? {
      x: collisionRect.left + collisionRect.width / 2,
      y: collisionRect.top + Math.min(collisionRect.height / 2, 24),
    },
  });
  const column = hits.find(({ id }) => String(id).startsWith("column:"));
  const card = hits.find(({ id }) => !String(id).startsWith("column:"));
  if (!column && pointerCoordinates) return [];
  if (card && String(card.id).startsWith("placeholder:"))
    return [{ id: args.active.id }];
  if (column && pointerCoordinates) {
    const node = column.data?.droppableContainer.node.current;
    const rect = args.droppableRects.get(column.id);
    if (node && rect && node.scrollHeight > node.clientHeight) {
      if (
        pointerCoordinates.y > rect.bottom - 12 &&
        node.scrollHeight - node.scrollTop - node.clientHeight <= 2
      )
        return [{ ...column, data: { ...column.data, edge: "end" } }];
      if (pointerCoordinates.y < rect.top + 12 && node.scrollTop <= 2)
        return [{ ...column, data: { ...column.data, edge: "start" } }];
    }
    if (card && card.id !== args.active.id) {
      const target = args.droppableRects.get(card.id);
      if (target) {
        const after = pointerCoordinates.y >= target.top + target.height / 2;
        const source = args.droppableContainers.find(
          ({ id }) => id === args.active.id,
        );
        const sameColumn =
          source?.data.current?.sortable?.containerId ===
          card.data?.droppableContainer.data.current?.sortable?.containerId;
        const sourceRect = args.droppableRects.get(args.active.id);
        if (
          source &&
          !source.node.current?.dataset.dragAnchor &&
          sourceRect &&
          sameColumn &&
          sourceRect.top < target.top !== after
        )
          return [{ id: args.active.id }];
        return [{ ...card, data: { ...card.data, after } }];
      }
    }
  }
  if (card && column) return [card];
  if (column) return [column];
  return closestCorners(args);
};
