import { $getRoot, $getSelection, ParagraphNode } from "lexical";
import { useEffect, useState } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { AutoFocusPlugin } from "./plugins/AutoFocusPlugin";
import { LocalForagePlugin } from "./plugins/LocalForagePlugin";
import { editorStyles, editorTheme } from "./styles";
import { EmojiPlugin } from './plugins/EmojiPlugin'

function Placeholder() {
  return <div className="editor-placeholder">Start your chapter...</div>
}

function onError(error) {
  console.error(error);
}

function Editor({ onWordCountChange, editorHeight }) {
  const [editorStateData, setEditorStateData] = useState()
  const [wordCount, setWordCount] = useState(0);

  const onChange = (editorState) => {
    setEditorStateData(editorState)
    const count = editorState.read(() => {
      const root = $getRoot();
      const selection = $getSelection();
      const textContent = root.getTextContent();
      return textContent?.split(" ").length - 1;
    });
    setWordCount(count);
  };

  useEffect(() => {
    onWordCountChange(wordCount);
  }, [wordCount]);

  const initialConfig = {
    namespace: "MyEditor",
    theme: editorTheme,
    onError,
    nodes: [ParagraphNode],
  };

  useEffect(() => {
    const styleTag = document.createElement('style');
    styleTag.textContent = editorStyles;
    document.head.appendChild(styleTag);
    return () => styleTag.remove();
  }, []);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="editor-container" style={{ height: editorHeight }}>
        <div className="editor-inner">
          <RichTextPlugin
            contentEditable={<ContentEditable className="editor-input" />}
            placeholder={<Placeholder />}
          />
          <LocalForagePlugin editorStateData={editorStateData} />
          <HistoryPlugin />
          <AutoFocusPlugin />
          <EmojiPlugin />
          <OnChangePlugin onChange={onChange} />
        </div>
      </div>
    </LexicalComposer>
  );
}

export default Editor;
