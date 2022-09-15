export const useDrag = () => {

  const registerDraggables = (draggables) => {
    draggables?.forEach((draggable) => {
      draggable.addEventListener("dragstart", () => {
        draggable.classList.add("dragging");
      });
      draggable.addEventListener("dragend", () => {
        draggable.classList.remove("dragging");
      });
    });
  }

  function getDragAfterElement(container, y, className) {
    const draggableElements = [
      ...container.querySelectorAll(`.${className}:not(.dragging)`),
    ];

    return draggableElements.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      },
      { offset: Number.NEGATIVE_INFINITY }
    ).element;
  }

  const setupDraggable = (containerType, type, dragType) => {
    containerType?.forEach((container) => {
      const containerObj = container?.current ? container.current : container;
      containerObj.addEventListener("dragover", (e) => {
        e.preventDefault();

        const afterElement = getDragAfterElement(containerObj, e.clientY, type);
        const draggable = containerObj.querySelector(`.${dragType}`);
        if (afterElement == null) {
          containerObj.appendChild(draggable);
          // TODO: rewrite order and save to localforage
        } else {
          containerObj.insertBefore(draggable, afterElement);
          // TODO: rewrite order and save to localforage
        }
      });
    });
  };
  return {registerDraggables, setupDraggable}
}
