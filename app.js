// Visualizador de keymaps VIA. Carregado como módulo após o HTML.
const $ = (id) => document.getElementById(id);
const definitionInput = $('definition-file');
const mappingInput = $('mapping-file');
const layerSelect = $('layer-select');
const keyboard = $('keyboard');
const keyboardFrame = $('keyboard-frame');
const rotationSelect = $('rotation-select');
const rotateLeft = $('rotate-left');
const rotateRight = $('rotate-right');
const details = $('details');
const status = $('status');
const profileSelect = $('profile-select');
const profileTabs = $('profile-tabs');
const profileCreate = $('profile-create');
const profileDialog = $('profile-dialog');
const profileForm = $('profile-form');
const profileNameInput = $('profile-name');

let definition = null;
let mapping = null;
let selected = null;
let lastLayer = 0;
let apiToken = null;
const actionCode = $('action-code'), actionComment = $('action-comment'), actionSave = $('action-save'), actionOpen = $('action-open'), actionRefresh = $('action-refresh'), actionStatus = $('action-status');
const ahkVersionSelect = $('ahk-version');
const ahkChoose = $('ahk-choose');
const ahkCreate = $('ahk-create');
const ahkFileLabel = $('ahk-file-label');
const ahkCard = document.querySelector('.ahk-card');
const ahkCardToggle = $('ahk-card-toggle');
function showAhkFile(path) {
  if (ahkFileLabel) { ahkFileLabel.textContent = path ? path.split(/[\\/]/).pop() : 'Nenhum arquivo selecionado'; ahkFileLabel.title = path || ''; }
  ahkCard?.classList.toggle('has-file', Boolean(path));
  if (!path) ahkCard?.classList.add('expanded');
  ahkCardToggle?.setAttribute('aria-expanded', String(!path || ahkCard?.classList.contains('expanded')));
}
ahkCardToggle?.addEventListener('click', () => { ahkCard?.classList.toggle('expanded'); ahkCardToggle.setAttribute('aria-expanded', String(ahkCard?.classList.contains('expanded'))); });
const actionContext = $('action-context');
let currentTrigger = null, actionDirty = false, actionRequest = 0;
let ahkVersion = '1', versionRequest = 0;
let nextAhkVersion = '1';
let activeContext = '';
let actionContexts = [];
let activeProfileId = '';
const apiAvailable = location.protocol !== 'file:';
const ROTATION_STORAGE_KEY = 'km16pro-layout-rotation';
let layoutRotation = 0;
try {
  const savedRotation = Number(localStorage.getItem(ROTATION_STORAGE_KEY));
  if ([0, 90, 180, 270].includes(savedRotation)) layoutRotation = savedRotation;
} catch { /* armazenamento indisponível: usa a orientação padrão */ }
if (rotationSelect) rotationSelect.value = String(layoutRotation);
if ($('rotation-label')) $('rotation-label').textContent = `${layoutRotation}°`;
let visualRotation = layoutRotation;

function applyLayoutRotation() {
  if (!keyboard || !keyboardFrame) return;
  const width = keyboard.offsetWidth;
  const height = keyboard.offsetHeight;
  const quarterTurn = layoutRotation % 180 !== 0;
  keyboard.style.left = '50%';
  keyboard.style.top = '50%';
  keyboard.style.transform = `translate(-50%, -50%) rotate(${visualRotation}deg)`;
  keyboardFrame.style.width = `${quarterTurn ? height : width}px`;
  keyboardFrame.style.height = `${quarterTurn ? width : height}px`;
  keyboardFrame.style.setProperty('--layout-rotation', `${layoutRotation}deg`);
  keyboard.querySelectorAll('.keyboard-key').forEach((key) => {
    key.style.setProperty('--content-counter-rotation', `${-visualRotation}deg`);
  });
}
function setLayoutRotation(value) {
  const next = ((value % 360) + 360) % 360;
  let delta = ((next - layoutRotation + 540) % 360) - 180;
  if (delta === -180 && value - layoutRotation > 0) delta = 180;
  visualRotation += delta;
  layoutRotation = next;
  $('rotation-label').textContent = `${layoutRotation}°`;
  if (rotationSelect) rotationSelect.value = String(layoutRotation);
  try { localStorage.setItem(ROTATION_STORAGE_KEY, String(layoutRotation)); } catch { /* sessão atual continua funcionando */ }
  if (keyboardFrame && !keyboardFrame.classList.contains('rotation-ready')) {
    void keyboardFrame.offsetWidth;
    keyboardFrame.classList.add('rotation-ready');
  }
  applyLayoutRotation();
}
rotationSelect?.addEventListener('change', () => setLayoutRotation(Number(rotationSelect.value) || 0));
rotateLeft?.addEventListener('click', () => setLayoutRotation(layoutRotation - 90));
rotateRight?.addEventListener('click', () => setLayoutRotation(layoutRotation + 90));
window.addEventListener('resize', () => applyLayoutRotation());

function actionTrigger(item = selected, layer = activeLayer()) {
  if (item?.direction !== undefined && Number.isInteger(item.encoderIndex)) {
    const parsed = window.AhkGenerator.parseCode(mapping?.encoders?.[item.encoderIndex]?.[layer]?.[item.direction]);
    return parsed.supported ? parsed.hotkey : null;
  }
  if (item?.type !== 'key' || !Number.isInteger(item.index)) return null;
  const parsed = window.AhkGenerator.parseCode(mapping?.layers?.[layer]?.[item.index]);
  return parsed.supported ? parsed.hotkey : null;
}
function actionMessage(message, error = false) {
  if (actionStatus) { actionStatus.textContent = message; actionStatus.dataset.state = error ? 'error' : 'info'; }
}
async function requestJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json()).error || ''; } catch {}
    throw new Error(`Servidor respondeu ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return response.json();
}
function postHeaders() { return { 'Content-Type': 'application/json', 'X-KM16-Token': apiToken || '' }; }
async function saveAction() {
  if (!currentTrigger || !actionDirty) return true;
  try {
    const result = await requestJson('/api/action', { method: 'POST', headers: postHeaders(), body: JSON.stringify({ trigger: currentTrigger, context: activeContext, code: actionCode.value, comment: actionComment?.value || '' }) });
    actionDirty = false;
    const message = result.reload === 'requested' ? 'Ação salva. Recarregamento solicitado ao AutoHotkey.' : result.reload === 'error' ? 'Ação salva, mas não foi possível solicitar o recarregamento do AutoHotkey.' : 'Ação salva. Nenhuma instância deste arquivo foi identificada em execução.';
    actionMessage(message, result.reload === 'error'); refreshActionStates(); return true;
  } catch (error) { actionMessage(`Não foi possível salvar: ${error.message}`, true); return false; }
}
async function leaveAction() {
  if (await saveAction()) return true;
  if (!window.confirm('Não foi possível salvar. Descartar as alterações não salvas para continuar?')) return false;
  actionDirty = false;
  return true;
}
async function loadAction(trigger) {
  const request = ++actionRequest;
  currentTrigger = trigger; actionDirty = false;
  if (actionCode) actionCode.value = '';
  if (actionComment) actionComment.value = '';
  if (actionSave) actionSave.disabled = !trigger || !apiAvailable;
  if (actionOpen) actionOpen.disabled = !trigger || !apiAvailable;
  if (actionRefresh) actionRefresh.disabled = !trigger || !apiAvailable;
  if (!apiAvailable) { actionMessage('Inicie o aplicativo local para carregar e salvar ações. Abrir este arquivo diretamente (file://) não permite acesso à API.', true); return; }
  if (!trigger) { actionMessage('Selecione uma tecla mapeada para AutoHotkey.'); return; }
  actionMessage('Carregando ação…');
  try {
    const query = new URLSearchParams({ trigger, context: activeContext });
    const result = await requestJson(`/api/action?${query}`);
    if (request !== actionRequest) return;
    actionCode.value = result.code || '';
    if (actionComment) actionComment.value = result.comment || '';
    refreshActionStates();
    const codes = mapping?.layers?.[activeLayer()] || [];
    const parsed = codes.map((code) => window.AhkGenerator.parseCode(code));
    const unsupported = parsed.filter((entry) => !entry.supported).length;
    const hotkeys = new Map();
    parsed.forEach((entry, index) => { if (entry.supported) hotkeys.set(entry.hotkey, [...(hotkeys.get(entry.hotkey) || []), index]); });
    const conflicts = [...hotkeys.values()].filter((indices) => indices.length > 1).length;
    const selectedCode = window.AhkGenerator.parseCode(codes[selected?.index]);
    actionMessage(`${selectedCode.supported ? `Atalho ${selectedCode.hotkey} compatível.` : `Código não compatível: ${selectedCode.reason}.`} ${conflicts} conflito(s) na camada; ${unsupported} código(s) não compatível(is).`);
  } catch (error) { if (request === actionRequest) actionMessage(`Não foi possível carregar a ação: ${error.message}`, true); }
}
actionCode?.addEventListener('input', () => { actionDirty = true; });
actionComment?.addEventListener('input', () => { actionDirty = true; });
actionSave?.addEventListener('click', saveAction);
async function refreshContexts() {
  if (!apiAvailable || !apiToken) return;
  const state = await requestJson('/api/state');
  renderContexts(state.contexts || [], activeContext);
  showAhkFile(state.actionFile);
}
actionRefresh?.addEventListener('click', async () => {
  if (actionDirty && !window.confirm('Há alterações não salvas. Descartar e atualizar pelo arquivo externo?')) return;
  try { await refreshContexts(); refreshActionStates(); loadAction(currentTrigger); }
  catch (error) { actionMessage(`Não foi possível atualizar: ${error.message}`, true); }
});
actionOpen?.addEventListener('click', async () => {
  try {
    await requestJson('/api/open-editor', { method: 'POST', headers: postHeaders(), body: JSON.stringify({ trigger: currentTrigger, context: activeContext }) });
    actionMessage('Ação aberta no editor configurado.');
  } catch (error) { actionMessage(`Não foi possível abrir o editor: ${error.message}`, true); }
});

function renderContexts(contexts = [], selectedContext = activeContext) {
  actionContexts = Array.isArray(contexts) ? contexts : [];
  if (!actionContext) return;
  const previous = selectedContext || actionContext.value;
  actionContext.replaceChildren();
  actionContexts.forEach((context) => {
    const option = document.createElement('option');
    option.value = context.id;
    option.textContent = context.label || context.id;
    actionContext.append(option);
  });
  const available = actionContexts.some(({ id }) => id === previous);
  activeContext = available ? previous : (actionContexts[0]?.id || 'global');
  actionContext.value = activeContext;
  actionContext.disabled = actionContexts.length < 2 || !apiToken;
}

function renderProfiles(profiles = [], selectedId = activeProfileId) {
  if (!profileSelect) return;
  profileSelect.replaceChildren();
  const flatten = (items) => Array.isArray(items) ? items.flatMap(flatten)
    : items?.id ? [items] : items?.value ? flatten(items.value) : [];
  const entries = flatten(profiles);
  entries.forEach((profile) => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name || 'Macroboard';
    profileSelect.append(option);
  });
  activeProfileId = [...profileSelect.options].some(({ value }) => value === selectedId)
    ? selectedId : (profileSelect.options[0]?.value || '');
  profileSelect.value = activeProfileId;
  profileSelect.disabled = !apiToken || profileSelect.options.length < 2;
  if (profileTabs) {
    profileTabs.replaceChildren();
    entries.forEach((profile) => {
      const tab = document.createElement('div'); tab.className = `profile-tab${profile.id === activeProfileId ? ' active' : ''}`;
      tab.draggable = entries.length > 1; tab.dataset.profileId = profile.id;
      tab.addEventListener('dragstart', event => { if (event.target.closest('.profile-menu')) { event.preventDefault(); return; } event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', profile.id); tab.classList.add('dragging'); });
      tab.addEventListener('dragend', () => { tab.classList.remove('dragging'); profileTabs.querySelectorAll('.drop-before,.drop-after').forEach(el => el.classList.remove('drop-before','drop-after')); });
      tab.addEventListener('dragover', event => { if (!event.dataTransfer.types.includes('text/plain')) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; const before = event.clientX < tab.getBoundingClientRect().left + tab.offsetWidth / 2; tab.classList.toggle('drop-before', before); tab.classList.toggle('drop-after', !before); });
      tab.addEventListener('dragleave', () => tab.classList.remove('drop-before','drop-after'));
      tab.addEventListener('drop', async event => { event.preventDefault(); const source = event.dataTransfer.getData('text/plain'); const from = entries.findIndex(item => item.id === source); const to = entries.findIndex(item => item.id === profile.id); const before = event.clientX < tab.getBoundingClientRect().left + tab.offsetWidth / 2; tab.classList.remove('drop-before','drop-after'); if (from < 0 || to < 0 || from === to) return; const reordered = [...entries]; const [moved] = reordered.splice(from, 1); let position = reordered.findIndex(item => item.id === profile.id); if (!before) position++; reordered.splice(position, 0, moved); try { const result = await requestJson('/api/profile/reorder', {method:'POST', headers:postHeaders(), body:JSON.stringify({ids:reordered.map(item => item.id)})}); renderProfiles(result.profiles, result.profileId); } catch (error) { actionMessage(`Não foi possível reordenar os perfis: ${error.message}`, true); } });
      const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'profile-tab-name'; choose.textContent = profile.name; choose.setAttribute('aria-current', profile.id === activeProfileId ? 'page' : 'false');
      choose.addEventListener('click', () => { if (profile.id !== activeProfileId) { profileSelect.value = profile.id; profileSelect.dispatchEvent(new Event('change')); } });
      const menu = document.createElement('details'); menu.className = 'profile-menu';
      const toggle = document.createElement('summary'); toggle.textContent = '⋯'; toggle.setAttribute('aria-label', `Opções do perfil ${profile.name}`);
      const actions = document.createElement('div'); actions.className = 'profile-menu-actions';
      menu.addEventListener('toggle', () => { if (menu.open) { const r = toggle.getBoundingClientRect(); actions.style.top = `${r.bottom + 5}px`; actions.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 158))}px`; } });
      const rename = document.createElement('button'); rename.type = 'button'; rename.textContent = 'Renomear';
      rename.addEventListener('click', () => {
        menu.open = false;
        renamingProfile = { id: profile.id, name: profile.name };
        $('profile-rename-name').value = profile.name;
        $('profile-rename-error').hidden = true;
        $('profile-rename-dialog').showModal();
        $('profile-rename-name').focus();
        $('profile-rename-name').select();
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Excluir perfil'; remove.disabled = entries.length < 2;
      remove.addEventListener('click', async () => { menu.open = false; if (!window.confirm(`Excluir o perfil “${profile.name}”? Os arquivos JSON e AHK serão mantidos no computador.`)) return; if (!(await leaveAction())) return; try { await requestJson('/api/profile/delete', {method:'POST',headers:postHeaders(),body:JSON.stringify({id:profile.id})}); selected = null; currentTrigger = null; actionDirty = false; await loadAction(null); await restoreState(); renderDetails(); actionMessage('Perfil removido. Os arquivos foram mantidos.'); } catch (error) { actionMessage(`Não foi possível excluir: ${error.message}`, true); } });
      actions.append(rename, remove); menu.append(toggle, actions); tab.append(choose, menu); profileTabs.append(tab);
    });
  }
}

let renamingProfile = null;
$('profile-rename-cancel')?.addEventListener('click', () => $('profile-rename-dialog').close());
$('profile-rename-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const profile = renamingProfile;
  const name = $('profile-rename-name').value.trim();
  const errorBox = $('profile-rename-error');
  if (!profile || !name) { errorBox.textContent = 'Informe um nome para o perfil.'; errorBox.hidden = false; return; }
  if (name === profile.name) { $('profile-rename-dialog').close(); return; }
  const saveButton = $('profile-rename-save');
  saveButton.disabled = true; errorBox.hidden = true;
  try {
    const result = await requestJson('/api/profile/rename', { method: 'POST', headers: postHeaders(), body: JSON.stringify({ id: profile.id, name }) });
    renderProfiles(result.profiles || [], result.profileId || activeProfileId);
    $('profile-rename-dialog').close();
    actionMessage(`Perfil renomeado para “${name}”.`);
  } catch (error) {
    errorBox.textContent = `Não foi possível renomear: ${error.message}`;
    errorBox.hidden = false;
  } finally { saveButton.disabled = false; }
});

const themeToggle = $('theme-toggle');
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (themeToggle) { themeToggle.textContent = theme === 'dark' ? '☀' : '☾'; themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo noturno'); }
  try { localStorage.setItem('via-studio-theme', theme); } catch {}
}
let savedTheme = 'light'; try { savedTheme = localStorage.getItem('via-studio-theme') || 'light'; } catch {}
setTheme(savedTheme === 'dark' ? 'dark' : 'light');
themeToggle?.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
const accentNames = ['green', 'blue', 'red', 'purple', 'orange'];
function setAccent(name) {
  const accent = accentNames.includes(name) ? name : 'green';
  document.documentElement.dataset.accent = accent;
  document.querySelectorAll('[data-accent]').forEach((button) => { if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(button.dataset.accent === accent)); });
  try { localStorage.setItem('via-studio-accent', accent); } catch {}
}
let savedAccent = 'green'; try { savedAccent = localStorage.getItem('via-studio-accent') || 'green'; } catch {}
setAccent(savedAccent);
document.querySelectorAll('.palette-options button').forEach((button) => button.addEventListener('click', () => { setAccent(button.dataset.accent); button.closest('details').open = false; }));

profileCreate?.addEventListener('click', async () => {
  if (!(await leaveAction())) return;
  profileNameInput.value = '';
  if (profileDialog?.showModal) {
    profileDialog.showModal();
    profileNameInput?.focus();
  } else {
    const name = window.prompt('Nome do novo perfil de macroboard:');
    if (name?.trim()) createProfile(name.trim());
  }
});
async function createProfile(name) {
  profileCreate.disabled = true;
  try {
    const result = await requestJson('/api/profiles', {
      method: 'POST', headers: postHeaders(), body: JSON.stringify({ name }),
    });
    selected = null; currentTrigger = null; actionDirty = false;
    await loadAction(null);
    await restoreState();
    renderDetails();
    actionMessage(`Perfil “${result.profileName || name}” criado. Agora carregue os JSON deste macroboard.`);
  } catch (error) {
    actionMessage(`Não foi possível criar o perfil: ${error.message}`, true);
  } finally { profileCreate.disabled = !apiToken; }
}
profileForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = profileNameInput.value.trim();
  if (!name) return;
  profileDialog?.close();
  await createProfile(name);
});
const profileCancel = $('profile-cancel');
profileCancel?.addEventListener('click', () => profileDialog?.close());

profileSelect?.addEventListener('change', async () => {
  if (!(await leaveAction())) { profileSelect.value = activeProfileId; return; }
  try {
    await requestJson('/api/profile/select', {
      method: 'POST', headers: postHeaders(), body: JSON.stringify({ id: profileSelect.value }),
    });
    selected = null; currentTrigger = null; actionDirty = false; activeContext = '';
    await loadAction(null);
    await restoreState();
    renderDetails();
    actionMessage('Perfil carregado. Definição, mapeamento e arquivo AHK são próprios deste macroboard.');
  } catch (error) {
    actionMessage(`Não foi possível abrir o perfil: ${error.message}`, true);
    await restoreState();
  }
});

let stateRequest = 0;
const descriptionTooltip = document.createElement('div');
descriptionTooltip.id = 'key-description-tooltip';
descriptionTooltip.className = 'key-description-tooltip';
descriptionTooltip.setAttribute('role', 'tooltip');
descriptionTooltip.hidden = true;
document.body.append(descriptionTooltip);
let tooltipTarget = null, hoveredKey = null, focusedKey = null;
const commentsToggle = $('comments-toggle');
const commentsOverlay = document.createElement('div');
commentsOverlay.className = 'comments-overlay';
document.body.append(commentsOverlay);
let commentsVisible = false, altComments = false;
function updateCommentsOverlay() {
  const visible = commentsVisible !== altComments;
  commentsToggle?.setAttribute('aria-pressed', String(commentsVisible));
  if (commentsToggle) commentsToggle.textContent = commentsVisible ? 'Esconder' : 'Mostrar';
  commentsOverlay.replaceChildren();
  if (!visible) return;
  keyboard.querySelectorAll('.keyboard-key:not(.encoder-key)[data-description]').forEach(target => {
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const label = document.createElement('span');
    label.className = 'comment-overlay-label';
    const text = document.createElement('span');
    text.textContent = target.dataset.description;
    label.append(text);
    Object.assign(label.style, {left: `${rect.left + 3}px`, top: `${rect.top + rect.height * .48}px`, width: `${Math.max(0, rect.width - 6)}px`, height: `${Math.max(0, rect.height * .52 - 4)}px`});
    commentsOverlay.append(label);
  });
  const occupied = [];
  keyboard.querySelectorAll('.encoder-key').forEach(knob => {
    const actions = [...knob.querySelectorAll('.encoder-action[data-description]')];
    if (!actions.length) return;
    const rect = knob.getBoundingClientRect();
    const panel = document.createElement('div');
    panel.className = 'comment-knob-panel';
    actions.forEach(target => {
      const row = document.createElement('div');
      const icon = document.createElement('b');
      icon.textContent = target.classList.contains('encoder-center') ? '●' : target.classList.contains('encoder-left') ? '↶' : '↷';
      const text = document.createElement('span'); text.textContent = target.dataset.description;
      row.append(icon, text); panel.append(row);
    });
    commentsOverlay.append(panel);
    const width = panel.offsetWidth, height = panel.offsetHeight;
    let left = Math.min(window.innerWidth - width - 8, rect.right + 8);
    let top = Math.max(8, Math.min(window.innerHeight - height - 8, rect.top));
    for (const other of occupied) if (left < other.right && left + width > other.left && top < other.bottom && top + height > other.top) top = Math.min(window.innerHeight - height - 8, other.bottom + 6);
    Object.assign(panel.style, {left: `${left}px`, top: `${top}px`});
    occupied.push({left, right: left + width, top, bottom: top + height});
  });
}
commentsToggle?.addEventListener('click', () => { commentsVisible = !commentsVisible; updateCommentsOverlay(); });
window.addEventListener('keydown', event => { if (event.key === 'Alt' && !altComments) { altComments = true; updateCommentsOverlay(); } });
window.addEventListener('keyup', event => { if (event.key === 'Alt') { altComments = false; updateCommentsOverlay(); } });
window.addEventListener('blur', () => { altComments = false; updateCommentsOverlay(); });
window.addEventListener('scroll', updateCommentsOverlay, true);
window.addEventListener('resize', updateCommentsOverlay);
function animateCommentPositions() { if (commentsVisible !== altComments) updateCommentsOverlay(); requestAnimationFrame(animateCommentPositions); }
requestAnimationFrame(animateCommentPositions);
function hideKeyDescription() { descriptionTooltip.hidden = true; tooltipTarget = null; }
function showKeyDescription(target) {
  const description = target?.dataset.description;
  if (!description || !target.isConnected) { hideKeyDescription(); return; }
  tooltipTarget = target; descriptionTooltip.textContent = description; descriptionTooltip.hidden = false;
  const rect = target.getBoundingClientRect(), box = descriptionTooltip.getBoundingClientRect(), margin = 8;
  const left = Math.max(margin, Math.min(innerWidth - box.width - margin, rect.left + rect.width / 2 - box.width / 2));
  const top = rect.top >= box.height + margin * 2 ? rect.top - box.height - margin : Math.min(innerHeight - box.height - margin, rect.bottom + margin);
  descriptionTooltip.style.left = `${left}px`; descriptionTooltip.style.top = `${Math.max(margin, top)}px`;
}
function descriptionTarget(node) {
  if (!(node instanceof Element)) return null;
  const target = node.closest('.encoder-action, .keyboard-key:not(.encoder-key)');
  return target && keyboard.contains(target) ? target : null;
}
function setKeyDescription(target, description) {
  if (!target) return;
  target.removeAttribute('title');
  if (description) { target.dataset.description = description; target.setAttribute('aria-describedby', descriptionTooltip.id); }
  else { delete target.dataset.description; target.removeAttribute('aria-describedby'); }
  if (tooltipTarget === target || hoveredKey === target || focusedKey === target) showKeyDescription(target);
}
keyboard.addEventListener('pointerover', (event) => { const target = descriptionTarget(event.target); if (target !== descriptionTarget(event.relatedTarget)) { hoveredKey = target; showKeyDescription(target); } });
keyboard.addEventListener('pointerout', (event) => { if (descriptionTarget(event.target) !== descriptionTarget(event.relatedTarget)) { hoveredKey = null; hideKeyDescription(); } });
keyboard.addEventListener('focusin', (event) => { focusedKey = descriptionTarget(event.target); showKeyDescription(focusedKey); });
keyboard.addEventListener('focusout', () => { focusedKey = null; hideKeyDescription(); });
window.addEventListener('scroll', hideKeyDescription, true);
window.addEventListener('resize', hideKeyDescription);
async function refreshActionStates() {
  const request = ++stateRequest;
  if (!mapping || !apiAvailable || !apiToken) return;
  keyboard.querySelectorAll('.keyboard-key:not(.encoder-key), .encoder-action').forEach((target) => setKeyDescription(target, ''));
  const layer = activeLayer(), context = activeContext;
  const codes = [...(mapping.layers?.[layer] || [])];
  mapping.encoders?.forEach(encoder => { if (Array.isArray(encoder?.[layer])) codes.push(...encoder[layer]); });
  const triggers = [...new Set(codes.map(code => window.AhkGenerator.parseCode(code)).filter(p => p.supported).map(p => p.hotkey))];
  const results = await Promise.all(triggers.map(async trigger => {
    try {
      const query = new URLSearchParams({trigger, context});
      const data = await requestJson(`/api/action?${query}`);
      return [trigger, { hasAction: Boolean(data.code && data.code.trim()), comment: (data.comment || '').trim() }];
    } catch { return [trigger, null]; }
  }));
  if (request !== stateRequest || layer !== activeLayer() || context !== activeContext) return;
  const states = new Map(results);
  keyboard.querySelectorAll('.keyboard-key[data-index]').forEach(key => {
    const parsed = window.AhkGenerator.parseCode(mapping.layers?.[layer]?.[Number(key.dataset.index)]);
    const entry = parsed.supported ? states.get(parsed.hotkey) : null;
    const inactive = parsed.supported ? entry?.hasAction === false : true;
    const description = entry?.comment || '';
    if (key.classList.contains('encoder-key')) {
      key.classList.remove('key-inactive');
      key.querySelector('.encoder-center')?.classList.toggle('key-inactive', inactive);
      setKeyDescription(key.querySelector('.encoder-center'), description);
    } else { key.classList.toggle('key-inactive', inactive); setKeyDescription(key, description); }
  });
  keyboard.querySelectorAll('.encoder-action[data-encoder][data-direction]').forEach(button => {
    const code = mapping?.encoders?.[Number(button.dataset.encoder)]?.[layer]?.[Number(button.dataset.direction)];
    const parsed = window.AhkGenerator.parseCode(code);
    const entry = parsed.supported ? states.get(parsed.hotkey) : null;
    button.classList.toggle('key-inactive', parsed.supported ? entry?.hasAction === false : true);
    setKeyDescription(button, entry?.comment || '');
  });
}

actionContext?.addEventListener('change', async () => {
  if (!(await leaveAction())) {
    actionContext.value = activeContext;
    return;
  }
  activeContext = actionContext.value;
  refreshActionStates();
  loadAction(currentTrigger);
});

async function selectActionFile(mode, version) {
  if (!(await leaveAction())) return;
  try {
    const result = await requestJson('/api/select-file', {
      method: 'POST', headers: postHeaders(), body: JSON.stringify({ mode, version }),
    });
    if (result.cancelled) {
      actionMessage('Seleção de arquivo cancelada.');
      return;
    }
    if (result.contexts) renderContexts(result.contexts, activeContext);
    ahkCard?.classList.remove('expanded'); showAhkFile(result.actionFile);
    actionMessage(`Arquivo de ações selecionado: ${result.actionFile || ''}`);
    await restoreState();
    if (currentTrigger) loadAction(currentTrigger);
  } catch (error) {
    actionMessage(`Não foi possível selecionar o arquivo: ${error.message}`, true);
  }
}
function updateVersionBadge() { const badge = $('ahk-version-badge'), note = $('ahk-version-note'); if (badge) { badge.textContent = `v${nextAhkVersion}`; badge.title = nextAhkVersion === ahkVersion ? 'Versão do arquivo; clique para escolher a versão do próximo arquivo' : `Próximo arquivo: v${nextAhkVersion}. Arquivo atual: v${ahkVersion}`; badge.setAttribute('aria-label', badge.title); } if (note) { note.hidden = nextAhkVersion === ahkVersion; note.textContent = `Próximo arquivo: v${nextAhkVersion} · arquivo atual: v${ahkVersion}`; } }
$('ahk-version-badge')?.addEventListener('click', () => { nextAhkVersion = nextAhkVersion === '1' ? '2' : '1'; updateVersionBadge(); });
ahkChoose?.addEventListener('click', () => selectActionFile('open', nextAhkVersion));
ahkCreate?.addEventListener('click', () => selectActionFile('new', nextAhkVersion));
$('ahk-reuse-select')?.addEventListener('change', async (event) => { const id = event.target.value; if (!id || !(await saveAction())) return; try { await requestJson('/api/profile/reuse-ahk', {method:'POST',headers:postHeaders(),body:JSON.stringify({id})}); ahkCard?.classList.remove('expanded'); await restoreState(); if (currentTrigger) await loadAction(currentTrigger); actionMessage('Arquivo AHK vinculado ao perfil atual.'); } catch (error) { actionMessage(`Não foi possível usar o arquivo: ${error.message}`, true); } finally { event.target.value = ''; } });

async function restoreState() {
  if (!apiAvailable) {
    if (ahkVersionSelect) ahkVersionSelect.disabled = true;
    report('Inicie o aplicativo local para restaurar os arquivos; carregue os JSON manualmente neste modo.', 'info'); return;
  }
  try {
    const state = await requestJson('/api/state');
    apiToken = state.token || null;
    renderProfiles(state.profiles || [], state.profileId || activeProfileId);
    if (state.version === '1' || state.version === '2') ahkVersion = state.version;
    nextAhkVersion = ahkVersion; updateVersionBadge();
    const reuse = $('ahk-reuse-select'), wrap = $('ahk-reuse-wrap');
    if (reuse && wrap) { reuse.replaceChildren(new Option('Escolher perfil', '')); const flattenSources = (items) => Array.isArray(items) ? items.flatMap(flattenSources) : items?.id ? [items] : items?.value ? flattenSources(items.value) : []; flattenSources(state.ahkSources).filter((p) => p.id !== state.profileId).forEach((p) => reuse.add(new Option(`${p.name} · v${p.version}`, p.id))); wrap.hidden = reuse.options.length < 2; }
    if (ahkVersionSelect) { ahkVersionSelect.value = ahkVersion; ahkVersionSelect.disabled = !apiToken; }
    renderContexts(state.contexts || [], state.context || activeContext);
    showAhkFile(state.actionFile);
    [ahkChoose, ahkCreate].forEach((button) => { if (button) button.disabled = !apiToken; });
    if (profileCreate) profileCreate.disabled = !apiToken;
    definition = state.files?.['definition.json'] || null;
    mapping = state.files?.['mapping.json'] || null;
    renderLayers(); renderKeyboard(); updateStatus();
    const definitionName = document.querySelector('[data-file-name="definition"]');
    const mappingName = document.querySelector('[data-file-name="mapping"]');
    if (definitionName) definitionName.textContent = definition?.name || 'Escolher arquivo';
    if (mappingName) mappingName.textContent = mapping?.name || 'Escolher arquivo';
    if (state.actionFile) actionMessage(`Perfil ${state.profileName || ''} · ações: ${state.actionFile}`);
  } catch (error) {
    if (ahkVersionSelect) ahkVersionSelect.disabled = true;
    report(`Não foi possível restaurar o estado: ${error.message}`, 'error');
    actionMessage(`Não foi possível carregar a versão do AutoHotkey: ${error.message}`, true);
  }
}

async function changeAhkVersion() {
  if (!ahkVersionSelect || ahkVersionSelect.disabled) return;
  const requestedVersion = ahkVersionSelect.value;
  if (requestedVersion !== '1' && requestedVersion !== '2') {
    ahkVersionSelect.value = ahkVersion;
    actionMessage('Versão do AutoHotkey inválida; selecione v1 ou v2.', true);
    return;
  }
  if (requestedVersion === ahkVersion) return;
  const request = ++versionRequest;
  const previousVersion = ahkVersion;
  ahkVersionSelect.disabled = true;
  actionMessage('Atualizando a versão do AutoHotkey…');
  try {
    await requestJson('/api/version', {
      method: 'POST', headers: postHeaders(), body: JSON.stringify({ version: requestedVersion }),
    });
    if (request !== versionRequest) return;
    ahkVersion = requestedVersion;
    // Keep the current code and dirty flag intact: switching dialects never rewrites an action.
    actionMessage(`AutoHotkey v${ahkVersion} selecionado. O código existente não foi convertido.`);
  } catch (error) {
    if (request !== versionRequest) return;
    ahkVersionSelect.value = previousVersion;
    actionMessage(`Não foi possível alterar a versão: ${error.message}`, true);
  } finally {
    if (request === versionRequest) ahkVersionSelect.disabled = !apiToken;
  }
}
ahkVersionSelect?.addEventListener('change', changeAhkVersion);
async function persistFiles() {
  const files = {};
  if (definition) files['definition.json'] = definition;
  if (mapping) files['mapping.json'] = mapping;
  if (!Object.keys(files).length) return;
  if (!apiAvailable) { report('Inicie o aplicativo local para salvar os arquivos; no modo file:// eles ficam apenas neste navegador.', 'info'); return; }
  try {
    await requestJson('/api/files', { method: 'POST', headers: postHeaders(), body: JSON.stringify({ files }) });
    report('Arquivos do perfil salvos localmente.', 'success');
  } catch (error) { report(`Não foi possível salvar os arquivos: ${error.message}`, 'error'); }
}

function report(message, kind = 'info') {
  status.textContent = message;
  status.dataset.state = kind;
}

async function readJson(file) {
  return JSON.parse(await file.text());
}

function validate() {
  const errors = [];
  if (!definition) errors.push('Importe a definição do teclado.');
  if (!mapping) errors.push('Importe o mapeamento do teclado.');
  if (!definition || !mapping) return errors;
  const rows = Number(definition.matrix?.rows);
  const cols = Number(definition.matrix?.cols);
  if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(cols) || cols < 1) {
    errors.push('A matriz da definição precisa ter linhas e colunas inteiras positivas.');
  } else {
    const seen = new Set();
    definition.layouts?.keymap?.flat?.().forEach((entry) => {
      const match = typeof entry === 'string' && entry.match(/(?:^|\n)(\d+)\s*,\s*(\d+)(?:\n|$)/);
      if (match) {
        const r = Number(match[1]), c = Number(match[2]);
        const id = `${r},${c}`;
        if (r >= rows || c >= cols) errors.push(`O ID ${id} está fora da matriz ${rows} × ${cols}.`);
        if (seen.has(id)) errors.push(`O ID ${id} aparece mais de uma vez no layout.`);
        seen.add(id);
      }
    });
    if (!Array.isArray(mapping.layers) || mapping.layers.length === 0) errors.push('O mapeamento precisa conter pelo menos uma camada.');
    mapping.layers?.forEach((layer, i) => {
      if (!Array.isArray(layer) || layer.length !== rows * cols) errors.push(`A camada ${i} precisa ter ${rows * cols} códigos (${rows} × ${cols}).`);
      else if (layer.some((code) => typeof code !== 'string')) errors.push(`A camada ${i} contém um código que não é texto.`);
    });
    if (Array.isArray(mapping.encoders)) mapping.encoders.forEach((encoder, i) => {
      if (!Array.isArray(encoder) || encoder.length !== mapping.layers.length || encoder.some((layer) => !Array.isArray(layer) || layer.length !== 2))
        errors.push(`O encoder ${i} precisa ter um par de códigos em cada camada.`);
    });
  }
  if (definition.name && mapping.name && definition.name !== mapping.name) errors.push(`Identificação incompatível: definição “${definition.name}”, mapeamento “${mapping.name}”.`);
  const vid = Number.parseInt(definition.vendorId, 16), pid = Number.parseInt(definition.productId, 16);
  if (Number.isFinite(vid) && Number.isFinite(pid) && Number.isFinite(mapping.vendorProductId)) {
    const expected = ((vid << 16) | pid) >>> 0;
    if ((Number(mapping.vendorProductId) >>> 0) !== expected) errors.push(`Identificação USB incompatível: esperado ${expected}, recebido ${mapping.vendorProductId}.`);
  }
  return errors;
}

function activeLayer() { return Number(layerSelect.value) || 0; }

// Compacta os códigos VIA/QMK apenas na legenda visual; os detalhes preservam o original.
function displayCode(code) {
  const modifiers = { S: 'S', C: 'C', A: 'A', W: 'W', LSFT: 'S', RSFT: 'S', LCTL: 'C', RCTL: 'C', LALT: 'A', RALT: 'A', LGUI: 'W', RGUI: 'W' };
  const simplify = (value) => {
    value = value.trim();
    if (!value || value === 'KC_NO' || value === 'XXXXXXX') return '—';
    // Funções encapsuladas, como S(KC_F17), LCTL(KC_A) e combinações aninhadas.
    const wrapped = value.match(/^([A-Z]+)\((.*)\)$/i);
    if (wrapped) {
      const fn = wrapped[1].toUpperCase();
      const inner = simplify(wrapped[2]);
      const modifier = modifiers[fn];
      if (modifier) return inner === '—' ? '—' : `${modifier}_${inner}`;
      return `${fn}(${inner})`;
    }
    // Combinações como LT(1,KC_A) continuam legíveis e compactas.
    if (value.includes('+')) return value.split('+').map(simplify).join('+');
    if (value.startsWith('KC_')) {
      const name = value.slice(3);
      if (modifiers[name]) return modifiers[name];
      const aliases = { ENTER: 'Enter', ESC: 'Esc', BSPC: 'Backspace', DEL: 'Delete', TAB: 'Tab', SPC: 'Space', CAPS: 'Caps', LEFT: '←', RIGHT: '→', UP: '↑', DOWN: '↓' };
      return aliases[name] || name;
    }
    return value;
  };
  return simplify(String(code ?? ''));
}

function renderLayers() {
  layerSelect.replaceChildren();
  (mapping?.layers || []).forEach((_, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `Camada ${index}`;
    layerSelect.append(option);
  });
  layerSelect.disabled = !mapping?.layers?.length;
}

function renderKeyboard() {
  hoveredKey = null; focusedKey = null; hideKeyDescription();
  keyboardFrame?.classList.remove('rotation-ready');
  keyboard.replaceChildren();
  const layout = definition?.layouts?.keymap;
  if (!Array.isArray(layout)) {
    keyboardFrame?.classList.remove('has-layout');
    return;
  }
  let x = 0, y = 0;
  const keys = [];
  layout.forEach((row) => {
    x = 0;
    let pendingW = 1;
    if (!Array.isArray(row)) return;
    row.forEach((item) => {
      if (item && typeof item === 'object') {
        x += Number(item.x) || 0;
        y += Number(item.y) || 0;
        if (Number.isFinite(Number(item.w))) pendingW = Number(item.w);
        return;
      }
      const label = String(item ?? '');
      const keyX = x, keyY = y;
      const w = pendingW;
      pendingW = 1;
      // Labels encode matrix coordinates on their first line and encoder IDs on their final line.
      const match = label.match(/(?:^|\n)(\d+)\s*,\s*(\d+)(?:\n|$)/);
      const encoderMatch = label.match(/(?:^|\n)e(\d+)\s*$/i);
      const key = document.createElement(encoderMatch ? 'div' : 'button');
      if (!encoderMatch) key.type = 'button';
      key.className = 'keyboard-key';
      key.style.setProperty('--key-x', String(keyX));
      key.style.setProperty('--key-y', String(keyY));
      key.style.setProperty('--key-w', String(w));
      const index = match ? Number(match[1]) * Number(definition.matrix.cols) + Number(match[2]) : null;
      if (index !== null && Number.isInteger(index)) {
        key.dataset.index = String(index);
        key.setAttribute('aria-label', `Tecla ${match[1]}, ${match[2]}`);
      }
      if (encoderMatch) {
        const encoderIndex = Number(encoderMatch[1]);
        key.classList.add('encoder-key');
        key.dataset.encoder = String(encoderIndex);
        key.setAttribute('aria-label', `Encoder ${encoderIndex}`);
        key.setAttribute('role', 'group');
        key.replaceChildren();
        const encoderFace = document.createElement('div');
        encoderFace.className = 'encoder-face';
        key.append(encoderFace);
        const directions = [
          { direction: 0, label: 'Giro à esquerda', glyph: '↶', region: 'encoder-left' },
          { direction: 1, label: 'Giro à direita', glyph: '↷', region: 'encoder-right' },
        ];
        directions.forEach(({ direction, label, glyph, region }) => {
          const action = document.createElement('button');
          action.type = 'button';
          action.className = `encoder-action ${region}`;
          action.dataset.encoder = String(encoderIndex);
          action.dataset.direction = String(direction);
          action.setAttribute('aria-label', `Encoder ${encoderIndex}, ${label}`);
          const directionGlyph = document.createElement('span');
          directionGlyph.className = 'encoder-direction-glyph';
          directionGlyph.textContent = glyph;
          action.append(directionGlyph);
          action.addEventListener('click', (event) => {
            event.stopPropagation();
            selectItem({ type: 'encoder', index: null, row: match ? Number(match[1]) : null, col: match ? Number(match[2]) : null, encoderIndex, direction });
          });
          encoderFace.append(action);
        });
        const center = document.createElement('button');
        center.type = 'button';
        center.className = 'encoder-action encoder-center';
        center.dataset.encoder = String(encoderIndex);
        center.setAttribute('aria-label', `Encoder ${encoderIndex}, clique`);
        center.textContent = `e${encoderIndex}`;
        center.addEventListener('click', (event) => {
          event.stopPropagation();
          selectItem({ type: 'key', index, row: match ? Number(match[1]) : null, col: match ? Number(match[2]) : null, encoderIndex, direction: undefined });
        });
        encoderFace.append(center);
        [0, 1].forEach((direction) => {
          const label = document.createElement('span');
          label.className = `encoder-overlay-label encoder-overlay-${direction === 0 ? 'left' : 'right'}`;
          label.dataset.direction = String(direction);
          label.setAttribute('aria-hidden', 'true');
          encoderFace.append(label);
        });
      }
      if (index === null && !encoderMatch) {
        key.disabled = true;
        key.setAttribute('aria-hidden', 'true');
      } else {
        if (!encoderMatch) key.addEventListener('click', () => selectItem({ type: 'key', index, row: match ? Number(match[1]) : null, col: match ? Number(match[2]) : null, encoderIndex: null }));
      }
      const caption = document.createElement('span');
      caption.className = 'key-label';
      caption.textContent = label.split('\n').filter(Boolean).at(-1) || (match ? `${match[1]},${match[2]}` : '');
      if (!encoderMatch) key.append(caption);
      keys.push({ key, x: keyX, y: keyY });
      keyboard.append(key);
      x += w;
    });
    y += 1;
  });
  // Deixa uma pequena folga quando um encoder está imediatamente ao lado de uma tecla.
  keys.filter(({ key }) => key.classList.contains('encoder-key')).forEach((encoder) => {
    const touchingKey = keys.some(({ key, x, y }) => !key.classList.contains('encoder-key') &&
      Math.abs(y - encoder.y) < 0.01 &&
      Math.abs(x + (Number(key.style.getPropertyValue('--key-w')) || 1) - encoder.x) < 0.01);
    if (!touchingKey) return;
    const width = Number(encoder.key.style.getPropertyValue('--key-w')) || 1;
    const next = keys.filter((item) => item !== encoder && Math.abs(item.y - encoder.y) < 0.01 && item.x >= encoder.x + width - 0.01)
      .reduce((nearest, item) => Math.min(nearest, item.x), Infinity);
    encoder.x += Math.max(0, Math.min(0.16, next - encoder.x - width));
  });
  // Absolute placement makes KLE's x/y offsets work across varying key layouts.
  keyboard.classList.add('keyboard-layout');
  keyboardFrame?.classList.toggle('has-layout', keys.length > 0);
  const maxX = Math.max(1, ...keys.map(({ key, x }) => x + (Number(key.style.getPropertyValue('--key-w')) || 1)));
  const maxY = Math.max(1, ...keys.map(({ y }) => y + 1));
  keyboard.style.setProperty('--layout-cols', String(maxX));
  keyboard.style.setProperty('--layout-rows', String(maxY));
  keyboard.style.position = 'absolute';
  keyboard.style.minHeight = `calc(${maxY} * var(--key-unit, 4rem))`;
  keys.forEach(({ key, x, y }) => {
    const w = Number(key.style.getPropertyValue('--key-w')) || 1;
    key.style.position = 'absolute';
    key.style.left = `${x / maxX * 100}%`;
    key.style.top = `calc(${y} * var(--key-unit, 4rem))`;
    key.style.width = `calc(${w / maxX * 100}% - 0.35rem)`;
    key.style.height = 'calc(var(--key-unit, 4rem) - 0.35rem)';
  });
  applyLayoutRotation();
  refreshKeyLabels();
  refreshActionStates();
}

function refreshKeyLabels() {
  const deviceName = document.querySelector('.device-name');
  if (deviceName) deviceName.textContent = definition?.name || 'TECLADO';
  const layer = activeLayer();
  keyboard.querySelectorAll('.keyboard-key[data-index]').forEach((key) => {
    const code = mapping?.layers?.[layer]?.[Number(key.dataset.index)];
    const label = key.querySelector('.key-label');
    if (label) label.textContent = displayCode(code);
    key.classList.toggle('selected', selected?.type === 'key' && selected.index === Number(key.dataset.index));
    key.removeAttribute('title');
  });
  keyboard.querySelectorAll('.encoder-key[data-encoder]').forEach((key) => {
    const encoder = Number(key.dataset.encoder);
    key.classList.remove('encoder-selected', 'selected');
    key.querySelectorAll('.encoder-action').forEach((button) => {
      const isSelected = selected?.encoderIndex === encoder && (button.classList.contains('encoder-center') ? selected.direction === undefined : selected.direction === Number(button.dataset.direction));
      button.classList.toggle('selected', isSelected);
      const code = button.classList.contains('encoder-center') ? mapping?.layers?.[activeLayer()]?.[Number(key.dataset.index)] : mapping?.encoders?.[encoder]?.[activeLayer()]?.[Number(button.dataset.direction)];
      if (button.classList.contains('encoder-center')) button.textContent = displayCode(code);
      else {
        const overlayLabel = key.querySelector(`.encoder-overlay-label[data-direction="${button.dataset.direction}"]`);
        if (overlayLabel) overlayLabel.textContent = displayCode(code);
      }
      button.removeAttribute('title');
    });
  });
}

async function selectItem(item) {
  if (!(await leaveAction())) return;
  selected = item;
  renderDetails();
  refreshKeyLabels();
  loadAction(actionTrigger());
}

function renderDetails() {
  details.replaceChildren();
  if (!selected || !mapping) {
    details.textContent = 'Clique em uma tecla para começar a editar.';
    return;
  }
  const layer = activeLayer();
  const heading = document.createElement('h3');
  heading.textContent = selected.encoderIndex !== null && selected.encoderIndex !== undefined
    ? `Tecla ${selected.row}, ${selected.col} e encoder ${selected.encoderIndex}`
    : `Tecla ${selected.row}, ${selected.col}`;
  details.append(heading);
  if (selected.index !== null && selected.direction === undefined) {
    const click = document.createElement('p');
    click.textContent = `Clique: ${mapping.layers?.[layer]?.[selected.index] ?? 'Sem mapeamento'}`;
    details.append(click);
  }
  if (selected.encoderIndex !== null && selected.encoderIndex !== undefined) {
    const turns = mapping.encoders?.[selected.encoderIndex]?.[layer];
    if (Array.isArray(turns)) turns.forEach((value, direction) => {
      const line = document.createElement('p');
      line.textContent = `Giro ${direction === 0 ? 'à esquerda' : 'à direita'}: ${value || 'Sem mapeamento'}`;
      details.append(line);
    });
    else { const line = document.createElement('p'); line.textContent = 'Giros: mapeamento indisponível.'; details.append(line); }
  }
  if (selected.index === null && (selected.encoderIndex === null || selected.encoderIndex === undefined)) {
    const msg = document.createElement('p'); msg.textContent = 'Não há mapeamento disponível para este item.'; details.append(msg);
  }
}

function updateStatus() {
  const errors = validate();
  report(errors.length ? errors.join(' ') : '', errors.length ? 'error' : 'success');
}

definitionInput?.addEventListener('change', async () => {
  try { definition = await readJson(definitionInput.files?.[0]); const label = document.querySelector('[data-file-name="definition"]'); if (label) label.textContent = definition.name || 'Definição carregada'; renderKeyboard(); updateStatus(); await persistFiles(); }
  catch (error) { definition = null; renderKeyboard(); report(`Não foi possível ler a definição: ${error.message}`, 'error'); }
});
mappingInput?.addEventListener('change', async () => {
  try { mapping = await readJson(mappingInput.files?.[0]); const label = document.querySelector('[data-file-name="mapping"]'); if (label) label.textContent = mapping.name || 'Mapeamento carregado'; renderLayers(); renderKeyboard(); updateStatus(); await persistFiles(); }
  catch (error) { mapping = null; renderLayers(); renderKeyboard(); report(`Não foi possível ler o mapeamento: ${error.message}`, 'error'); }
});
layerSelect?.addEventListener('change', async () => {
  if (!(await leaveAction())) { layerSelect.value = String(lastLayer); return; }
  lastLayer = activeLayer();
  renderDetails(); refreshKeyLabels();
  refreshActionStates();
  loadAction(actionTrigger());
});



// Gera um arquivo para edição externa sem alterar os arquivos carregados.
const ahkDownload = $('ahk-download');
const ahkMessage = $('ahk-message');
const ahkTrigger = $('ahk-trigger');
function updateAhkLayer() {
  if (ahkTrigger) ahkTrigger.textContent = `Camada ${activeLayer()}`;
}
layerSelect?.addEventListener('change', updateAhkLayer);
ahkDownload?.addEventListener('click', () => {
  const errors = validate();
  if (errors.length) { ahkMessage.textContent = errors.join(' '); return; }
  const layer = activeLayer();
  const codes = [...mapping.layers[layer]];
  if (Array.isArray(mapping.encoders)) {
    mapping.encoders.forEach((encoder) => {
      if (Array.isArray(encoder?.[layer])) codes.push(...encoder[layer]);
    });
  }
  const result = window.AhkGenerator.generate(codes);
  const blob = new Blob([result.content], {type: 'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `teclado-camada-${layer}.ahk`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const unsupported = result.unsupported.filter(x => x.code !== 'KC_NO' && x.code !== 'XXXXXXX');
  ahkMessage.textContent = `Arquivo gerado. ${result.conflicts.length} conflito(s) de atalhos e ${unsupported.length} código(s) não convertidos. Os blocos estão comentados; revise antes de ativar.`;
});

restoreState();
let heartbeatFailures = 0;
async function keepServerAlive() {
  if (!apiToken) return;
  try { await requestJson('/api/heartbeat', { method: 'POST', headers: postHeaders(), body: '{}' }); heartbeatFailures = 0; }
  catch {
    if (document.hidden || ++heartbeatFailures < 3) return;
    if (!actionDirty) window.close();
    actionMessage('O servidor foi encerrado. Feche esta aba ou reinicie o VIA-AHK Studio.', true);
  }
}
setInterval(keepServerAlive, 15000);
window.addEventListener('pageshow', keepServerAlive);
async function syncExternalFile() {
  if (!apiAvailable || !apiToken || actionDirty) return;
  try { await refreshContexts(); refreshActionStates(); if (currentTrigger) loadAction(currentTrigger); } catch { /* O próximo carregamento informará falhas de conexão. */ }
}
window.addEventListener('focus', syncExternalFile);
window.addEventListener('pageshow', syncExternalFile);
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncExternalFile(); });
