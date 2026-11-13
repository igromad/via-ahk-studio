// Gerador de esqueleto AutoHotkey v2. Nenhuma ação é executada ou preenchida.
(function (root) {
  'use strict';

  const MODIFIERS = { S: '+', C: '^', A: '!', G: '#', W: '#', LSFT: '+', RSFT: '+', LCTL: '^', RCTL: '^', LALT: '!', RALT: '!', LGUI: '#', RGUI: '#' };
  const KEY_NAMES = {
    ENT: 'Enter', ESC: 'Escape', BSPC: 'Backspace', DEL: 'Delete', TAB: 'Tab',
    SPC: 'Space', CAPS: 'CapsLock', LEFT: 'Left', RIGHT: 'Right', UP: 'Up',
    DOWN: 'Down', HOME: 'Home', END: 'End', PGUP: 'PgUp', PGDN: 'PgDn', INS: 'Insert',
    PSCR: 'PrintScreen', SLCK: 'ScrollLock', PAUS: 'Pause', NLCK: 'NumLock',
    LCTL: 'LControl', RCTL: 'RControl', LSFT: 'LShift', RSFT: 'RShift',
    LALT: 'LAlt', RALT: 'RAlt', LGUI: 'LWin', RGUI: 'RWin',
    MUTE: 'Volume_Mute', VOLU: 'Volume_Up', VOLD: 'Volume_Down',
    MPLY: 'Media_Play_Pause', MNXT: 'Media_Next', MPRV: 'Media_Prev', MSTP: 'Media_Stop',
    WBAK: 'Browser_Back', WFWD: 'Browser_Forward', WREF: 'Browser_Refresh', WHOM: 'Browser_Home'
  };

  function parseCode(input) {
    const original = String(input ?? '');
    let code = original.trim().toUpperCase();
    if (!code || code === 'KC_NO' || code === 'XXXXXXX') return { supported: false, original, reason: 'vazio ou tecla sem ação' };

    let modifierSymbols = '';
    // Accept nested QMK wrappers, e.g. C(A(KC_F1)), and combined wrappers CASG(...).
    while (true) {
      const match = code.match(/^([A-Z]+)\((.*)\)$/);
      if (!match) break;
      if (MODIFIERS[match[1]]) modifierSymbols += MODIFIERS[match[1]];
      else if (/^[SCAGW]+$/.test(match[1])) { for (const mod of match[1]) modifierSymbols += MODIFIERS[mod]; }
      else break;
      code = match[2].trim();
    }
    if (!code.startsWith('KC_')) return { supported: false, original, reason: 'keycode QMK não reconhecido' };
    const name = code.slice(3);
    let key;
    if (/^F(?:[1-9]|1\d|2[0-4])$/.test(name)) key = name;
    else if (/^[A-Z]$/.test(name) || /^[0-9]$/.test(name)) key = name;
    else key = KEY_NAMES[name];
    if (!key) return { supported: false, original, reason: 'tecla fora do conjunto compatível' };
    // AHK expects modifier prefixes in Shift, Ctrl, Alt, Win order.
    const ordered = ['+', '^', '!', '#'].filter((symbol) => modifierSymbols.includes(symbol)).join('');
    return { supported: true, original, key, modifiers: ordered, hotkey: ordered + key };
  }

  function generate(layer) {
    if (!Array.isArray(layer)) throw new TypeError('A camada precisa ser um array de keycodes.');
    const lines = [
      '; AutoHotkey v2 — esqueleto gerado a partir de uma camada VIA/QMK.',
      '; Descomente e edite apenas os blocos que deseja ativar.',
      '#Requires AutoHotkey v2.0',
      '#SingleInstance Force',
      ''
    ];
    const conflicts = [];
    const unsupported = [];
    const seen = new Map();
    layer.forEach((raw, index) => {
      const parsed = parseCode(raw);
      if (!parsed.supported) {
        unsupported.push({ index, code: parsed.original, reason: parsed.reason });
        return;
      }
      if (seen.has(parsed.hotkey)) {
        conflicts.push({ hotkey: parsed.hotkey, indices: [seen.get(parsed.hotkey), index], codes: [layer[seen.get(parsed.hotkey)], parsed.original] });
      } else seen.set(parsed.hotkey, index);
      // The source keycode is retained verbatim in a comment for manual review.
      lines.push(`; índice ${index} — ${parsed.original}`);
      lines.push(`; ${parsed.hotkey}::{`);
      lines.push(';     ; Adicione sua ação aqui');
      lines.push('; }');
      lines.push('');
    });
    return { content: lines.join('\n'), conflicts, unsupported };
  }

  root.AhkGenerator = Object.freeze({ parseCode, generate });
})(window);

