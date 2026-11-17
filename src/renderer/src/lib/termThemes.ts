import type { ITheme } from '@xterm/xterm'

export interface TermTheme {
  id: string
  name: string
  note: string
  theme: ITheme
}

const ansi = (
  c: [string, string, string, string, string, string, string, string],
  b: [string, string, string, string, string, string, string, string]
): ITheme => ({
  black: c[0], red: c[1], green: c[2], yellow: c[3], blue: c[4], magenta: c[5], cyan: c[6], white: c[7],
  brightBlack: b[0], brightRed: b[1], brightGreen: b[2], brightYellow: b[3],
  brightBlue: b[4], brightMagenta: b[5], brightCyan: b[6], brightWhite: b[7]
})

const navyAnsi = ansi(
  ['#262b40', '#f2616b', '#2fcf86', '#f0c35a', '#4ea4f6', '#c58af5', '#36c9c9', '#d5d9e4'],
  ['#5a6178', '#ff8a92', '#5fe3a5', '#ffd77f', '#7dbdff', '#d9aefc', '#68e0e0', '#f5f7fb']
)

export const TERM_THEMES: TermTheme[] = [
  {
    id: 'navy-green',
    name: 'Navy Green',
    note: 'по умолчанию',
    theme: { background: '#161a2b', foreground: '#2fcf86', cursor: '#2fcf86', cursorAccent: '#161a2b', selectionBackground: '#2fcf8640', ...navyAnsi }
  },
  {
    id: 'navy-classic',
    name: 'Navy Classic',
    note: 'светлый текст',
    theme: { background: '#161a2b', foreground: '#d5d9e4', cursor: '#4ea4f6', cursorAccent: '#161a2b', selectionBackground: '#4ea4f640', ...navyAnsi }
  },
  {
    id: 'paper',
    name: 'Paper',
    note: 'светлая',
    theme: {
      background: '#f6f5f0', foreground: '#2d3142', cursor: '#1f7a55', cursorAccent: '#f6f5f0', selectionBackground: '#1f7a5530',
      ...ansi(
        ['#2d3142', '#c4323f', '#1f7a55', '#a06b00', '#2463b5', '#8a3fb3', '#137a80', '#c9c8c0'],
        ['#6b6f80', '#dc4b57', '#2f9a6d', '#c08714', '#3d7fd4', '#a65bd0', '#1f969c', '#ffffff']
      )
    }
  },
  {
    id: 'ember',
    name: 'Ember',
    note: 'тёплый графит',
    theme: {
      background: '#151311', foreground: '#e6e1d9', cursor: '#f5a524', cursorAccent: '#151311', selectionBackground: '#f5a52440',
      ...ansi(
        ['#24211e', '#f2665a', '#9bd67a', '#f5a524', '#5ab0ff', '#d48ad6', '#5cd1c4', '#e6e1d9'],
        ['#5e5850', '#ff8c80', '#b8e89c', '#ffc35c', '#8ccaff', '#e6aee8', '#86e3d8', '#fbf8f3']
      )
    }
  },
  {
    id: 'glacier',
    name: 'Glacier',
    note: 'холодный синий',
    theme: {
      background: '#0a1220', foreground: '#7cc4ff', cursor: '#7cc4ff', cursorAccent: '#0a1220', selectionBackground: '#7cc4ff40',
      ...ansi(
        ['#16223a', '#ff6f7d', '#4fd6be', '#ffd479', '#4aa8ff', '#b39dff', '#5ad1f0', '#cfe3ff'],
        ['#40557a', '#ff95a0', '#7ae6d3', '#ffe2a3', '#82c3ff', '#cdbdff', '#8be2f7', '#f0f7ff']
      )
    }
  },
  {
    id: 'phosphor',
    name: 'Phosphor',
    note: 'зелёный ЭЛТ',
    theme: {
      background: '#050a05', foreground: '#39ff6a', cursor: '#39ff6a', cursorAccent: '#050a05', selectionBackground: '#39ff6a40',
      ...ansi(
        ['#0d1a0d', '#ff5f56', '#39ff6a', '#d7ff3c', '#3cc8ff', '#b06cff', '#2ef2c0', '#b9ffc9'],
        ['#2b4a2b', '#ff877f', '#7dff9c', '#e8ff7f', '#7fdcff', '#c99cff', '#7ff7d7', '#e9ffee']
      )
    }
  },
  {
    id: 'cinder',
    name: 'Cinder',
    note: 'красный',
    theme: {
      background: '#140707', foreground: '#ff6b5e', cursor: '#ff6b5e', cursorAccent: '#140707', selectionBackground: '#ff6b5e40',
      ...ansi(
        ['#2a1212', '#ff4d4d', '#8fd16a', '#ffb347', '#6aa8ff', '#e07ad6', '#5cc8c8', '#f0d5d2'],
        ['#5c3030', '#ff7a7a', '#b0e590', '#ffcb7a', '#94c1ff', '#eda2e6', '#8ae0e0', '#fff1ef']
      )
    }
  }
]

export const DEFAULT_TERM_THEME = 'navy-green'

export function termThemeById(id: string): TermTheme | undefined {
  return TERM_THEMES.find((t) => t.id === id)
}
