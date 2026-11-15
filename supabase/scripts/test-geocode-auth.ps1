# =====================================================================
# Teste autenticado da Edge Function geocode-address
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File supabase/scripts/test-geocode-auth.ps1
#
# O e-mail pode ser informado por parâmetro ou por TEST_USER_EMAIL.
# A senha NUNCA deve ser passada na linha de comando: o script pede em
# modo seguro (ou lê TEST_USER_PASSWORD em ambientes de CI).
#
# O script lê a URL e a chave publishable de frontend/.env.local e imprime
# apenas o resultado da geocodificação. Tokens e chaves não são exibidos.
# =====================================================================

param(
  [string]$Email = $env:TEST_USER_EMAIL,
  [string]$AddressString = 'Rua Vereador João Cardoso, 512, Jardim Mariana, Cajamar, SP, 07793-240, Brasil'
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envFile = Join-Path $root 'frontend/.env.local'

if (-not (Test-Path $envFile)) {
  throw "Arquivo não encontrado: $envFile"
}

$vars = @{}
foreach ($line in Get-Content $envFile) {
  $trimmed = $line.Trim()
  if (-not $trimmed -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) {
    continue
  }
  $index = $trimmed.IndexOf('=')
  $vars[$trimmed.Substring(0, $index).Trim()] = $trimmed.Substring($index + 1).Trim()
}

$base = $vars['VITE_SUPABASE_URL']
$anonKey = $vars['VITE_SUPABASE_ANON_KEY']
if (-not $base -or -not $anonKey) {
  throw 'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY precisam estar em frontend/.env.local.'
}

if (-not $Email) {
  $Email = Read-Host 'E-mail da conta de teste confirmada'
}

if ($env:TEST_USER_PASSWORD) {
  $senha = $env:TEST_USER_PASSWORD
} else {
  $secure = Read-Host 'Senha da conta de teste (não será exibida)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $senha = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

if (-not $senha) {
  throw 'Senha vazia.'
}

function Mask-Email([string]$value) {
  $parts = $value.Split('@')
  if ($parts.Count -ne 2) { return '***' }
  $name = $parts[0]
  $visible = if ($name.Length -le 2) { $name.Substring(0, 1) } else { $name.Substring(0, 2) }
  return "$visible***@$($parts[1])"
}

$authBody = @{
  email = $Email
  password = $senha
} | ConvertTo-Json

try {
  $auth = Invoke-RestMethod -Uri "$base/auth/v1/token?grant_type=password" `
    -Method Post `
    -Headers @{ apikey = $anonKey } `
    -ContentType 'application/json' `
    -Body $authBody `
    -TimeoutSec 30
} catch {
  $status = $_.Exception.Response.StatusCode.value__
  $detail = ''
  if ($_.ErrorDetails.Message) {
    try {
      $parsed = $_.ErrorDetails.Message | ConvertFrom-Json
      $detail = $parsed.msg
      if (-not $detail) { $detail = $parsed.error_description }
      if (-not $detail) { $detail = $parsed.message }
      if (-not $detail) { $detail = '' }
    } catch {
      $detail = 'resposta de erro não estruturada'
    }
  }
  throw "Falha no login (HTTP $status): $detail"
}

if (-not $auth.access_token) {
  throw 'O login não retornou access_token. Confirme o e-mail da conta no painel do Supabase.'
}

Write-Output "Autenticação: OK ($(Mask-Email $Email))"

$body = @{ addressString = $AddressString } | ConvertTo-Json

try {
  $response = Invoke-WebRequest -Uri "$base/functions/v1/geocode-address" `
    -Method Post `
    -Headers @{
      apikey = $anonKey
      Authorization = "Bearer $($auth.access_token)"
      Origin = 'http://127.0.0.1:5173'
    } `
    -ContentType 'application/json' `
    -Body $body `
    -UseBasicParsing `
    -TimeoutSec 30

  Write-Output "HTTP $($response.StatusCode)"
  Write-Output $response.Content
} catch {
  $status = $_.Exception.Response.StatusCode.value__
  $text = ''
  if ($_.ErrorDetails.Message) { $text = $_.ErrorDetails.Message }
  Write-Output "HTTP $status"
  Write-Output $text
  exit 1
} finally {
  # Evita manter a senha/token na memória do processo.
  $senha = $null
  $auth = $null
}
