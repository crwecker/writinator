interface RightPanelProps {
  visible: boolean
  setVisible: (visible: boolean) => void
}

export const RightPanel = ({ visible, setVisible }: RightPanelProps) => {
  return (
    <div className={`${visible ? 'w-panel' : 'w-panel-collapsed'} bg-app-panel transition-width duration-300 border-l border-app-border flex relative`}>
      <div 
        onClick={() => setVisible(!visible)}
        className={`absolute right-0 top-0 bottom-0 ${visible ? 'w-handle' : 'w-panel-collapsed'} cursor-pointer flex items-center justify-center bg-app-panel border-l border-app-border z-10 transition-width duration-300`}
      >
        {visible && '→'}
      </div>
      <div className={`flex-1 overflow-auto ${visible ? 'p-panel-padding mr-handle' : 'p-0 mr-0'}`}>
        {visible ? (
          <div>
            {/* Right panel content will be added later */}
          </div>
        ) : null}
      </div>
    </div>
  )
} 