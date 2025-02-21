export const editorStyles = `
.editor-container {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
  height: 100%;
  overflow: hidden;
}

.editor-input {
  flex: 1;
  font-size: 15px;
  position: relative;
  tab-size: 1;
  outline: 0;
  padding: 15px;
  height: 100%;
  overflow-y: auto;
  caret-color: #444;
  max-width: 1200px;
  background: #222;
  color: #fff;
}

.editor-input p {
  margin: 0;
  padding: 0;
  min-height: 1.2em;
}

.editor-inner {
  flex: 1;
}

.editor-paragraph {
  margin: 0;
  padding: 0;
}

.editor-placeholder {
  color: #999;
  overflow: hidden;
  position: absolute;
  text-overflow: ellipsis;
  top: 15px;
  left: 15px;
  user-select: none;
  white-space: nowrap;
  display: inline-block;
  pointer-events: none;
  z-index: 0;
}

[contenteditable] {
  -webkit-user-select: text;
  user-select: text;
  cursor: text;
}
`;

export const editorTheme = {
  ltr: 'ltr',
  rtl: 'rtl',
  placeholder: 'editor-placeholder',
  paragraph: 'editor-paragraph',
  text: {
    bold: 'editor-text-bold',
    italic: 'editor-text-italic',
    underline: 'editor-text-underline',
  },
}; 