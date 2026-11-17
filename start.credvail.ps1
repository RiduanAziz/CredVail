<#
.SYNOPSIS
    CREDVAIL — Unified Pipeline Orchestrator & One-Click Runner
.DESCRIPTION
    Automates pre-flight verification, environment setup, database client generation,
    brand asset processing, TypeScript validation, production/development compilation,
    and server startup in a single command.
.PARAMETER Mode
    Execution mode: 'dev' (default Next.js hot-reload dev server) or 'prod' (production build + server).
.PARAMETER Port
    Port number to listen on (default: 3000).
.PARAMETER SkipBuild
    Skip the Next.js compilation step and start server immediately.
.PARAMETER RunTests
    Execute full Vitest and Phase 0-13 test verification suites before startup.
.EXAMPLE
    .\start.credvail.ps1
    .\start.credvail.ps1 -Mode prod
    .\start.credvail.ps1 -Port 8080
    .\start.credvail.ps1 -RunTests
#>

[CmdletBinding()]
param(
    [ValidateSet("dev", "prod", "build-only", "test")]
    [string]$Mode = "dev",

    [int]$Port = 3000,

    [switch]$SkipBuild,

    [switch]$RunTests,

    [switch]$OpenBrowser
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location -Path $ScriptRoot

# --- UI Color Helpers ---
function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor White
    Write-Host "================================================================================" -ForegroundColor Cyan
}

function Write-Step {
    param([string]$StepNum, [string]$Title)
    Write-Host ""
    Write-Host "[$StepNum] " -ForegroundColor Yellow -NoNewline
    Write-Host $Title -ForegroundColor White
}

function Write-Success {
    param([string]$Text)
    Write-Host "  [OK] $Text" -ForegroundColor Green
}

function Write-Info {
    param([string]$Text)
    Write-Host "  [i]  $Text" -ForegroundColor Cyan
}

function Write-WarningMsg {
    param([string]$Text)
    Write-Host "  [!]  $Text" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Text)
    Write-Host "  [X]  $Text" -ForegroundColor Red
}

Clear-Host
Write-Host "
   ____ ____  _____ ______     ___    ___ _     
  / ___|  _ \| ____|  _ \ \   / / \  |_ _| |    
 | |   | |_) |  _| | | | \ \ / / _ \  | || |    
 | |___|  _ <| |___| |_| |\ V / ___ \ | || |___ 
  \____|_| \_\_____|____/  \_/_/   \_\___|_____|
  Blockchain-Verified Credential Infrastructure
" -ForegroundColor Cyan

Write-Host "CREDVAIL Pipeline Orchestrator v1.0.0" -ForegroundColor Gray
Write-Host "Working Directory : $ScriptRoot" -ForegroundColor Gray
Write-Host "Execution Mode    : $Mode" -ForegroundColor Gray
Write-Host "Target Port       : $Port" -ForegroundColor Gray
Write-Host "Timestamp         : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray

try {
    # -------------------------------------------------------------------------
    # STAGE 1: Pre-Flight Runtime Verification
    # -------------------------------------------------------------------------
    Write-Step "1/6" "Checking Node.js & npm runtime..."
    
    $nodeVersion = node --version 2>$null
    if (-not $nodeVersion) {
        throw "Node.js executable was not found in PATH. Please install Node.js (v20+)."
    }
    Write-Success "Node.js detected: $nodeVersion"

    $npmVersion = npm --version 2>$null
    if (-not $npmVersion) {
        throw "npm executable was not found in PATH."
    }
    Write-Success "npm detected: v$npmVersion"

    # Check .env existence
    if (-not (Test-Path ".env")) {
        if (Test-Path ".env.example") {
            Copy-Item ".env.example" ".env"
            Write-WarningMsg "Missing '.env' detected. Created default configuration from '.env.example'."
        } else {
            throw "Neither '.env' nor '.env.example' was found."
        }
    } else {
        Write-Success "Environment configuration file (.env) confirmed."
    }

    # Verify node_modules
    if (-not (Test-Path "node_modules")) {
        Write-Info "node_modules not found. Running clean dependency install (npm ci)..."
        npm ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
    } else {
        Write-Success "Dependencies verified in node_modules."
    }

    # -------------------------------------------------------------------------
    # STAGE 2: Database Schema & Prisma Client Generation
    # -------------------------------------------------------------------------
    Write-Step "2/6" "Generating Prisma ORM Client & Validating Schema..."
    npx prisma generate
    if ($LASTEXITCODE -ne 0) {
        throw "Prisma Client generation failed."
    }
    Write-Success "Prisma Client generated and up-to-date."

    # -------------------------------------------------------------------------
    # STAGE 3: Brand Identity & Static Assets Pipeline
    # -------------------------------------------------------------------------
    Write-Step "3/6" "Verifying Brand Assets & Web Icons..."
    $requiredAssets = @(
        "public/brand/brand-symbol.png",
        "public/brand/logo-horizontal.png",
        "public/favicon.ico",
        "src/app/icon.png"
    )

    $missingAssets = $false
    foreach ($asset in $requiredAssets) {
        if (-not (Test-Path $asset)) {
            $missingAssets = $true
            break
        }
    }

    if ($missingAssets) {
        Write-Info "Generating production brand assets from assets/ directory..."
        node scripts/process-brand-assets.mjs
        if ($LASTEXITCODE -ne 0) {
            Write-WarningMsg "Brand asset processor encountered non-critical notice."
        } else {
            Write-Success "All brand assets and favicons rendered successfully."
        }
    } else {
        Write-Success "Brand assets, squircle icons, and favicons are verified."
    }

    # -------------------------------------------------------------------------
    # STAGE 4: TypeScript Strict Type Check
    # -------------------------------------------------------------------------
    Write-Step "4/6" "Validating TypeScript Type System..."
    npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) {
        throw "TypeScript type check failed. Run 'npx tsc --noEmit' to inspect issues."
    }
    Write-Success "Zero TypeScript compilation errors detected."

    # -------------------------------------------------------------------------
    # OPTIONAL: Test Verification Suite
    # -------------------------------------------------------------------------
    if ($RunTests -or $Mode -eq "test") {
        Write-Step "TEST" "Executing Comprehensive Test Verification Suites..."
        Write-Info "Running Vitest test matrix..."
        npm run test:vitest
        if ($LASTEXITCODE -ne 0) { throw "Vitest test suite failed." }

        Write-Info "Running Phase 0-13 System Verification scripts..."
        npm test
        if ($LASTEXITCODE -ne 0) { throw "System verification scripts failed." }
        
        Write-Success "100% of tests passed successfully."
        if ($Mode -eq "test") {
            Write-Header "CREDVAIL TEST SUITE COMPLETED SUCCESSFULLY"
            exit 0
        }
    }

    # -------------------------------------------------------------------------
    # STAGE 5: Next.js Compilation / Build
    # -------------------------------------------------------------------------
    if ($Mode -eq "prod" -or $Mode -eq "build-only" -or (-not $SkipBuild -and $Mode -eq "dev" -and -not (Test-Path ".next"))) {
        Write-Step "5/6" "Building Next.js Production Chunks..."
        Write-Info "Executing: npm run build"
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "Next.js build failed with exit code $LASTEXITCODE"
        }
        Write-Success "Next.js production build succeeded."

        if ($Mode -eq "build-only") {
            Write-Header "CREDVAIL PRODUCTION BUILD COMPLETED"
            exit 0
        }
    } else {
        Write-Step "5/6" "Next.js Build Step"
        Write-Success "Fast-path dev startup enabled (on-demand route compilation)."
    }

    # -------------------------------------------------------------------------
    # STAGE 6: Server Startup
    # -------------------------------------------------------------------------
    Write-Step "6/6" "Launching CREDVAIL Application Server..."
    
    $localUrl = "http://localhost:$Port"
    Write-Host ""
    Write-Host "  ------------------------------------------------------------" -ForegroundColor Green
    Write-Host "  CREDVAIL Service Ready!" -ForegroundColor Green
    Write-Host "  Local URL    : " -NoNewline -ForegroundColor White
    Write-Host $localUrl -ForegroundColor Cyan
    Write-Host "  Architecture : W3C VC 2.0 | Sepolia Anchoring | Argon2id" -ForegroundColor Gray
    Write-Host "  Press Ctrl+C to terminate server." -ForegroundColor Yellow
    Write-Host "  ------------------------------------------------------------" -ForegroundColor Green
    Write-Host ""

    if ($OpenBrowser) {
        Start-Process $localUrl
    }

    $env:PORT = $Port.ToString()

    if ($Mode -eq "prod") {
        Write-Info "Starting production server on port $Port..."
        npm run start -- -p $Port
    } else {
        Write-Info "Starting development hot-reload server on port $Port..."
        npm run dev -- -p $Port
    }

} catch {
    Write-Host ""
    Write-Fail "Pipeline execution halted due to an error:"
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    exit 1
}
