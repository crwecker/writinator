import React from "react"
import "./layout.sass"
import Content from "./content"
import logo from "../images/icon-128x128.png"

const body = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%'
}
const header = {
  flexShrink: 0
}
const content = {
  flexGrow: 1,
  flexShrink: 0,
  flexBasis: 'auto'
}
const footer = {
  flexShrink: 0
}

export default function Layout({ children }) {
  return (
    <main style={body}>
      <div style={header}>
        <img src={logo} alt='logo'/>
      </div>
      <div style={content}>
        <title>Writinator</title>
        <Content />
      </div>
      <div style={footer}>I'm the footer</div>
    </main>
  )
}