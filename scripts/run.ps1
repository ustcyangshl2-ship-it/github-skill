param([string]$Task = 'dev', [Parameter(ValueFromRemainingArguments=$true)][string[]]$TaskArgs)
$ErrorActionPreference = 'Stop'
$taskNodePath = $env:SKILLHUB_NODE
if (!$taskNodePath) {
  $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  $taskNodePath = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node).Source }
}
$taskNodeVersion = & $taskNodePath -p 'process.versions.node'
$taskMajor = [int]($taskNodeVersion.Split('.')[0])
if ($taskMajor -notin 22,24) { throw 'Use Node 24 LTS (or 22.13+). Set SKILLHUB_NODE to its node.exe path.' }
$npmCommandPath = (Get-Command npm).Source
$taskNpmCli = Join-Path (Split-Path -Parent $npmCommandPath) 'node_modules\npm\bin\npm-cli.js'
if (!(Test-Path -LiteralPath $taskNpmCli)) { throw 'Cannot find npm CLI. Install npm with Node LTS.' }
$env:PATH = (Split-Path -Parent $taskNodePath) + ';' + $env:PATH
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
Write-Output "SkillHub: Node $taskNodeVersion; npm task $Task"
& $taskNodePath $taskNpmCli run $Task @TaskArgs
exit $LASTEXITCODE
