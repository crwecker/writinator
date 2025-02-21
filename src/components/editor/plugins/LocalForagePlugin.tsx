import { useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot, $createParagraphNode } from 'lexical'
import localforage from 'localforage'
import Menu from '../../menu/Menu'

export function LocalForagePlugin({ editorStateData }) {
  const [currentChapter, setCurrentChapter] = useState('Chapter 1')
  const [currentBook, setCurrentBook] = useState('')
  const [editor] = useLexicalComposerContext()

  const getStorageKey = (bookTitle: string, chapterName: string) => `${bookTitle}:${chapterName}`

  const loadEditorState = async (chapterName, bookTitle) => {
    try {
      const storageKey = getStorageKey(bookTitle, chapterName)
      const editorStateJSON: string = await localforage.getItem(storageKey)

      // Always start with a clean slate
      editor.update(() => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode())
      })

      // If we have stored content, load it after ensuring we have a clean state
      if (editorStateJSON) {
        const parsedState = editor.parseEditorState(editorStateJSON)
        if (!parsedState.isEmpty()) {
          editor.setEditorState(parsedState)
        }
      }
    } catch (err) {
      console.error('Error loading editor state:', err)
      // Ensure we always have at least an empty paragraph
      editor.update(() => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode())
      })
    }
  }

  const saveEditorState = () => {
    try {
      const state = editor.getEditorState()
      if (!state.isEmpty()) {
        const editorStateData = JSON.stringify(state)
        const storageKey = getStorageKey(currentBook, currentChapter)
        localforage.setItem(storageKey, editorStateData)
      }
    } catch (err) {
      console.error('Error saving editor state:', err)
    }
  }

  const saveToDisk = async () => {
    const keys = await localforage.keys()
    const chapterKeys = keys.filter((key) => key.startsWith(currentBook + ':'))

    const chapters = {}
    for (const key of chapterKeys) {
      const chapterName = key.split(':')[1]
      chapters[chapterName] = await localforage.getItem(key)
    }

    const blob = new Blob([JSON.stringify(chapters, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentBook}.json`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const loadFromDisk = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'

    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement
      const file = target.files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const chapters = JSON.parse(text)

        for (const [chapterName, content] of Object.entries(chapters)) {
          const storageKey = getStorageKey(currentBook, chapterName)
          await localforage.setItem(storageKey, content)
        }

        loadEditorState(currentChapter, currentBook)
      } catch (err) {
        console.error('Failed to load chapters:', err)
      }
    }

    input.click()
  }

  useEffect(() => {
    loadEditorState(currentChapter, currentBook)
  }, [currentChapter, currentBook])

  useEffect(() => {
    saveEditorState()
  }, [editorStateData])

  const clickCurrentChapter = (chapterName, bookTitle) => {
    setCurrentBook(bookTitle)
    setCurrentChapter(chapterName)
  }

  return (
    <div
      style={{
        flexDirection: 'column',
        minWidth: 150,
        padding: 16,
        display: 'flex',
        backgroundColor: '#1a1a1a',
      }}
    >
      <button className="menu-button" onClick={saveToDisk}>
        Save to Disk
      </button>
      <button className="menu-button" onClick={loadFromDisk}>
        Load from Disk
      </button>
      <div className="menu-divider" />
      <Menu clickCurrentChapter={clickCurrentChapter} />
    </div>
  )
}
