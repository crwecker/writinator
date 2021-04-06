import React from "react"
import Editor from "@monaco-editor/react";

const background = {
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  backgroundColor: '#009'
}
const content = {
  width: '100%',
  marginLeft: 200,
  marginRight: 200,
  backgroundColor: '#fff',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center'
}
const headingStyles = {
  marginVertical: 60,
  display: 'flex',
  width: '100%',
  justifyContent: 'center'
}
const normalText = {
  width: '100%',
  color: "#333333",
  fontSize: 20
}

export default function Content() {
  return (
    <div style={background}>
      <div style={content}>
        <Editor height="90vh"
          defaultLanguage="javascript"
          defaultValue="// some comment"
        />
      </div>

    </div>
  )
}
