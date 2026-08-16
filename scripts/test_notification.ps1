# Test script: send a test notification payload to the Edge Function or direct to notification_queue

param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string]$SupabaseUrl,
  [Parameter(Mandatory = $true)]
  [string]$ServiceRole,
  [string]$EdgeFunctionUrl = "",
  [Parameter(Mandatory = $true)]
  [guid]$UserId
)

$payload = @{ payload = @{ user_id = $UserId; status = "playing"; current_game = "Test Game"; started_at = (Get-Date).ToUniversalTime().ToString("o") } } | ConvertTo-Json -Depth 3

if ($EdgeFunctionUrl -ne "") {
  Write-Host "Posting to Edge Function: $EdgeFunctionUrl"
  Invoke-RestMethod -Method Post -Uri $EdgeFunctionUrl -Body $payload -ContentType 'application/json'
} else {
  # Insert directly into notification_queue (requires service role key)
  $url = "$SupabaseUrl/rest/v1/notification_queue"
  Write-Host "Inserting into notification_queue via $url"
  Invoke-RestMethod -Method Post -Uri $url -Headers @{ apikey = $ServiceRole; Authorization = "Bearer $ServiceRole" } -Body $payload -ContentType 'application/json'
}

Write-Host "Done."
