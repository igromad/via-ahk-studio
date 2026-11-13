Add-Type -AssemblyName System.Windows.Forms
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir = Join-Path $env:LOCALAPPDATA 'KM16proStudio'
$LegacySavedPath = Join-Path $DataDir 'action-file.txt'
$LegacyVersionPath = Join-Path $DataDir 'ahk-version.json'
$ProfilesPath = Join-Path $DataDir 'profiles.json'
$ActiveProfilePath = Join-Path $DataDir 'active-profile.txt'
$Token = [guid]::NewGuid().ToString('N')
$script:ActionPath = Join-Path $DataDir 'KM16pro-actions.ahk'
$script:SavedPath = $null
$script:VersionPath = $null
$script:ProfileDirectory = $null
$script:ProfileId = 'main'
$Port = 8765

function Expand-ProfileEntries($Items) {
  foreach($item in $Items) {
    if($null -eq $item){continue}
    if($item.id -and $item.name){ [pscustomobject]@{id=[string]$item.id;name=[string]$item.name} }
    elseif($null -ne $item.value){ Expand-ProfileEntries $item.value }
    elseif($item -is [array]){ Expand-ProfileEntries $item }
  }
}
function Get-ProfileRegistry {
  try { $data=Get-Content -Raw -LiteralPath $ProfilesPath | ConvertFrom-Json; Expand-ProfileEntries $data } catch { throw 'Não foi possível ler o registro de perfis.' }
}
function Set-ProfileRegistry($Profiles) {
  $entries=@(Expand-ProfileEntries $Profiles | ForEach-Object { ConvertTo-Json -InputObject @{id=$_.id;name=$_.name} -Compress })
  [IO.File]::WriteAllText($ProfilesPath,('['+($entries -join ',')+']'),[Text.UTF8Encoding]::new($false))
}
function Activate-Profile([string]$Id,[switch]$Persist) {
  $profiles=Get-ProfileRegistry; $profile=@($profiles|Where-Object {$_.id -eq $Id})|Select-Object -First 1
  if(!$profile){throw 'Perfil não encontrado.'}
  $script:ProfileId=[string]$profile.id
  $script:ProfileDirectory=Join-Path (Join-Path $DataDir 'profiles') $script:ProfileId
  New-Item -ItemType Directory -Path $script:ProfileDirectory -Force | Out-Null
  $script:SavedPath=Join-Path $script:ProfileDirectory 'action-file.txt'
  $script:VersionPath=Join-Path $script:ProfileDirectory 'ahk-version.json'
  if(!(Test-Path $script:VersionPath)){[IO.File]::WriteAllText($script:VersionPath,'{"version":"1"}',[Text.UTF8Encoding]::new($false))}
  $script:ActionPath=Join-Path $script:ProfileDirectory 'actions.ahk'
  if(Test-Path $script:SavedPath){$candidate=(Get-Content -Raw -LiteralPath $script:SavedPath).Trim();if($candidate -and [IO.Path]::GetExtension($candidate) -ieq '.ahk' -and (Test-Path $candidate)){$script:ActionPath=$candidate}}
  if(!(Test-Path $script:ActionPath)){[IO.File]::WriteAllText($script:ActionPath,"#Requires AutoHotkey v1.1`r`n`r`n",[Text.UTF8Encoding]::new($true))}
  $savedActionPath='';if(Test-Path $script:SavedPath){$savedActionPath=(Get-Content -Raw -LiteralPath $script:SavedPath).Trim()}
  if($savedActionPath -ne $script:ActionPath){[IO.File]::WriteAllText($script:SavedPath,$script:ActionPath,[Text.UTF8Encoding]::new($false))}
  if($Persist){[IO.File]::WriteAllText($ActiveProfilePath,$script:ProfileId,[Text.UTF8Encoding]::new($false))}
  return $profile
}
function Ensure-Data {
  New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
  if(!(Test-Path $ProfilesPath)){
    $first=@{id='main';name='Perfil principal'};Set-ProfileRegistry @($first)
    $firstDir=Join-Path (Join-Path $DataDir 'profiles') 'main';New-Item -ItemType Directory -Path $firstDir -Force|Out-Null
    foreach($name in @('definition.json','mapping.json')){$legacy=Join-Path $DataDir $name;if(Test-Path $legacy){Copy-Item -LiteralPath $legacy -Destination (Join-Path $firstDir $name) -Force}}
    if(Test-Path $LegacyVersionPath){Copy-Item -LiteralPath $LegacyVersionPath -Destination (Join-Path $firstDir 'ahk-version.json') -Force}
    if(Test-Path $LegacySavedPath){$oldPath=(Get-Content -Raw -LiteralPath $LegacySavedPath).Trim();if($oldPath){[IO.File]::WriteAllText((Join-Path $firstDir 'action-file.txt'),$oldPath,[Text.UTF8Encoding]::new($false))}}
    [IO.File]::WriteAllText($ActiveProfilePath,'main',[Text.UTF8Encoding]::new($false))
  }
  $profiles=Get-ProfileRegistry;if(!$profiles.Count){$first=@{id='main';name='Perfil principal'};Set-ProfileRegistry @($first);$profiles=@($first)}
  $active='';if(Test-Path $ActiveProfilePath){$active=(Get-Content -Raw -LiteralPath $ActiveProfilePath).Trim()}
  if(!$active -or !(@($profiles|Where-Object {$_.id -eq $active}).Count)){$active=[string]$profiles[0].id}
  [void](Activate-Profile $active -Persist)
}
function Get-AppState {
  Ensure-Data;$files=@{}
  foreach($name in @('definition.json','mapping.json')){$path=Join-Path $script:ProfileDirectory $name;if(Test-Path $path){try{$files[$name]=Get-Content -Raw -LiteralPath $path|ConvertFrom-Json}catch{}}}
  $text=Read-AhkFile $script:ActionPath;$profile=@((Get-ProfileRegistry)|Where-Object {$_.id -eq $script:ProfileId})|Select-Object -First 1
  $sources=@(Get-ProfileRegistry|ForEach-Object { $dir=Join-Path (Join-Path $DataDir 'profiles') $_.id;$saved=Join-Path $dir 'action-file.txt';$ver=Join-Path $dir 'ahk-version.json';if(Test-Path $saved){$candidate=(Get-Content -Raw -LiteralPath $saved).Trim();if((Test-Path -LiteralPath $candidate) -and [IO.Path]::GetExtension($candidate) -ieq '.ahk'){$v='1';if(Test-Path $ver){try{$v=[string](Get-Content -Raw -LiteralPath $ver|ConvertFrom-Json).version}catch{}};@{id=$_.id;name=$_.name;version=$v}}} })
  return @{ok=$true;token=$Token;files=$files;actionFile=$script:ActionPath;version=(Get-Version);contexts=@(Get-Contexts $text);profiles=@(Get-ProfileRegistry);ahkSources=$sources;profileId=$script:ProfileId;profileName=$profile.name}
}
function Get-Version { try { $v = (Get-Content -Raw -LiteralPath $VersionPath | ConvertFrom-Json).version; if ($v -in @('1','2')) { return [string]$v } } catch {}; return '1' }
function Get-AhkEncoding([string]$Path) {
  if (!(Test-Path -LiteralPath $Path)) { return [Text.UTF8Encoding]::new($true,$true) }
  $bytes=[IO.File]::ReadAllBytes($Path)
  if($bytes.Length -ge 4 -and $bytes[0] -eq 0 -and $bytes[1] -eq 0 -and $bytes[2] -eq 254 -and $bytes[3] -eq 255){return [Text.UTF32Encoding]::new($true,$true,$true)}
  if($bytes.Length -ge 4 -and $bytes[0] -eq 255 -and $bytes[1] -eq 254 -and $bytes[2] -eq 0 -and $bytes[3] -eq 0){return [Text.UTF32Encoding]::new($false,$true,$true)}
  if($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191){return [Text.UTF8Encoding]::new($true,$true)}
  if($bytes.Length -ge 2 -and $bytes[0] -eq 255 -and $bytes[1] -eq 254){return [Text.UnicodeEncoding]::new($false,$true,$true)}
  if($bytes.Length -ge 2 -and $bytes[0] -eq 254 -and $bytes[1] -eq 255){return [Text.UnicodeEncoding]::new($true,$true,$true)}
  $utf8=[Text.UTF8Encoding]::new($false,$true)
  try { [void]$utf8.GetString($bytes); return $utf8 } catch { return [Text.Encoding]::GetEncoding([Globalization.CultureInfo]::CurrentCulture.TextInfo.ANSICodePage,[Text.EncoderFallback]::ExceptionFallback,[Text.DecoderFallback]::ExceptionFallback) }
}
function Read-AhkFile([string]$Path) { return [IO.File]::ReadAllText($Path,(Get-AhkEncoding $Path)) }
function Atomic-Write([string]$Path,[string]$Text) {
  $tmp = "$Path.tmp"; if (Test-Path $Path) { Copy-Item -LiteralPath $Path -Destination "$Path.bak" -Force }
  $encoding=if([IO.Path]::GetExtension($Path) -ieq '.ahk'){Get-AhkEncoding $Path}else{[Text.UTF8Encoding]::new($false)}
  [IO.File]::WriteAllText($tmp,$Text,$encoding); Move-Item -LiteralPath $tmp -Destination $Path -Force
}
function Request-AhkReload([string]$ScriptPath) {
  try {
    if(-not ('ViaAhkWindow' -as [type])) {
      Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class ViaAhkWindow {
    private delegate bool EnumProc(IntPtr hwnd, IntPtr param);
    [DllImport("user32.dll", SetLastError=true)] private static extern bool EnumWindows(EnumProc callback, IntPtr param);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr hwnd, StringBuilder name, int max);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
    [DllImport("user32.dll", SetLastError=true)] private static extern bool PostMessage(IntPtr hwnd, uint msg, UIntPtr wparam, IntPtr lparam);
    public static string Reload(string scriptPath) {
        int found = 0, sent = 0;
        string expected = System.IO.Path.GetFullPath(scriptPath);
        bool enumerated = EnumWindows(delegate(IntPtr hwnd, IntPtr param) {
            var cls = new StringBuilder(256); GetClassName(hwnd, cls, cls.Capacity);
            if (!String.Equals(cls.ToString(), "AutoHotkey", StringComparison.Ordinal)) return true;
            var title = new StringBuilder(32768); GetWindowText(hwnd, title, title.Capacity);
            string text = title.ToString();
            string prefix = expected + " - AutoHotkey v";
            if (!text.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return true;
            found++;
            if (PostMessage(hwnd, 0x0111, new UIntPtr(65400), IntPtr.Zero)) sent++;
            return true;
        }, IntPtr.Zero);
        if (!enumerated) return "error";
        if (found == 0) return "not_running";
        return sent == found ? "requested" : "error";
    }
}
'@
    }
    return [ViaAhkWindow]::Reload($ScriptPath)
  } catch { return 'error' }
}
function Get-Contexts([string]$Text) {
  $list = [Collections.Generic.List[object]]::new(); $list.Add(@{id='global';label='Global'})
  foreach ($m in [regex]::Matches($Text,'(?im)^\s*#(?:If|HotIf)\s+WinActive\(\s*["'']ahk_exe\s+([\w.-]+\.exe)["'']\s*\)')) {
    $exe=$m.Groups[1].Value; if (!($list.id -contains ('exe:'+$exe.ToLowerInvariant()))) { $list.Add(@{id=('exe:'+$exe.ToLowerInvariant());label=$exe;exe=$exe}) }
  }
  foreach ($m in [regex]::Matches($Text,'(?im)^\s*#IfWinActive\s+ahk_exe\s+([\w.-]+\.exe)\s*(?:;.*)?$')) { $exe=$m.Groups[1].Value;if(!($list.id -contains ('exe:'+$exe.ToLowerInvariant()))){$list.Add(@{id=('exe:'+$exe.ToLowerInvariant());label=$exe;exe=$exe})} }
  return $list.ToArray()
}
function Get-HotkeyCanonical([string]$Trigger) {
  $m=[regex]::Match($Trigger.Trim(),'^([~*$+^!#]*)(.+)$');if(!$m.Success){return $Trigger.ToLowerInvariant()}
  $prefix=$m.Groups[1].Value;$mods='';foreach($c in @('+','^','!','#')){if($prefix.Contains($c)){$mods+=$c}}
  $key=$m.Groups[2].Value.ToLowerInvariant();$aliases=@{esc='escape';return='enter';prior='pgup';next='pgdn';del='delete';ins='insert';bs='backspace'};if($aliases.ContainsKey($key)){$key=$aliases[$key]}
  return ($mods+$key).ToLowerInvariant()
}
function Get-Hotkeys([string]$Text) {
  $lines=[regex]::Split($Text,"`n");$offsets=[long[]]::new($lines.Length);$cursor=0
  for($n=0;$n -lt $lines.Length;$n++){$offsets[$n]=$cursor;$cursor+=$lines[$n].Length+1}
  $context='global';$blocks=[Collections.Generic.List[object]]::new();$version=Get-Version
  for($i=0;$i -lt $lines.Length;$i++){
    $line=$lines[$i].TrimEnd("`r");$legacy=[regex]::Match($line,'^\s*#IfWinActive\s*(.*?)\s*(?:;.*)?$','IgnoreCase');if($legacy.Success){$expr=$legacy.Groups[1].Value.Trim();if(!$expr){$context='global'}elseif($expr -match '(?i)^ahk_exe\s+([\w.-]+\.exe)$'){$context='exe:'+$Matches[1].ToLowerInvariant()}else{$context='unsupported'};continue};$directive=[regex]::Match($line,'^\s*#(?:If|HotIf)\s*(.*?)\s*(?:;.*)?$','IgnoreCase')
    if($directive.Success){$expr=$directive.Groups[1].Value.Trim();if(!$expr){$context='global'}elseif($expr -match '(?i)WinActive\(\s*["'']ahk_exe\s+([\w.-]+\.exe)["'']\s*\)'){$context='exe:'+$Matches[1].ToLowerInvariant()}else{$context='unsupported'};continue}
    $hk=[regex]::Match($line,'^\s*([~*$A-Za-z0-9_.:+^!#-]{1,120})::\s*(.*?)\s*$');if(!$hk.Success){continue}
    $trigger=$hk.Groups[1].Value;$tail=$hk.Groups[2].Value;$j=$i;$complete=$false;$body='';$end=$offsets[$i]+$lines[$i].Length;$unsafeHeader=$false;$unsafeBody=$false
    if($tail.StartsWith(';')){$tail='';$unsafeHeader=$true}
    $braceNext=$false;$nextOpen=$i+1
    if($version -eq '2' -and !$tail){while($nextOpen -lt $lines.Length -and (!$lines[$nextOpen].Trim() -or $lines[$nextOpen].Trim().StartsWith(';'))){$unsafeHeader=$true;$nextOpen++}}
    if($version -eq '2' -and ($tail -eq '{' -or (!$tail -and $nextOpen -lt $lines.Length -and $lines[$nextOpen].Trim() -eq '{'))){
      $braceNext=($tail -eq '');$openLine=if($braceNext){$nextOpen}else{$i};$depth=1;$bodyLines=[Collections.Generic.List[string]]::new();$j=$openLine+1
      while($j -lt $lines.Length -and $depth -gt 0){
        $l=$lines[$j].TrimEnd("`r");$quote=[char]0;$comment=$false
        for($k=0;$k -lt $l.Length;$k++){
          $ch=$l[$k]
          if($quote -ne [char]0){if($ch -eq [char]96){$k++;continue};if($ch -eq $quote){if($k+1 -lt $l.Length -and $l[$k+1] -eq $quote){$k++;continue};$quote=[char]0};continue}
          if($ch -eq [char]34 -or $ch -eq [char]39){$quote=$ch;continue}
          if($ch -eq ';'){break}
          if($ch -eq '{'){$depth++}elseif($ch -eq '}'){$depth--;if($depth -eq 0){break}}
        }
        if($depth -eq 0){if($l.Trim() -notmatch '^}\s*(?:;.*)?$'){$depth=-1;break};$end=[Math]::Min($Text.Length,$offsets[$j]+$lines[$j].Length+1);break}
        $bodyLines.Add($l);$j++
      }
      $complete=($depth -eq 0);$body=$bodyLines -join "`n"
    }elseif($version -eq '2' -and $tail){
      if($tail -match '^\{\s*(.*?)\s*\}$'){$body=$Matches[1];$complete=$true}
      elseif(!$tail.StartsWith('{') -and !$tail.StartsWith(';')){$body=$tail;$complete=$true}
      if($complete){$end=[Math]::Min($Text.Length,$offsets[$i]+$lines[$i].Length+1)}
    }elseif($version -eq '1'){
      if($tail){$complete=$true;$body=$tail;$end=$offsets[$i]+$lines[$i].Length+1}
      else{
        $j=$i+1;$aliases=[Collections.Generic.List[string]]::new()
        while($j -lt $lines.Length){$alias=[regex]::Match($lines[$j].TrimEnd("`r"),'^\s*([~*$A-Za-z0-9_.:+^!#-]{1,120})::\s*$');if(!$alias.Success){break};$aliases.Add($alias.Groups[1].Value);$j++}
        $sharedHeaders=$Text.Substring($offsets[$i],$offsets[$j]-$offsets[$i]).TrimEnd("`r","`n")
        $bodyLines=[Collections.Generic.List[string]]::new();$depth=0
        while($j -lt $lines.Length){
          $raw=$lines[$j].TrimEnd("`r");$trimmed=$raw.Trim()
          if($depth -eq 0 -and ($trimmed -match '^#(?:If|HotIf)(\s|$)' -or $trimmed -match '^[~*$A-Za-z0-9_.:+^!#-]+::')){break}
          if($depth -eq 0 -and $trimmed -match '(?i)^return(?:\s*;.*)?$'){$complete=$true;break}
          if($trimmed -match '(?i)^(?:if|else|loop|while|for|try|catch)\b' -and $trimmed -notmatch '\{'){
            $next=$j+1;while($next -lt $lines.Length -and (!$lines[$next].Trim() -or $lines[$next].Trim().StartsWith(';'))){$next++}
            if($next -ge $lines.Length -or $lines[$next].Trim() -notmatch '^\{(?:\s*;.*)?$'){$unsafeBody=$true}
          }
          $quote=[char]0
          for($k=0;$k -lt $raw.Length;$k++){$ch=$raw[$k];if($ch -eq [char]96){$k++;continue};if($quote -ne [char]0){if($ch -eq $quote){$quote=[char]0};continue};if($ch -eq [char]34){$quote=$ch;continue};if($ch -eq ';'){break};if($ch -eq '{'){$depth++}elseif($ch -eq '}'){$depth--;if($depth -lt 0){$unsafeBody=$true;$depth=0}}}
          $bodyLines.Add($raw);$j++
        }
        if($complete){
          $end=[Math]::Min($Text.Length,$offsets[$j]+$lines[$j].Length+1)
          $look=$j+1;while($look -lt $lines.Length -and (!$lines[$look].Trim() -or $lines[$look].Trim().StartsWith(';'))){$look++}
          if($look -lt $lines.Length -and $lines[$look].Trim() -match '^[A-Za-z_][A-Za-z0-9_]*:\s*(?:;.*)?$'){
            $bodyLines.Add($lines[$j].TrimEnd("`r"));$j++
            while($j -lt $lines.Length){$nextLine=$lines[$j].TrimEnd("`r");if($nextLine.Trim() -match '^(?:[~*$A-Za-z0-9_.:+^!#-]+::|#(?:If|HotIf|IfWinActive)(?:\s|$))'){break};$bodyLines.Add($nextLine);$j++}
            $end=if($j -lt $lines.Length){$offsets[$j]}else{$Text.Length};$j--
          }
          $body=$bodyLines -join "`n"
        }
      }
    }
    if(!$complete){$end=$Text.Length}
    $shared=($version -eq '1' -and !$tail -and $aliases.Count -gt 0)
    $blocks.Add(@{trigger=$trigger;context=$context;start=$offsets[$i];end=$end;body=$body;complete=$complete;braceNext=$braceNext;shared=$shared;sharedHeaders=$sharedHeaders;unsafeHeader=$unsafeHeader;unsafeBody=$unsafeBody})
    if($shared){foreach($aliasTrigger in $aliases){$blocks.Add(@{trigger=$aliasTrigger;context=$context;start=$offsets[$i];end=$end;body=$body;complete=$complete;braceNext=$false;shared=$true;sharedHeaders=$sharedHeaders;unsafeHeader=$unsafeHeader;unsafeBody=$unsafeBody})}}
    if($complete -and $j -gt $i){$i=$j}
  }
  return $blocks.ToArray()
}
function Read-Entry([string]$Trigger,[string]$Context) {
  $text=(Read-AhkFile $script:ActionPath); $matches=@(Get-Hotkeys $text | Where-Object {(Get-HotkeyCanonical $_.trigger) -eq (Get-HotkeyCanonical $Trigger) -and $_.context -eq $Context})
  if ($matches.Count -gt 1 -or ($matches.Count -and !$matches[0].complete)) { throw 'Trigger ambíguo ou bloco incompleto; arquivo preservado para revisão.' }
  if (!$matches.Count) { return @{code='';comment=''} }
  $body=$matches[0].body -split "`n"; $comments=[Collections.Generic.List[string]]::new()
  while ($body.Count -and (!$body[0].Trim() -or $body[0].TrimStart().StartsWith(';'))) {if ($body[0].TrimStart().StartsWith(';')) {$comments.Add($body[0].TrimStart().Substring(1).Trim())};$body=@($body | Select-Object -Skip 1)}
  return @{code=($body -join "`n").TrimEnd("`r","`n");comment=($comments -join "`n")}
}
function Write-Entry([string]$Trigger,[string]$Context,[string]$Code,[string]$Comment) {
  $text=(Read-AhkFile $script:ActionPath); $blocks=@(Get-Hotkeys $text | Where-Object {(Get-HotkeyCanonical $_.trigger) -eq (Get-HotkeyCanonical $Trigger) -and $_.context -eq $Context})
  if ($blocks.Count -gt 1 -or ($blocks.Count -and !$blocks[0].complete)) {throw 'Hotkey ambígua ou incompleta neste contexto; arquivo preservado.'}
  if($blocks.Count -and $blocks[0].unsafeHeader){throw 'O cabeçalho contém comentários; edite no editor externo para preservá-los.'};if($blocks.Count -and $blocks[0].unsafeBody){throw 'A ação contém fluxo condicional que precisa ser editado no editor externo.'};if($blocks.Count){$Trigger=$blocks[0].trigger}
  $prefix=(($Comment -split "`r?`n" | Where-Object {$_}) | ForEach-Object {'; '+$_}) -join "`r`n"
  if ($prefix) {$prefix+="`r`n"}; $v=Get-Version
  if ($v -eq '2') {if($blocks.Count -and $blocks[0].braceNext){$replacement="$Trigger::`r`n{`r`n$prefix$Code`r`n}"}else{$replacement="$Trigger::{`r`n$prefix$Code`r`n}"}} else {$headers=if($blocks.Count -and $blocks[0].shared){$blocks[0].sharedHeaders}else{"$Trigger::"};$endReturn=if($Code -match '(?im)^\s*return\s*(?:;.*)?\s*$' -and $Code.TrimEnd() -match '(?i)(?:^|\n)\s*return\s*(?:;[^\r\n]*)?$'){''}else{"`r`nreturn"};$replacement="$headers`r`n$prefix$Code$endReturn"}
  if ($blocks.Count) {$b=$blocks[0];$text=$text.Substring(0,$b.start).TrimEnd("`r","`n")+"`r`n`r`n"+$replacement+"`r`n`r`n"+$text.Substring([Math]::Min($b.end,$text.Length)).TrimStart("`r","`n")+"`r`n"}
  elseif ($Context -eq 'global') {
    $first=[regex]::Match($text,'(?im)^[ \t]*#(?:IfWinActive|If|HotIf)(?=[ \t\r\n]|$)[^\r\n]*')
    $pos=if($first.Success){$first.Index}else{$text.Length};$before=$text.Substring(0,$pos).TrimEnd("`r","`n");$after=$text.Substring($pos).TrimStart("`r","`n")
    $text=($(if($before){$before+"`r`n`r`n"}else{''})+$replacement+"`r`n`r`n"+$after)
  }
  else {
    if ($Context -notmatch '^exe:[\w.-]+\.exe$') {throw 'Contexto inválido.'};$exe=$Context.Substring(4);$directive=if ($v -eq '2') {'#HotIf'} else {'#If'}
    $directives=[regex]::Matches($text,'(?im)^[ \t]*#(?:IfWinActive|If|HotIf)(?=[ \t\r\n]|$)[^\r\n]*');$inserted=$false
    for($n=0;$n -lt $directives.Count;$n++){
      $line=$directives[$n].Value;$match=[regex]::Match($line,'(?i)^\s*#(?:If|HotIf)\s+WinActive\(\s*["'']ahk_exe\s+([\w.-]+\.exe)["'']\s*\)\s*(?:;.*)?$');if(!$match.Success){$match=[regex]::Match($line,'(?i)^\s*#IfWinActive\s+ahk_exe\s+([\w.-]+\.exe)\s*(?:;.*)?$')}
      if(!$match.Success -or $match.Groups[1].Value -ine $exe){continue}
      $end=if($n+1 -lt $directives.Count){$directives[$n+1].Index}else{$text.Length};$before=$text.Substring(0,$end).TrimEnd("`r","`n");$after=$text.Substring($end).TrimStart("`r","`n");$text=$before+"`r`n`r`n"+$replacement+"`r`n`r`n"+$after;$inserted=$true;break
    }
    if(!$inserted){$text=$text.TrimEnd("`r","`n")+"`r`n`r`n$directive WinActive(`"ahk_exe $exe`")`r`n`r`n$replacement`r`n`r`n"}
  }
  Atomic-Write $script:ActionPath $text
}
function Send-Response($Response,[int]$Status=200,[string]$Type='application/json; charset=utf-8') {
  $bytes=if ($Response -is [byte[]]) {$Response} else {[Text.Encoding]::UTF8.GetBytes(($Response | ConvertTo-Json -Depth 100 -Compress))}
  $script:Response.StatusCode=$Status;$script:Response.ContentType=$Type;$script:Response.Headers['Cache-Control']='no-store';$script:Response.Headers['X-Content-Type-Options']='nosniff';$script:Response.Headers['Content-Security-Policy']="default-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'";$script:Response.ContentLength64=$bytes.Length;$script:Response.OutputStream.Write($bytes,0,$bytes.Length);$script:Response.Close()
}
function Fail([string]$Message,[int]$Status=400) {Send-Response @{ok=$false;error=$Message} $Status}
function Handle-Request($Request,$Response) {
  $script:Response=$Response
  if ($Request.Url.Host -notin @('127.0.0.1','localhost') -or $Request.Url.Port -ne $Port) {return (Fail 'Host não permitido.' 403)}
  if ($Request.HttpMethod -eq 'OPTIONS') {$Response.Headers['Access-Control-Allow-Origin']="http://127.0.0.1:$Port";$Response.Headers['Access-Control-Allow-Headers']='Content-Type, X-KM16-Token';$Response.Headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';$Response.StatusCode=204;$Response.Close();return}
  $path=$Request.Url.AbsolutePath
  if ($Request.HttpMethod -eq 'GET' -and $path -eq '/api/state') {
    return (Send-Response (Get-AppState))
  }
  if ($Request.HttpMethod -eq 'GET' -and $path -eq '/api/action') {
    $trigger=$Request.QueryString['trigger'];$context=$Request.QueryString['context'];if(!$context){$context='global'}
    if($trigger -notmatch '^[A-Za-z0-9_.:+^!#-]{1,120}$'){return(Fail 'Trigger inválido.')};try{$entry=Read-Entry $trigger $context;return(Send-Response (@{ok=$true;trigger=$trigger;context=$context}+ $entry))}catch{return(Fail $_.Exception.Message 409)}
  }
  if ($Request.HttpMethod -eq 'POST') {
    if ($Request.Headers['X-KM16-Token'] -ne $Token) {return(Fail 'Token de sessão inválido; recarregue o aplicativo.' 403)}
    $reader=[IO.StreamReader]::new($Request.InputStream,[Text.Encoding]::UTF8);try{$data=$reader.ReadToEnd()|ConvertFrom-Json}catch{return(Fail 'JSON inválido.')};
    switch ($path) {
      '/api/heartbeat' {$script:LastHeartbeat=[DateTime]::UtcNow;return(Send-Response @{ok=$true})}
      '/api/profiles' {
        Ensure-Data;$name=([string]$data.name).Trim();if($name.Length -lt 1 -or $name.Length -gt 48){return(Fail 'O nome do perfil deve ter entre 1 e 48 caracteres.')}
        $profiles=@(Get-ProfileRegistry);if(@($profiles|Where-Object {$_.name -eq $name}).Count){return(Fail 'Já existe um perfil com esse nome.')}
        $id='board-'+[guid]::NewGuid().ToString('N');$profile=@{id=$id;name=$name};$newProfiles=@($profiles)+@($profile);Set-ProfileRegistry $newProfiles
        [void](Activate-Profile $id -Persist);return(Send-Response (Get-AppState))
      }
      '/api/profile/select' {Ensure-Data;$id=[string]$data.id;try{[void](Activate-Profile $id -Persist);return(Send-Response (Get-AppState))}catch{return(Fail $_.Exception.Message 404)}}
      '/api/profile/reorder' {Ensure-Data;$profiles=@(Get-ProfileRegistry);$ids=@($data.ids | ForEach-Object {[string]$_});if($ids.Count -ne $profiles.Count -or @($ids | Select-Object -Unique).Count -ne $profiles.Count){return(Fail 'Ordem de perfis inválida.')};$ordered=@();foreach($id in $ids){$match=@($profiles|Where-Object {$_.id -ceq $id});if($match.Count -ne 1){return(Fail 'Perfil não encontrado.')};$ordered+= $match[0]};Set-ProfileRegistry $ordered;return(Send-Response @{ok=$true;profiles=@($ordered);profileId=$script:ProfileId})}
      '/api/profile/reuse-ahk' {Ensure-Data;$id=[string]$data.id;if($id -eq $script:ProfileId -or !@((Get-ProfileRegistry)|Where-Object {$_.id -eq $id}).Count){return(Fail 'Perfil de origem inválido.')};$dir=Join-Path (Join-Path $DataDir 'profiles') $id;$saved=Join-Path $dir 'action-file.txt';$ver=Join-Path $dir 'ahk-version.json';if(!(Test-Path $saved)){return(Fail 'O perfil não possui arquivo AHK.')};$chosen=(Get-Content -Raw -LiteralPath $saved).Trim();if(!(Test-Path -LiteralPath $chosen) -or [IO.Path]::GetExtension($chosen) -ine '.ahk'){return(Fail 'O arquivo AHK do perfil não foi encontrado.')};$version='1';if(Test-Path $ver){$version=[string](Get-Content -Raw -LiteralPath $ver|ConvertFrom-Json).version};if($version -notin @('1','2')){return(Fail 'Versão AHK inválida no perfil de origem.')};[IO.File]::WriteAllText($script:SavedPath,$chosen,[Text.UTF8Encoding]::new($false));Atomic-Write $script:VersionPath ('{"version":"'+$version+'"}');return(Send-Response (Get-AppState))}
      '/api/profile/rename' {Ensure-Data;$id=[string]$data.id;$name=([string]$data.name).Trim();$profiles=@(Get-ProfileRegistry);$profile=@($profiles|Where-Object {$_.id -eq $id})|Select-Object -First 1;if(!$profile){return(Fail 'Perfil não encontrado.' 404)};if(!$name -or $name.Length -gt 48 -or @($profiles|Where-Object {$_.id -ne $id -and $_.name -eq $name}).Count){return(Fail 'Nome inválido ou já utilizado.')};$profile.name=$name;Set-ProfileRegistry $profiles;return(Send-Response (Get-AppState))}
      '/api/profile/delete' {Ensure-Data;$id=[string]$data.id;$profiles=@(Get-ProfileRegistry);if($profiles.Count -le 1){return(Fail 'Mantenha pelo menos um perfil.')};if(!@($profiles|Where-Object {$_.id -eq $id}).Count){return(Fail 'Perfil não encontrado.' 404)};$remaining=@($profiles|Where-Object {$_.id -ne $id});Set-ProfileRegistry $remaining;if($script:ProfileId -eq $id){[void](Activate-Profile ([string]$remaining[0].id) -Persist)};return(Send-Response (Get-AppState))}
      '/api/action' {try{Write-Entry ([string]$data.trigger) ([string]$data.context) ([string]$data.code) ([string]$data.comment)}catch{return(Fail $_.Exception.Message 409)};$reload=Request-AhkReload $script:ActionPath;return(Send-Response @{ok=$true;trigger=$data.trigger;context=$data.context;actionFile=$script:ActionPath;reload=$reload})}
      '/api/files' {try{Ensure-Data;foreach($p in $data.files.PSObject.Properties){if($p.Name -notin @('definition.json','mapping.json')){throw 'Nome de arquivo não permitido.'};$serialized=$p.Value|ConvertTo-Json -Depth 100;[IO.File]::WriteAllText((Join-Path $script:ProfileDirectory $p.Name),$serialized,[Text.UTF8Encoding]::new($false))};return(Send-Response @{ok=$true;profileId=$script:ProfileId})}catch{return(Fail $_.Exception.Message 400)}}
      '/api/version' {if($data.version -notin @('1','2')){return(Fail 'Versão inválida.')};$existing=(Read-AhkFile $script:ActionPath);$rest=[regex]::Replace($existing,'(?im)^\s*#Requires\s+AutoHotkey\s+v?[12](?:\.\d+)*\s*$','').Trim();if($rest){return(Fail 'A versão só pode mudar antes de haver ações no arquivo.' 409)};$required=if($data.version -eq '1'){'v1.1'}else{'v2.0'};Atomic-Write $script:ActionPath ("#Requires AutoHotkey $required`r`n`r`n");Atomic-Write $VersionPath ('{"version":"'+$data.version+'"}');return(Send-Response @{ok=$true;version=$data.version})}
      '/api/select-file' {Ensure-Data;$version=[string]$data.version;if($version -notin @('1','2')){return(Fail 'Selecione AutoHotkey v1 ou v2.')};$dialog=if($data.mode -eq 'new'){[System.Windows.Forms.SaveFileDialog]::new()}else{[System.Windows.Forms.OpenFileDialog]::new()};$dialog.Filter='AutoHotkey (*.ahk)|*.ahk';$dialog.DefaultExt='ahk';$dialog.AddExtension=$true;if($dialog.ShowDialog() -ne 'OK'){return(Send-Response @{ok=$true;cancelled=$true})};$chosen=$dialog.FileName;if($data.mode -eq 'new' -and (Test-Path $chosen)){return(Fail 'O arquivo já existe; escolha outro nome.' 409)};if($data.mode -eq 'new'){$required=if($version -eq '1'){'v1.1'}else{'v2.0'};[IO.File]::WriteAllText($chosen,"#Requires AutoHotkey $required`r`n`r`n",[Text.UTF8Encoding]::new($true))};$text=(Read-AhkFile $chosen);$requires=[regex]::Match($text,'(?mi)^\s*#Requires\s+AutoHotkey\s+v?([12])(?:\.\d+)*\s*$');if($requires.Success -and $requires.Groups[1].Value -ne $version){return(Fail 'A versão escolhida diverge da diretiva #Requires do arquivo.' 409)};$script:ActionPath=$chosen;[IO.File]::WriteAllText($script:SavedPath,$chosen,[Text.UTF8Encoding]::new($false));Atomic-Write $script:VersionPath ('{"version":"'+$version+'"}');return(Send-Response @{ok=$true;cancelled=$false;actionFile=$chosen;contexts=(Get-Contexts $text)})}
      '/api/open-editor' {try{Start-Process $script:ActionPath -Verb Edit;return(Send-Response @{ok=$true;actionFile=$script:ActionPath})}catch{return(Fail $_.Exception.Message 500)}}
      default {return(Fail 'Rota não encontrada.' 404)}
    }
  }
  if ($Request.HttpMethod -eq 'GET') {
    $relative=if($path -eq '/'){'index.html'}else{$path.TrimStart('/')};$target=[IO.Path]::GetFullPath((Join-Path $Root $relative));if(!$target.StartsWith($Root,[StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $target)){return(Fail 'Arquivo não encontrado.' 404)}
    $type=switch([IO.Path]::GetExtension($target).ToLowerInvariant()){'.html'{'text/html; charset=utf-8'}'.js'{'text/javascript; charset=utf-8'}'.css'{'text/css; charset=utf-8'}'.svg'{'image/svg+xml'}default{'application/octet-stream'}};return(Send-Response ([IO.File]::ReadAllBytes($target)) 200 $type)
  }
  Fail 'Rota não encontrada.' 404
}

Ensure-Data
$listener=[Net.HttpListener]::new();$listener.Prefixes.Add("http://127.0.0.1:$Port/")
try {
  $listener.Start()
  Start-Process "http://127.0.0.1:$Port/"
  Write-Host "VIA-AHK Studio aberto em http://127.0.0.1:$Port/"
  Write-Host "R: reiniciar   X: fechar"
  $script:LastHeartbeat=[DateTime]::UtcNow
  $restartRequested=$false
  $pending=$listener.BeginGetContext($null,$null)
  while ($listener.IsListening) {
    try { if ([Console]::KeyAvailable) { $key=[Console]::ReadKey($true).Key; if($key -eq [ConsoleKey]::R){$restartRequested=$true;break};if($key -eq [ConsoleKey]::X){break} } } catch {}
    if (!$pending.AsyncWaitHandle.WaitOne(1000)) { if (([DateTime]::UtcNow-$script:LastHeartbeat).TotalSeconds -gt 120) { break }; continue }
    $ctx = $listener.EndGetContext($pending)
    try { Handle-Request $ctx.Request $ctx.Response }
    catch { try { Send-Response @{ok=$false;error=$_.Exception.Message} 500 } catch {} }
    $pending=$listener.BeginGetContext($null,$null)
  }
}
finally { try { $listener.Close() } catch [ObjectDisposedException] {} }
if($restartRequested){exit 42}
