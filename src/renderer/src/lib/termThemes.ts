import type { ITheme } from '@xterm/xterm'
import type { ThemeName } from '@/store/sessions'

export const termThemes: Record<ThemeName, ITheme> = {
  harbor: {
    background: '#0b0e14',
    foreground: '#d7dde8',
    cursor: '#2dd4bf',
    cursorAccent: '#0b0e14',
    selectionBackground: '#2dd4bf40',
    black: '#1a2130',
    red: '#ff6b6b',
    green: '#5eea9a',
    yellow: '#f9d266',
    blue: '#6aa8ff',
    magenta: '#c792ea',
    cyan: '#2dd4bf',
    white: '#d7dde8',
    brightBlack: '#4b566b',
    brightRed: '#ff8f8f',
    brightGreen: '#86f3b7',
    brightYellow: '#ffe08f',
    brightBlue: '#94c1ff',
    brightMagenta: '#dcb4f5',
    brightCyan: '#6ee7d6',
    brightWhite: '#f4f7fb'
  },
  ember: {
    background: '#121110',
    foreground: '#e6e1d9',
    cursor: '#f5a524',
    cursorAccent: '#121110',
    selectionBackground: '#f5a52440',
    black: '#24211e',
    red: '#f2665a',
    green: '#9bd67a',
    yellow: '#f5a524',
    blue: '#5ab0ff',
    magenta: '#d48ad6',
    cyan: '#5cd1c4',
    white: '#e6e1d9',
    brightBlack: '#5e5850',
    brightRed: '#ff8c80',
    brightGreen: '#b8e89c',
    brightYellow: '#ffc35c',
    brightBlue: '#8ccaff',
    brightMagenta: '#e6aee8',
    brightCyan: '#86e3d8',
    brightWhite: '#fbf8f3'
  }
}
