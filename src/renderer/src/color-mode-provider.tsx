import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'

type ColorMode = 'dark' | 'light'

type ColorModeContextValue = {
  colorMode: ColorMode
  setColorMode: Dispatch<SetStateAction<ColorMode>>
}

const ColorModeContext = createContext<ColorModeContextValue | null>(null)

type ColorModeProviderProps = {
  children: ReactNode
}

export function ColorModeProvider({ children }: ColorModeProviderProps): React.JSX.Element {
  const [colorMode, setColorMode] = useState<ColorMode>('dark')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', colorMode === 'dark')
    document.documentElement.style.colorScheme = colorMode
  }, [colorMode])

  const value = useMemo(() => ({ colorMode, setColorMode }), [colorMode])

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>
}

export function useColorMode(): ColorModeContextValue {
  const context = useContext(ColorModeContext)

  if (!context) {
    throw new Error('useColorMode must be used within ColorModeProvider')
  }

  return context
}
