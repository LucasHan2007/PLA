import { useCallback, useState } from 'react'

const STORAGE_KEY = 'pla-debug-skip-socratic'

export function useDebugOptions() {
  const [skipSocratic, setSkipSocratic] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  const updateSkipSocratic = useCallback((value: boolean) => {
    setSkipSocratic(value)
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [])

  return { skipSocratic, setSkipSocratic: updateSkipSocratic }
}
