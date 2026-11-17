[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    $RemainingArgs
)
& "$PSScriptRoot\start.credvail.ps1" @RemainingArgs
