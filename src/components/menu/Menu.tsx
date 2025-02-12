import { useRef, useState, useEffect } from 'react'
import localforage from 'localforage'
import { useDrag } from '../../hooks/useDrag'
import { menuStyles } from './styles'

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
  const [currentBook, setCurrentBook] = useState<Book>()
  const [collections, setCollections] = useState<Collections>([])
  const [currentChapter, setCurrentChapter] = useState('Chapter 1')
  const menuRef = useRef(null)
  const chapterRefs = useRef([])
  const [draggables, setDraggables] = useState(null)
  const [isAddingBook, setIsAddingBook] = useState(false)
  const { registerDraggables, setupDraggable } = useDrag()

  useEffect(() => {
    setDraggables(menuRef?.current?.querySelectorAll('.draggable'))
  }, [menuRef?.current])

  const getMenu = async () => {
    const collections: Collections = (await localforage.getItem('collections')) || []
    setCollections(collections)
    if (collections?.length > 0) {
      const book: Book = await localforage.getItem(collections[0]?.title)
      setCurrentBook(book)
    }
  }

  const handleChapterClick = (chapterName: string, bookTitle: string) => {
    setCurrentChapter(chapterName)
    clickCurrentChapter(chapterName, bookTitle)
  }

  const switchBook = async (bookTitle: string) => {
    const book: Book = await localforage.getItem(bookTitle)
    setCurrentBook(book)
    // When switching books, switch to first chapter
    if (book?.chapters?.length > 0) {
      handleChapterClick(book.chapters[0].name, book.title)
    }
  }

  const addBook = async (title: string) => {
    if (!title) return

    const newBook: Book = {
      title,
      chapters: [{ name: 'Chapter 1' }],
    }

    // Add to collections
    const updatedCollections = [...collections, newBook]
    await localforage.setItem('collections', updatedCollections)
    setCollections(updatedCollections)

    // Save book data
    await localforage.setItem(title, newBook)
    setCurrentBook(newBook)
    setIsAddingBook(false)
  }

  const addChapter = async (book) => {
    const previousBook: Book = await localforage.getItem(book.title)
    console.log(previousBook)
    const updatedBook = {
      title: previousBook.title,
      chapters: [...previousBook.chapters, { name: `Chapter ${previousBook.chapters.length + 1}` }],
    }
    setCurrentBook(updatedBook)
    localforage.setItem(book.title, updatedBook)
  }

  useEffect(() => {
    getMenu()
  }, [])

  useEffect(() => {
    if (draggables) registerDraggables(draggables)
  }, [draggables])

  useEffect(() => {
    if (menuRef) {
      setupDraggable([menuRef], 'draggable', 'dragging')
    }
  }, [menuRef])

  useEffect(() => {
    // Add styles to document
    const styleTag = document.createElement('style')
    styleTag.textContent = menuStyles
    document.head.appendChild(styleTag)
    return () => styleTag.remove()
  }, [])

  return (
    <div className="side-menu">
      <select
        className="menu-select"
        value={currentBook?.title}
        onChange={(e) => switchBook(e.target.value)}
      >
        {collections.map((book) => (
          <option key={book.title} value={book.title}>
            {book.title}
          </option>
        ))}
      </select>

      {isAddingBook ? (
        <input
          className="menu-input"
          type="text"
          placeholder="Book title"
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              addBook(e.currentTarget.value)
            } else if (e.key === 'Escape') {
              setIsAddingBook(false)
            }
          }}
          autoFocus
        />
      ) : (
        <button className="menu-button" onClick={() => setIsAddingBook(true)}>
          Add Book
        </button>
      )}

      <div className="menu-divider" />

      <div ref={menuRef}>
        <p className="menu-label">{currentBook?.title}</p>
        <div className="chapter-list">
          {currentBook?.chapters?.map((chapter, i) => (
            <div
              key={`chapter${i}`}
              ref={(el) => (chapterRefs.current[i] = el)}
              className="chapter-item draggable"
              draggable="true"
            >
              <a
                className={`chapter-link ${currentChapter === chapter.name ? 'active' : ''}`}
                onClick={() => handleChapterClick(chapter.name, currentBook?.title)}
              >
                {chapter.name}
              </a>
            </div>
          ))}
        </div>
      </div>

      <div className="menu-divider" />
      <button className="menu-button" onClick={() => addChapter(currentBook)}>
        Add Chapter
      </button>
    </div>
  )
}

export default Menu
