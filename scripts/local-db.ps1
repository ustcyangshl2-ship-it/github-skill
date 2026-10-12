param(
  [Parameter(Mandatory=$true)][string]$NativeRoot,
  [string]$RuntimeRoot = "$env:LOCALAPPDATA\SkillHub\postgres",
  [ValidateSet('start','stop')][string]$Action = 'start'
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$runtimePath = [IO.Path]::GetFullPath($RuntimeRoot)
if ($runtimePath -match '[^\x00-\x7F]' -or $runtimePath -eq [IO.Path]::GetPathRoot($runtimePath)) { throw 'Use an ASCII application-specific runtime path, not a drive root.' }
$nativePath = Join-Path $runtimePath 'native'
$dataPath = Join-Path $runtimePath 'data'
$envPath = Join-Path $taskRoot '.env'
if ($Action -eq 'stop') {
  & (Join-Path $nativePath 'bin\pg_ctl.exe') -D $dataPath -m fast -w stop
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL stop failed' }
  exit
}
if (!(Test-Path -LiteralPath (Join-Path $NativeRoot 'bin\postgres.exe'))) { throw 'NativeRoot must contain PostgreSQL bin, lib and share.' }
New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null
if (!(Test-Path -LiteralPath $nativePath)) { Copy-Item -LiteralPath $NativeRoot -Destination $nativePath -Recurse }
if (!(Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION'))) {
  if (Test-Path -LiteralPath $envPath) { throw 'Existing .env detected: use a configured PostgreSQL instance or initialize manually. Refusing to replace configuration.' }
  $dbPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
  $authSecret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  $passwordPath = Join-Path $runtimePath 'init-password.tmp'
  try {
    [IO.File]::WriteAllText($passwordPath, $dbPassword, [Text.UTF8Encoding]::new($false))
    & (Join-Path $nativePath 'bin\initdb.exe') -D $dataPath -U skillhub -A scram-sha-256 --encoding=UTF8 --locale=C "--pwfile=$passwordPath"
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initdb failed' }
  } finally { if (Test-Path -LiteralPath $passwordPath) { Remove-Item -LiteralPath $passwordPath } }
  [IO.File]::WriteAllText($envPath, "DATABASE_URL=postgresql://skillhub:$dbPassword@127.0.0.1:55432/skillhub?schema=public&connection_limit=5`nNEXTAUTH_URL=http://localhost:3300`nNEXTAUTH_SECRET=$authSecret`nGITHUB_CLIENT_ID=`nGITHUB_CLIENT_SECRET=`nGITHUB_TOKEN=`nLLM_API_KEY=`nLLM_MODEL=`nLLM_BASE_URL=https://api.example.com/v1`n", [Text.UTF8Encoding]::new($false))
}
& (Join-Path $nativePath 'bin\pg_ctl.exe') -D $dataPath status
if ($LASTEXITCODE -eq 0) { Write-Output 'SkillHub PostgreSQL already running'; exit }
& (Join-Path $nativePath 'bin\pg_ctl.exe') -D $dataPath -l (Join-Path $runtimePath 'server.log') -o '-p 55432 -h 127.0.0.1' -w start
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL start failed; inspect the application runtime server.log.' }
