import { useRef, useState, useEffect, useCallback } from 'react'
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
  const [isAddingBook, setIsAddingBook] = useState(false)
  const [isAddingChapter, setIsAddingChapter] = useState(false)
  const [editingChapterIndex, setEditingChapterIndex] = useState<number | null>(null)
  const menuRef = useRef(null)
  const chapterRefs = useRef([])
  const [draggables, setDraggables] = useState(null)
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

  const addChapter = async (book, chapterName?: string) => {
    if (!book) return
    const previousBook: Book = await localforage.getItem(book.title)
    const newChapterName = chapterName?.trim() || `Chapter ${previousBook.chapters.length + 1}`
    if (newChapterName === '') return

    const updatedBook = {
      title: previousBook.title,
      chapters: [...previousBook.chapters, { name: newChapterName }],
    }
    setCurrentBook(updatedBook)
    await localforage.setItem(book.title, updatedBook)
    setIsAddingChapter(false)
  }

  const updateChapterName = async (book: Book, chapterIndex: number, newName: string) => {
    if (!book || newName.trim() === '') return
    const updatedChapters = [...book.chapters]
    updatedChapters[chapterIndex] = { name: newName.trim() }
    
    const updatedBook = {
      ...book,
      chapters: updatedChapters
    }
    
    setCurrentBook(updatedBook)
    await localforage.setItem(book.title, updatedBook)
    setEditingChapterIndex(null)
  }

  const handleOrderChange = useCallback(async (newOrder: number[]) => {
    if (!currentBook) return
    
    const reorderedChapters = newOrder.map(index => currentBook.chapters[index])
    const updatedBook = {
      ...currentBook,
      chapters: reorderedChapters
    }
    
    setCurrentBook(updatedBook)
    await localforage.setItem(currentBook.title, updatedBook)
  }, [currentBook]);

  useEffect(() => {
    getMenu()
  }, [])

  useEffect(() => {
    if (draggables) registerDraggables(draggables, handleOrderChange)
  }, [draggables, registerDraggables, handleOrderChange])

  useEffect(() => {
    if (menuRef) {
      setupDraggable([menuRef], 'draggable', 'dragging', handleOrderChange)
    }
  }, [menuRef, setupDraggable, handleOrderChange])

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
              data-index={i}
            >
              {editingChapterIndex === i ? (
                <input
                  className="menu-input"
                  defaultValue={chapter.name}
                  autoFocus
                  onBlur={(e) => updateChapterName(currentBook, i, e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') {
                      updateChapterName(currentBook, i, e.currentTarget.value)
                    } else if (e.key === 'Escape') {
                      setEditingChapterIndex(null)
                    }
                  }}
                />
              ) : (
                <a
                  className={`chapter-link ${currentChapter === chapter.name ? 'active' : ''}`}
                  onClick={() => handleChapterClick(chapter.name, currentBook?.title)}
                  onDoubleClick={() => setEditingChapterIndex(i)}
                >
                  {chapter.name}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="menu-divider" />
      {isAddingChapter ? (
        <input
          className="menu-input"
          placeholder="Chapter name"
          autoFocus
          onBlur={(e) => addChapter(currentBook, e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              addChapter(currentBook, e.currentTarget.value)
            } else if (e.key === 'Escape') {
              setIsAddingChapter(false)
            }
          }}
        />
      ) : (
        <button className="menu-button" onClick={() => setIsAddingChapter(true)}>
          Add Chapter
        </button>
      )}
    </div>
  )
}

export default Menu
