# Test script: send a test notification payload to the Edge Function or direct to notification_queue

param(
  [string]$SupabaseUrl = "https://your-project.supabase.co",
  [string]$ServiceRole = "YOUR_SERVICE_ROLE_KEY",
  [string]$EdgeFunctionUrl = "",
  [string]$UserId = "REPLACE_WITH_USER_UUID"
)

$payload = @{ user_id = $UserId; status = "playing"; current_game = "Test Game"; started_at = (Get-Date).ToString("o") } | ConvertTo-Json

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
