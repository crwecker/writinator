import React from 'react'
import Layout from './layout'
import useScript from '../hooks/useScript'


export default function Home() {
  useScript('monaco-editor/min/vs/loader.js')
  // useScript('./monaco-editor.js')
  require.config({ paths: { 'vs': 'monaco-editor/min/vs' }})
  require(['vs/editor/editor.main'], function() {
    var editor = monaco.editor.create(document.getElementById('container'), {
      value: [
        'function x() {',
        '\tconsole.log("Hello world!");',
        '}'
      ].join('\n'),
      language: 'javascript'
    })
  })
  return <Layout>
    <div id="container" style="width:800px;height:600px;border:1px solid grey"></div>
  </Layout>
}