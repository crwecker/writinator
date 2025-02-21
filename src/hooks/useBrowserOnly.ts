import { useEffect, useState } from 'react'

export function useBrowserOnly() {
  const [isBrowser, setIsBrowser] = useState(false)

  useEffect(() => {
    setIsBrowser(true)
  }, [])

  return isBrowser
} 