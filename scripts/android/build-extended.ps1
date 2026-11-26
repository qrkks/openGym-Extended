[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateRange(1, 2099000000)]
    [int]$Revision,

    [string]$SigningDirectory,
    [string]$KeyAlias = 'opengym-personal',
    [switch]$Unsigned
)

$ErrorActionPreference = 'Stop'

function Invoke-BuildTool {
    param([string]$Tool, [string[]]$Arguments)

    & $Tool @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$(Split-Path -Leaf $Tool) $($Arguments[0]) failed (exit code $LASTEXITCODE)."
    }
}

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$frontend = Join-Path $repo 'frontend'
$android = Join-Path $frontend 'android'
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$java = $env:JAVA_HOME
if (-not $java) { $java = Join-Path $env:ProgramFiles 'Android\Android Studio\jbr' }
if (-not (Test-Path -LiteralPath (Join-Path $java 'bin\javac.exe'))) {
    throw 'Set JAVA_HOME to your JDK 21 directory.'
}
$buildTools = Join-Path $sdk 'build-tools\36.0.0'
$aapt = Join-Path $buildTools 'aapt2.exe'
if (-not (Test-Path -LiteralPath $aapt)) {
    throw 'Install Android SDK Build Tools 36.0.0 and set ANDROID_HOME to your SDK directory.'
}

$baseVersion = (Get-Content -LiteralPath (Join-Path $frontend 'package.json') -Raw | ConvertFrom-Json).version
$version = "$baseVersion.$Revision"
$versionCode = 1000000 + $Revision
$packageDir = Join-Path $android 'app\build\outputs\apk\extended\release'
$unsignedApk = Join-Path $packageDir 'app-extended-release-unsigned.apk'
$expectedPackage = "package: name='io.github.qrkks.opengym' versionCode='$versionCode' versionName='$version'"

$originalEnvironment = @{}
foreach ($name in 'Path', 'JAVA_HOME', 'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'VITE_MOBILE', 'VITE_EXTENDED_ANDROID', 'APP_EXTENDED_REVISION', 'OPENGYM_LOCAL_SIGN_PASS') {
    $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

$secret = $null
$lock = $null
$aligned = $null
$candidate = $null
try {
    if (-not $Unsigned) {
        if (-not $SigningDirectory) { $SigningDirectory = "$repo-android-signing" }
        $keystore = Join-Path $SigningDirectory "$KeyAlias.p12"
        $password = Join-Path $SigningDirectory 'password.dpapi'
        if (-not (Test-Path -LiteralPath $keystore -PathType Leaf) -or -not (Test-Path -LiteralPath $password -PathType Leaf)) {
            throw "Release signing files are missing in '$SigningDirectory'. Use -SigningDirectory to locate them or -Unsigned to build without signing."
        }
        $keystore = (Resolve-Path -LiteralPath $keystore).Path
        try {
            $secret = ConvertTo-SecureString ((Get-Content -LiteralPath $password -Raw).Trim())
        } catch {
            throw 'The signing password could not be unlocked. Run this command as the Windows user who saved password.dpapi, or use -Unsigned.'
        }
    }

    $nodeDirectory = Join-Path $env:ProgramFiles 'nodejs'
    if (Test-Path -LiteralPath (Join-Path $nodeDirectory 'npm.cmd')) {
        $env:Path = "$nodeDirectory;$env:Path"
    }
    $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $env:JAVA_HOME = $java
    $env:ANDROID_HOME = $sdk
    $env:ANDROID_SDK_ROOT = $sdk
    $env:VITE_MOBILE = '1'
    $env:VITE_EXTENDED_ANDROID = '1'
    $env:APP_EXTENDED_REVISION = [string]$Revision

    $gradleState = Join-Path $android '.gradle'
    New-Item -ItemType Directory -Path $gradleState -Force | Out-Null
    try {
        $lock = [IO.File]::Open((Join-Path $gradleState 'opengym-extended.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    } catch [IO.IOException] {
        throw 'Could not lock the Android build directory. Check for another local Extended build running in this checkout.'
    }

    Write-Host "Building openGym Extended $version"
    Push-Location -LiteralPath $frontend
    try {
        if (-not (Test-Path -LiteralPath 'node_modules\.bin\vite.cmd') -or -not (Test-Path -LiteralPath 'node_modules\.bin\cap.cmd')) {
            Invoke-BuildTool $npm @('ci', '--ignore-scripts', '--no-audit', '--no-fund')
        }
        Invoke-BuildTool $npm @('run', 'build:mobile:assets')
        Invoke-BuildTool (Join-Path $frontend 'node_modules\.bin\cap.cmd') @('sync', 'android')
        Invoke-BuildTool $node @('scripts/check-mobile-bundle.mjs', '--android')
    } finally {
        Pop-Location
    }

    Push-Location -LiteralPath $android
    try {
        Invoke-BuildTool (Join-Path $android 'gradlew.bat') @('--console=plain', "-PextendedRevision=$Revision", 'assembleExtendedRelease')
    } finally {
        Pop-Location
    }

    $badging = Invoke-BuildTool $aapt @('dump', 'badging', $unsignedApk)
    if (-not ($badging | Select-String -SimpleMatch $expectedPackage) -or
        -not ($badging | Select-String -SimpleMatch "uses-permission: name='android.permission.REQUEST_INSTALL_PACKAGES'")) {
        throw 'The APK has the wrong package ID or version, or is missing the installer permission.'
    }
    if ($Unsigned) {
        Write-Output "Unsigned APK: $unsignedApk"
        return
    }

    $outputDir = Join-Path $android 'app\build\local-apks'
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    $tempId = [Guid]::NewGuid().ToString('N')
    $aligned = Join-Path $outputDir "$tempId-aligned.apk"
    $candidate = Join-Path $outputDir "$tempId-signed.apk"
    $signedApk = Join-Path $outputDir "openGym-Extended-$version.apk"
    $zipalign = Join-Path $buildTools 'zipalign.exe'
    $apksigner = Join-Path $buildTools 'apksigner.bat'

    Invoke-BuildTool $zipalign @('-P', '16', '-f', '4', $unsignedApk, $aligned)
    $secretPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try {
        $env:OPENGYM_LOCAL_SIGN_PASS = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPtr)
        Invoke-BuildTool $apksigner @('sign', '--ks', $keystore, '--ks-key-alias', $KeyAlias, '--ks-pass', 'env:OPENGYM_LOCAL_SIGN_PASS', '--v4-signing-enabled', 'false', '--out', $candidate, $aligned)
    } finally {
        Remove-Item Env:OPENGYM_LOCAL_SIGN_PASS -ErrorAction SilentlyContinue
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPtr)
    }

    Invoke-BuildTool $zipalign @('-c', '-P', '16', '4', $candidate)
    $certificate = Invoke-BuildTool $apksigner @('verify', '--print-certs', $candidate)
    $expectedCertificate = 'Signer #1 certificate SHA-256 digest: 8cd52a3614766b3f4989912d67ceb65c6bbe5741d38988b6d5fea7c748a83299'
    if ($certificate -notcontains $expectedCertificate) {
        throw 'The APK signing certificate does not match the OpenGym Extended release certificate.'
    }

    Move-Item -LiteralPath $candidate -Destination $signedApk -Force
    Write-Output "Signed and verified: $signedApk"
} finally {
    if ($secret) { $secret.Dispose() }
    if ($lock) { $lock.Dispose() }
    foreach ($tempFile in $aligned, $candidate) {
        if ($tempFile) { Remove-Item -LiteralPath $tempFile -ErrorAction SilentlyContinue }
    }
    foreach ($name in $originalEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process')
    }
}
