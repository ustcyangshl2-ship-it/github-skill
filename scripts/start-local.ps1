$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskEnvPath = Join-Path $taskRoot '.env'
if (!(Test-Path -LiteralPath $taskEnvPath)) { throw 'Configure .env and PostgreSQL first; see README.' }
$localNative = Join-Path $env:LOCALAPPDATA 'SkillHub\postgres\native'
$taskEnvText = [IO.File]::ReadAllText($taskEnvPath)
if ($taskEnvText.Contains('@127.0.0.1:55432/skillhub') -and (Test-Path -LiteralPath (Join-Path $localNative 'bin\pg_ctl.exe'))) {
  & (Join-Path $PSScriptRoot 'local-db.ps1') -NativeRoot $localNative
  if ($LASTEXITCODE -ne 0) { throw 'Local PostgreSQL startup failed.' }
}
& (Join-Path $PSScriptRoot 'run.ps1') start
exit $LASTEXITCODE
