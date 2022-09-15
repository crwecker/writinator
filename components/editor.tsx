import { $getRoot, $getSelection } from "lexical";
import { useEffect, useState } from "react";

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import localforage from "localforage";
import Menu from "./menu";
import { editorStateHasDirtySelection } from "lexical/LexicalEditorState";

const myTheme = {
  ltr: 'ltr',
  rtl: 'rtl',
  placeholder: 'editor-placeholder',
  paragraph: 'editor-paragraph',
}
// Lexical React plugins are React components, which makes them
// highly composable. Furthermore, you can lazy load plugins if
// desired, so you don't pay the cost for plugins until you
// actually use them.
function MyCustomAutoFocusPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Focus the editor when the effect fires!
    editor.focus();
  }, [editor]);

  return null;
}

function LocalForagePlugin({ editorStateData }) {
  const [currentChapter, setCurrentChapter] = useState('Chapter 1')
  const [editor] = useLexicalComposerContext()

  const loadEditorState = async (chapterName) => {
    const editorStateJSON: string = await localforage.getItem(chapterName)
    console.log("GOT FROM STORAGE: ", editorStateJSON)
    if (editorStateJSON) editor.setEditorState(editor.parseEditorState(editorStateJSON))
  }
  
  const saveEditorState = () => {
    const editorStateData= JSON.stringify(editor.getEditorState())
    localforage.setItem(currentChapter, editorStateData)
    console.log("SAVE EDITOR STATE: ", editorStateData)
    // https://github.com/facebook/lexical/discussions/1840
    // https://www.audreyhal.com/blog/persisting-a-file-across-react-components
  }
  const saveToDisk = () => {
    // Get editor state for all chapters and write them to disk
  }
  const loadFromDisk = () => {
    // Get book info and editor state for all chapters from disk
  }

  useEffect(() => {
    loadEditorState(currentChapter) 
  }, [currentChapter])

  useEffect(() => {
    saveEditorState()
  }, [editorStateData])
  
  const clickCurrentChapter = (chapterName) => {
    setCurrentChapter(chapterName)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 150, padding: 16 }}>
      <div className="button" onClick={saveToDisk}>Save</div>
      <div className="button" onClick={loadFromDisk}>Load</div>
      <Menu clickCurrentChapter={clickCurrentChapter} />
    </div>
  )
}

// Catch any errors that occur during Lexical updates and log them
// or throw them as needed. If you don't throw them, Lexical will
// try to recover gracefully without losing user data.
function onError(error) {
  console.error(error);
}

function Editor({ onWordCountChange }) {
  const [editorStateData, setEditorStateData] = useState()
  const [wordCount, setWordCount] = useState(0);
  // When the editor changes, you can get notified via the
  // LexicalOnChangePlugin!
  const onChange = (editorState) => {
    setEditorStateData(editorState)
    const count = editorState.read(() => {
      // Read the contents of the EditorState here.
      const root = $getRoot();
      const selection = $getSelection();
      console.log(root, selection);
      const textContent = root.getTextContent();
      console.log("TEXT: ", textContent);
      return textContent?.split(" ").length - 1;
    });
    setWordCount(count);
  };

  useEffect(() => {
    onWordCountChange(wordCount);
  }, [wordCount]);

  const initialConfig = {
    namespace: "MyEditor",
    theme: myTheme,
    onError,
  };
  return (
    <div className="editor-wrapper">
      <LexicalComposer initialConfig={initialConfig}>
        <div className="editor-container">
          <LocalForagePlugin editorStateData={editorStateData} />
          <PlainTextPlugin
            contentEditable={<ContentEditable />}
            placeholder={<div>...</div>}
          />
          <OnChangePlugin onChange={onChange} />
          <HistoryPlugin />
          <MyCustomAutoFocusPlugin />
        </div>
      </LexicalComposer>
    </div>
  );
}

export default Editor;
