import { useRef, useState, useEffect } from "react";
import localforage from "localforage";
import { useDrag } from "./useDrag";

// localforage.setItem("collections", [
//   {
//     title: "Mimsy",
//     chapters: [
//       {
//         name: "Chapter 1",
//       },
//       {
//         name: "Chapter 2",
//       },
//     ],
//   },
// ]);
// localforage.setItem("Mimsy", {
//     title: "Mimsy",
//     chapters: [
//       {
//         name: "Chapter 1",
//       },
//       {
//         name: "Chapter 2",
//       },
//     ],
//   },
// );
interface Chapter {
  name: string
}
interface Book {
  title: string
  chapters: Array<Chapter>
}
type Collections = Array<Book>

function Menu({ clickCurrentChapter }) {
  const [currentBook, setCurrentBook] = useState<Book>();
  const menuRef = useRef(null);
  const chapterRefs = useRef([]);
  const [draggables, setDraggables] = useState(null)
  const { registerDraggables, setupDraggable } = useDrag();

  useEffect(() => {
    setDraggables(menuRef?.current?.querySelectorAll('.draggable'))
  }, [menuRef?.current])
  const getMenu = async () => {
    const collections: Collections = await localforage.getItem("collections");
    console.log("GOT FROM STORAGE: ", JSON.stringify(collections));
    const book: Book = await localforage.getItem(collections[0].title);
    console.log("GOT FROM STORAGE: ", JSON.stringify(book));
    setCurrentBook(book);
  };
  useEffect(() => {
    getMenu();
  }, []);

  const addChapter = async (book) => {
    const previousBook: Book = await localforage.getItem(book.title)
    console.log(previousBook)
    const updatedBook = { title: previousBook.title, chapters: [...previousBook.chapters, {name: `Chapter ${previousBook.chapters.length + 1}`}]}
    setCurrentBook(updatedBook)
    localforage.setItem(book.title, updatedBook)
  };

  useEffect(() => {
    if (draggables) registerDraggables(draggables);
  }, [draggables]);

  useEffect(() => {
    if (menuRef) {
      setupDraggable([menuRef], "draggable", "dragging");
    }
  }, [menuRef]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column'}}>
      <div ref={menuRef}>
        <p className="menu-label">{currentBook?.title}</p>
        {currentBook?.chapters?.map((chapter, i) => (
          <div
            key={`chapter${i}`}
            ref={(el) => (chapterRefs.current[i] = el)}
            className="chapter draggable"
            draggable="true"
          >
            <ul className="menu-list chapter">
              <li>
                <a onClick={() => clickCurrentChapter(chapter.name)}>{chapter.name}</a>
              </li>
            </ul>
          </div>
        ))}
      </div>
      <button onClick={() => addChapter(currentBook)}>Add Chapter</button>
    </div>
  );
}

export default Menu;
