# Generates src/renderer/src/lib/termThemesExtra.ts from Windows Terminal JSON files of
# iTerm2-Color-Schemes (MIT): https://github.com/mbadolato/iTerm2-Color-Schemes/tree/master/windowsterminal
# Usage: download the listed files as dl-<name>.json into a folder, then: python3 -I scripts/gen-themes.py <folder> > src/renderer/src/lib/termThemesExtra.ts
import json, re, sys, os
src = sys.argv[1]
HEX = re.compile(r'^#[0-9a-fA-F]{6}$')
picks = [
  ('kanagawa-wave','Kanagawa Wave','Kanagawa Wave'),('kanagawa-dragon','Kanagawa Dragon','Kanagawa Dragon'),('kanagawa-lotus','Kanagawa Lotus','Kanagawa Lotus'),
  ('flexoki-dark','Flexoki Dark','Flexoki Dark'),('flexoki-light','Flexoki Light','Flexoki Light'),
  ('everforest-dark','Everforest Dark','Everforest Dark Hard'),('everforest-light','Everforest Light','Everforest Light Med'),
  ('solarized-dark','Solarized Dark','iTerm2 Solarized Dark'),('solarized-light','Solarized Light','iTerm2 Solarized Light'),
  ('dracula','Dracula','Dracula'),('monokai','Monokai','Monokai Classic'),('monokai-pro','Monokai Pro','Monokai Pro'),
  ('nord-dark','Nord Dark','Nord'),('nord-light','Nord Light','Nord Light'),
  ('gruvbox-dark','Gruvbox Dark','Gruvbox Dark'),('gruvbox-light','Gruvbox Light','Gruvbox Light'),
  ('material-dark','Material Dark','Material Dark'),('material-light','Material Light','Material'),
  ('homebrew','Homebrew','Homebrew'),('grass','Grass','Grass'),('man-page','Man Page','Man Page'),('novel','Novel','Novel'),
  ('ocean','Ocean','Ocean'),('pro','Pro','Pro'),('red-sands','Red Sands','Red Sands'),('apple-classic','Apple Classic','Apple Classic'),
]
keys = [('black','black'),('red','red'),('green','green'),('yellow','yellow'),('blue','blue'),('purple','magenta'),('cyan','cyan'),('white','white'),
        ('brightBlack','brightBlack'),('brightRed','brightRed'),('brightGreen','brightGreen'),('brightYellow','brightYellow'),('brightBlue','brightBlue'),('brightPurple','brightMagenta'),('brightCyan','brightCyan'),('brightWhite','brightWhite')]
def lum(h):
    r,g,b=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    return 0.2126*r+0.7152*g+0.0722*b
out=['// Generated from iTerm2-Color-Schemes (MIT, (c) Mark Badolato and contributors), Windows Terminal format.','// Regenerate with scripts in the repo history; values are validated #rrggbb.','import type { TermTheme } from \'./termThemes\'','','export const EXTRA_THEMES: TermTheme[] = [']
for tid,name,file in picks:
    d=json.load(open(os.path.join(src,f'dl-{file}.json')))
    t={}
    for a,b in keys:
        v=d[a]; assert HEX.match(v),(file,a,v); t[b]=v.lower()
    bg=d['background'].lower(); fg=d['foreground'].lower()
    cur=(d.get('cursorColor') or fg).lower(); sel=(d.get('selectionBackground') or fg).lower()
    for v in (bg,fg,cur,sel): assert HEX.match(v),(file,v)
    light = lum(bg) > 0.5
    theme={'background':bg,'foreground':fg,'cursor':cur,'cursorAccent':bg,'selectionBackground':sel+'66',**t}
    out.append(f"  {{ id: '{tid}', name: '{name}', note: '{'светлая' if light else 'тёмная'}', light: {str(light).lower()}, theme: {json.dumps(theme)} }},")
out.append(']')
print('\n'.join(out))
