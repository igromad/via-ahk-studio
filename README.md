# VIA-AHK Studio

Visualizador de layouts exportados do VIA com edição de ações AutoHotkey para teclas e encoders. O VIA-AHK Studio complementa o VIA: ele usa arquivos JSON exportados e não altera diretamente o firmware nem o mapeamento do dispositivo.

## Requisitos

- Windows com Windows PowerShell, que já acompanha o sistema, e um navegador.
- Os arquivos JSON da definição do teclado e do mapeamento exportado pelo VIA.
- AutoHotkey v1 ou v2 para executar as ações do arquivo `.ahk` correspondente.

Não é necessário instalar Python, Node.js ou bibliotecas adicionais.

## Como usar

1. Abra `Iniciar.bat`. O servidor local inicia minimizado e abre o app no navegador.
2. Em **Arquivos**, selecione o JSON da definição e o JSON do mapeamento VIA.
3. Em **Arquivo AutoHotkey**, escolha a versão v1 ou v2 e selecione ou crie um arquivo `.ahk`.
4. Clique em uma tecla ou em uma das áreas de um encoder para consultar ou editar a ação e seu comentário.
5. Use as abas no topo para criar, organizar e alternar perfis de macroboards. Os perfis guardam seus próprios arquivos JSON e a referência ao AHK selecionado; também é possível compartilhar um AHK entre perfis.

Segure **Alt** para alternar temporariamente a exibição dos comentários. A rotação do layout, as cores e o tema podem ser alterados pela interface.

## Servidor local

O aplicativo usa um servidor local na porta `8765`. Mantenha sua janela aberta enquanto usa o app. Restaure a janela minimizada e pressione **R** para reiniciar ou **X** para encerrar. O servidor também é encerrado após um período sem contato com uma aba do aplicativo.

## Arquivos e segurança das alterações

Os perfis e cópias dos JSON são armazenados localmente em `%LOCALAPPDATA%\KM16proStudio`. O AHK permanece no local escolhido. Ao salvar uma ação, o app cria uma cópia `.bak` do arquivo anterior e preserva a codificação detectada. Arquivos AHK novos usam UTF-8 com BOM.

Ao salvar, o app tenta solicitar o recarregamento de uma instância do arquivo AHK que já esteja em execução. Alternar entre v1 e v2 não converte código existente.

## Limitações

O projeto é um protótipo. Algumas estruturas de AHK e contextos ainda podem exigir edição no editor externo. Revise as ações antes de executá-las; teclas que compartilham um bloco AHK compartilham também as alterações feitas nesse bloco.
