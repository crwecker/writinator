import { LocalForagePlugin } from '../editor/plugins/LocalForagePlugin'

interface LeftPanelProps {
  visible: boolean
  setVisible: (visible: boolean) => void
  editorStateData: any
}

export const LeftPanel = ({ visible, setVisible, editorStateData }: LeftPanelProps) => {
  return (
    <div className={`${visible ? 'w-[250px]' : 'w-[5px]'} bg-[#2a2a2a] transition-[width] duration-300 border-r border-[#3a3a3a] flex relative`}>
      <div 
        onClick={() => setVisible(!visible)}
        className={`absolute left-0 top-0 bottom-0 ${visible ? 'w-[30px]' : 'w-[5px]'} cursor-pointer flex items-center justify-center bg-[#2a2a2a] border-r border-[#3a3a3a] z-10 transition-[width] duration-300`}
      >
        {visible && '←'}
      </div>
      <div className={`flex-1 overflow-auto ${visible ? 'p-4 ml-[30px]' : 'p-0 ml-0'}`}>
        {visible ? (
          <LocalForagePlugin editorStateData={editorStateData} />
        ) : null}
      </div>
    </div>
  )
} 