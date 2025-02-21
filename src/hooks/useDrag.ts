export const useDrag = () => {
  let currentContainer = null;
  let draggedElement = null;
  let orderChangeCallback = null;

  const registerDraggables = (draggables, onOrderChange) => {
    orderChangeCallback = onOrderChange;
    draggables?.forEach((draggable) => {
      draggable.addEventListener("dragstart", (e) => {
        // Get the closest draggable parent element (in case we clicked a child element)
        draggedElement = e.target.closest('.draggable');
        if (draggedElement) {
          draggedElement.classList.add("dragging");
        }
      });

      draggable.addEventListener("dragend", () => {
        if (!draggedElement) return;
        draggedElement.classList.remove("dragging");
        
        if (currentContainer) {
          const newOrder = [...currentContainer.children].map(
            el => parseInt(el.getAttribute('data-index'))
          ).filter(index => !isNaN(index));
          
          if (newOrder.length > 0) {
            orderChangeCallback?.(newOrder);
          }
        }
        draggedElement = null;
        currentContainer = null;
      });
    });
  }

  const setupDraggable = (containerRefs, type, dragType, onOrderChange) => {
    containerRefs?.forEach((containerRef) => {
      const container = containerRef?.current ? containerRef.current : containerRef;
      const chapterList = container.querySelector('.chapter-list');
      
      if (!chapterList) return;

      let lastY = 0;
      let rafId = null;

      const handleDragOver = (e) => {
        if (!draggedElement || rafId) return;

        rafId = requestAnimationFrame(() => {
          const y = e.clientY;
          currentContainer = chapterList;

          const draggableElements = [...chapterList.children].filter(
            child => child !== draggedElement && child.classList.contains('draggable')
          );

          const afterElement = draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
              return { offset, element: child };
            }
            return closest;
          }, { offset: Number.NEGATIVE_INFINITY }).element;

          if (afterElement) {
            if (afterElement.nextSibling !== draggedElement) {
              chapterList.insertBefore(draggedElement, afterElement);
            }
          } else {
            chapterList.appendChild(draggedElement);
          }
          
          rafId = null;
        });
      };

      chapterList.addEventListener("dragover", (e) => {
        e.preventDefault();
        handleDragOver(e);
      });

      chapterList.addEventListener("drop", (e) => {
        e.preventDefault();
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      });
    });
  };

  return { registerDraggables, setupDraggable };
}
