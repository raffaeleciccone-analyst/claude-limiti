# claude-limiti - one-command install for Windows, no Node.js needed beforehand.
#   irm https://raw.githubusercontent.com/raffaeleciccone-analyst/claude-limiti/main/install.ps1 | iex
# With options (e.g. --codex, --force, --remove):
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/raffaeleciccone-analyst/claude-limiti/main/install.ps1))) --codex
#
# What it does:
#  1. uses Node.js 18+ if the computer has it; otherwise downloads the official Node.js LTS from
#     nodejs.org, checks its SHA-256 and keeps only node.exe in ~/.claude/limiti-runtime
#     (private copy: no admin rights, nothing installed system-wide, removed with --remove);
#  2. downloads the latest claude-limiti release from GitHub into a temporary folder;
#  3. runs its install.mjs (see the README), then deletes the temporary folder.
# The status line itself never uses the network.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Windows PowerShell downloads are very slow with the progress bar
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

$Repo = 'raffaeleciccone-analyst/claude-limiti'
$It = (Get-Culture).TwoLetterISOLanguageName -eq 'it'
function Say($it, $en) { if ($It) { Write-Host $it } else { Write-Host $en } }

$ClaudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
$Runtime = Join-Path $ClaudeDir 'limiti-runtime'
$Tmp = Join-Path ([IO.Path]::GetTempPath()) ('claude-limiti-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $Tmp | Out-Null

try {
  # ---------- 1. Node ----------
  $Node = $null
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source -notmatch 'NVIDIA') {
    try { $major = [int](& $cmd.Source -e "process.stdout.write(process.versions.node.split('.')[0])") } catch { $major = 0 }
    if ($major -ge 18) { $Node = $cmd.Source }
  }
  $Private = Join-Path $Runtime 'node.exe'
  if (-not $Node -and (Test-Path $Private)) { $Node = $Private }
  if (-not $Node) {
    Say 'Node.js non trovato: scarico una copia privata da nodejs.org (circa 30 MB, solo per claude-limiti)...' `
        'Node.js not found: downloading a private copy from nodejs.org (about 30 MB, only for claude-limiti)...'
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
    $lts = (Invoke-RestMethod 'https://nodejs.org/dist/index.json' -UseBasicParsing) | Where-Object { $_.lts } | Select-Object -First 1
    $ver = $lts.version
    $name = "node-$ver-win-$arch"
    $zip = Join-Path $Tmp "$name.zip"
    Invoke-WebRequest "https://nodejs.org/dist/$ver/$name.zip" -OutFile $zip -UseBasicParsing
    $sums = (Invoke-WebRequest "https://nodejs.org/dist/$ver/SHASUMS256.txt" -UseBasicParsing).Content
    $want = ($sums -split "`n" | Where-Object { $_ -match "\s$([regex]::Escape("$name.zip"))\s*$" } | Select-Object -First 1) -replace '\s.*$', ''
    $got = (Get-FileHash $zip -Algorithm SHA256).Hash
    if (-not $want -or $got -ne $want.ToUpper()) { throw "SHA-256 check failed for $name.zip" }
    Expand-Archive $zip -DestinationPath $Tmp -Force
    New-Item -ItemType Directory -Force $Runtime | Out-Null
    Copy-Item (Join-Path $Tmp "$name\node.exe") $Private -Force
    Copy-Item (Join-Path $Tmp "$name\LICENSE") (Join-Path $Runtime 'LICENSE-node.txt') -Force
    Say "Node $ver pronto in $Runtime" "Node $ver ready in $Runtime"
    $Node = $Private
  }

  # ---------- 2. claude-limiti ----------
  if ($env:LIMITI_SOURCE) {
    $Src = $env:LIMITI_SOURCE   # local copy, for testing
  } else {
    $ref = 'main'
    try { $ref = (Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest" -UseBasicParsing).tag_name } catch {}
    Say "Scarico claude-limiti ($ref) da GitHub..." "Downloading claude-limiti ($ref) from GitHub..."
    $pkg = Join-Path $Tmp 'claude-limiti.zip'
    $kind = if ($ref -eq 'main') { 'heads' } else { 'tags' }
    Invoke-WebRequest "https://github.com/$Repo/archive/refs/$kind/$ref.zip" -OutFile $pkg -UseBasicParsing
    Expand-Archive $pkg -DestinationPath (Join-Path $Tmp 'src') -Force
    $Src = (Get-ChildItem (Join-Path $Tmp 'src') -Directory | Select-Object -First 1).FullName
  }

  # ---------- 3. install ----------
  & $Node (Join-Path $Src 'install.mjs') @args
  if (($args -contains '--remove' -or $args -contains '--rimuovi') -and (Test-Path $Runtime)) {
    # node.exe has exited now, so its folder can go (install.mjs could not delete it while running)
    Remove-Item $Runtime -Recurse -Force -ErrorAction SilentlyContinue
    if (-not (Test-Path $Runtime)) { Say "Copia privata di Node rimossa: $Runtime" "Private copy of Node removed: $Runtime" }
  }
  # no "exit" here: run through iex it would close the PowerShell window
} finally {
  Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue
}
