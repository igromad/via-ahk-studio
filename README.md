# VIA-AHK Studio

Visualize VIA keyboard layouts and edit AutoHotkey actions for keys and encoders. VIA-AHK Studio complements VIA: it uses exported JSON files and does not directly change your device firmware or keymap.

## Requirements

- Windows with Windows PowerShell (included with Windows) and a web browser.
- The keyboard definition JSON and keymap JSON exported from VIA.
- AutoHotkey v1 or v2 to run actions in the corresponding `.ahk` file.

Python, Node.js, and additional libraries are not required.

## Getting started

1. Open `Iniciar.bat`. The local server starts minimized and opens the app in your browser.
2. Under **Files**, select the keyboard definition JSON and VIA keymap JSON.
3. Under **AutoHotkey file**, choose v1 or v2 and select or create an `.ahk` file.
4. Click a key or an encoder area to view or edit its action and comment.
5. Use the tabs at the top to create, arrange, and switch between macroboard profiles. Each profile stores its own JSON files and a reference to its selected AHK file; profiles can also share an AHK file.

Hold **Alt** to temporarily toggle comments. You can also change the layout rotation, accent color, and theme in the interface. Use the language button in the top bar to switch between English and Portuguese; the app remembers your choice.

## Local server

The app uses a local server on port `8765`. Keep its window open while using the app. Restore the minimized window and press **R** to restart or **X** to exit. The server also shuts down after a period without contact from an app tab.

## Files and backups

Profiles and copies of the JSON files are stored locally in `%LOCALAPPDATA%\KM16proStudio`. The AHK file stays in the location you choose. When you save an action, the app creates a `.bak` copy of the previous file and preserves its detected encoding. New AHK files use UTF-8 with BOM.

When saving, the app attempts to request a reload of any running instance of the AHK file. Switching between v1 and v2 does not convert existing code.

## Limitations

This project is a prototype. Some AHK structures and contexts may need to be edited in an external editor. Review actions before running them. Keys that share an AHK block also share edits made to that block.
