(() => {
  const messages = {
    pt: {
      'files.title':'Arquivos','files.definition':'Definição do teclado','files.definitionHint':'Layout e matriz de teclas','files.mapping':'Mapeamento VIA','files.mappingHint':'Camadas e comandos dos encoders','files.choose':'Escolher arquivo',
      'ahk.title':'Arquivo AutoHotkey','ahk.hint':'Ações deste macroboard','ahk.choose':'Escolher arquivo','ahk.create':'Criar arquivo','ahk.reuse':'Usar o mesmo AHK de outro perfil','ahk.noneSelected':'Nenhum arquivo selecionado',
      'profiles.choose':'Escolher perfil','profiles.renameTitle':'Renomear perfil','profiles.renameHint':'Escolha um nome para identificar este macroboard.','profiles.name':'Nome do perfil','profiles.saveName':'Salvar nome','profiles.newTitle':'Novo perfil','profiles.newHint':'Crie um espaço separado para outro macroboard. Os JSON e o arquivo AHK ficam vinculados a este perfil.','profiles.macroboardName':'Nome do macroboard','profiles.namePlaceholder':'Ex.: Teclas de edição','profiles.create':'Criar perfil',
      'common.cancel':'Cancelar','editor.title':'Layout e mapeamento','comments.label':'COMENTÁRIOS (ALT)','comments.show':'Mostrar','layer.label':'CAMADA','layer.default':'Camada 0','action.context':'CONTEXTO DA AÇÃO','context.global':'Global','context.application':'Aplicativo','context.window':'Janela','rotation.label':'ROTAÇÃO','keyboard.label':'TECLADO','keyboard.fileLayout':'LAYOUT DO ARQUIVO','keyboard.empty':'Carregue a definição do teclado para exibir o layout.','details.empty':'Clique em uma tecla para começar a editar.','status.initial':'Carregue os dois arquivos JSON para começar.','status.waiting':'AGUARDANDO ARQUIVOS',
      'actions.title':'Ações por tecla','actions.comment':'Comentário','actions.commentPlaceholder':'Observação opcional sobre esta ação','actions.code':'Código da ação','actions.codePlaceholder':'Selecione uma tecla compatível para começar.','actions.save':'Salvar ação','actions.open':'Abrir no editor','actions.refresh':'Atualizar do arquivo externo','actions.hint':'Teclas que enviam o mesmo atalho compartilham a ação.',
      'language.label':'Mudar idioma','comments.title':'Mostrar comentários; segure Alt para alternar','a11y.brand':'VIA-AHK Studio','a11y.profileSelect':'Selecionar perfil do macroboard','a11y.profileTabs':'Perfis de macroboard','a11y.profileAdd':'Adicionar um perfil para outro macroboard','a11y.palette':'Escolher cor de destaque','a11y.paletteTitle':'Cores','a11y.paletteGroup':'Cor de destaque','a11y.accentGreen':'Verde','a11y.accentBlue':'Azul','a11y.accentRed':'Vermelho','a11y.accentPurple':'Roxo','a11y.accentOrange':'Laranja','a11y.theme':'Alternar tema','a11y.workspace':'Visualizador do teclado','a11y.version':'Versão para a próxima seleção de arquivo','a11y.reuse':'Usar AHK de outro perfil','a11y.editor':'Mapeamento VIA','a11y.layer':'Selecionar camada','a11y.context':'Selecionar contexto da ação','a11y.rotation':'Rotação do layout','a11y.rotateLeft':'Girar para a esquerda','a11y.rotateRight':'Girar para a direita','a11y.keyboard':'Layout do teclado'
    },
    en: {
      'files.title':'Files','files.definition':'Keyboard definition','files.definitionHint':'Layout and key matrix','files.mapping':'VIA mapping','files.mappingHint':'Layers and encoder commands','files.choose':'Choose file',
      'ahk.title':'AutoHotkey file','ahk.hint':'Actions for this macroboard','ahk.choose':'Choose file','ahk.create':'Create file','ahk.reuse':'Use the same AHK file from another profile','ahk.noneSelected':'No file selected',
      'profiles.choose':'Choose profile','profiles.renameTitle':'Rename profile','profiles.renameHint':'Choose a name to identify this macroboard.','profiles.name':'Profile name','profiles.saveName':'Save name','profiles.newTitle':'New profile','profiles.newHint':'Create a separate workspace for another macroboard. The JSON files and AHK file are linked to this profile.','profiles.macroboardName':'Macroboard name','profiles.namePlaceholder':'E.g. Editing keys','profiles.create':'Create profile',
      'common.cancel':'Cancel','editor.title':'Layout and mapping','comments.label':'COMMENTS (ALT)','comments.show':'Show','layer.label':'LAYER','layer.default':'Layer 0','action.context':'ACTION CONTEXT','context.global':'Global','context.application':'Application','context.window':'Window','rotation.label':'ROTATION','keyboard.label':'KEYBOARD','keyboard.fileLayout':'FILE LAYOUT','keyboard.empty':'Load the keyboard definition to display the layout.','details.empty':'Click a key to start editing.','status.initial':'Load both JSON files to get started.','status.waiting':'WAITING FOR FILES',
      'actions.title':'Actions by key','actions.comment':'Comment','actions.commentPlaceholder':'Optional note about this action','actions.code':'Action code','actions.codePlaceholder':'Select a compatible key to get started.','actions.save':'Save action','actions.open':'Open in editor','actions.refresh':'Refresh from external file','actions.hint':'Keys that send the same shortcut share the action.',
      'language.label':'Change language','comments.title':'Show comments; hold Alt to toggle','a11y.brand':'VIA-AHK Studio','a11y.profileSelect':'Select macroboard profile','a11y.profileTabs':'Macroboard profiles','a11y.profileAdd':'Add a profile for another macroboard','a11y.palette':'Choose accent color','a11y.paletteTitle':'Colors','a11y.paletteGroup':'Accent color','a11y.accentGreen':'Green','a11y.accentBlue':'Blue','a11y.accentRed':'Red','a11y.accentPurple':'Purple','a11y.accentOrange':'Orange','a11y.theme':'Toggle theme','a11y.workspace':'Keyboard viewer','a11y.version':'Version for the next file selection','a11y.reuse':'Use AHK from another profile','a11y.editor':'VIA mapping','a11y.layer':'Select layer','a11y.context':'Select action context','a11y.rotation':'Layout rotation','a11y.rotateLeft':'Rotate left','a11y.rotateRight':'Rotate right','a11y.keyboard':'Keyboard layout'
    }
  };
  const applyLanguage = (language) => {
    const locale = language === 'pt' ? 'pt' : 'en';
    document.documentElement.lang = locale === 'en' ? 'en' : 'pt-BR';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const value = messages[locale][el.dataset.i18n];
      const dynamic = ['ahk.noneSelected', 'details.empty', 'actions.hint', 'status.initial', 'status.waiting', 'layer.default'];
      if (dynamic.includes(el.dataset.i18n) && ![messages.pt[el.dataset.i18n], messages.en[el.dataset.i18n]].includes(el.textContent.trim())) return;
      if (value !== undefined) el.textContent = value;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const value = messages[locale][el.dataset.i18nPlaceholder];
      if (value !== undefined) el.placeholder = value;
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      const value = messages[locale][el.dataset.i18nAriaLabel];
      if (value !== undefined) el.setAttribute('aria-label', value);
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const value = messages[locale][el.dataset.i18nTitle];
      if (value !== undefined) el.title = value;
    });
    const button = document.getElementById('language-toggle');
    if (button) {
      button.textContent = locale === 'pt' ? 'EN' : 'PT';
      button.setAttribute('aria-label', messages[locale]['language.label']);
      button.title = messages[locale]['language.label'];
      button.dataset.language = locale;
    }
    try { localStorage.setItem('via-ahk-language', locale); } catch (_) {}
    window.dispatchEvent(new CustomEvent('via-language-change', { detail: locale }));
  };
  window.setAppLanguage = applyLanguage;
  let initial = 'en';
  try { initial = localStorage.getItem('via-ahk-language') || 'en'; } catch (_) {}
  applyLanguage(initial);
  document.getElementById('language-toggle')?.addEventListener('click', () => {
    applyLanguage(document.getElementById('language-toggle').dataset.language === 'pt' ? 'en' : 'pt');
  });
})();
