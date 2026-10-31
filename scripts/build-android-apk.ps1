[CmdletBinding()]
param(
  [string]$ShortPath = 'D:\p'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

function Resolve-NormalizedPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  return [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$ArgumentList
  )

  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath"
  }
}

function Test-Jdk17 {
  param([string]$JdkPath)

  if ([string]::IsNullOrWhiteSpace($JdkPath)) {
    return $false
  }

  $releaseFile = Join-Path $JdkPath 'release'
  return (Test-Path -LiteralPath (Join-Path $JdkPath 'bin\java.exe')) -and
    (Test-Path -LiteralPath $releaseFile) -and
    ((Get-Content -LiteralPath $releaseFile -Raw) -match 'JAVA_VERSION="17\.')
}

$projectRoot = Resolve-NormalizedPath (Join-Path $PSScriptRoot '..')
$workspaceOutput = Resolve-NormalizedPath (Join-Path $projectRoot '..\..\output')
$jdkCacheRoot = Join-Path $workspaceOutput 'photo-inbox-jdk17'
$jdkHome = $null

if (Test-Path -LiteralPath $jdkCacheRoot) {
  $jdkHome = Get-ChildItem -LiteralPath $jdkCacheRoot -Directory |
    Where-Object { Test-Jdk17 $_.FullName } |
    Sort-Object Name -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}

if (-not $jdkHome -and (Test-Jdk17 $env:JAVA_HOME)) {
  $jdkHome = $env:JAVA_HOME
}

if (-not $jdkHome) {
  throw "JDK 17 was not found. Keep the verified JDK under '$jdkCacheRoot' or set JAVA_HOME to JDK 17."
}

$androidRoot = Join-Path $projectRoot 'android'
Push-Location $projectRoot
try {
  # Always sync app.json and local Expo modules before Gradle so version and native changes cannot go stale.
  Invoke-Checked -FilePath 'npx.cmd' -ArgumentList @('expo', 'prebuild', '--platform', 'android', '--no-install')
}
finally {
  Pop-Location
}

$shortPathNormalized = Resolve-NormalizedPath $ShortPath
$createdJunction = $false

if (Test-Path -LiteralPath $shortPathNormalized) {
  $shortItem = Get-Item -LiteralPath $shortPathNormalized -Force
  $targetMatches = $false

  foreach ($target in @($shortItem.Target)) {
    if ($target -and ((Resolve-NormalizedPath $target) -ieq $projectRoot)) {
      $targetMatches = $true
      break
    }
  }

  if ($shortItem.LinkType -ne 'Junction' -or -not $targetMatches) {
    throw "Short path '$shortPathNormalized' already exists and is not a junction to '$projectRoot'."
  }
}
else {
  New-Item -ItemType Junction -Path $shortPathNormalized -Target $projectRoot | Out-Null
  $createdJunction = $true
}

try {
  $env:JAVA_HOME = $jdkHome
  $env:Path = "$(Join-Path $jdkHome 'bin');$env:Path"
  $env:NODE_OPTIONS = '--preserve-symlinks --preserve-symlinks-main'
  $env:NODE_ENV = 'production'

  $shortAndroidRoot = Join-Path $shortPathNormalized 'android'
  $gradleWrapper = Join-Path $shortAndroidRoot 'gradlew.bat'

  Push-Location $shortAndroidRoot
  try {
    Invoke-Checked -FilePath $gradleWrapper -ArgumentList @(
      ':app:generateAutolinkingNewArchitectureFiles',
      ':app:generateAutolinkingPackageList',
      '--no-daemon',
      '-Dorg.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=1536m',
      '-Pkotlin.compiler.execution.strategy=in-process'
    )

    $autolinkingCmake = Join-Path $shortAndroidRoot 'app\build\generated\autolinking\src\main\jni\Android-autolinking.cmake'
    if (-not (Test-Path -LiteralPath $autolinkingCmake)) {
      throw "Generated autolinking CMake file was not found: $autolinkingCmake"
    }

    $realRootUnix = $projectRoot.Replace('\', '/')
    $shortRootUnix = $shortPathNormalized.Replace('\', '/')
    $cmakeContents = Get-Content -LiteralPath $autolinkingCmake -Raw
    $patchedContents = $cmakeContents.Replace($realRootUnix, $shortRootUnix)

    if ($patchedContents -eq $cmakeContents -and $cmakeContents -notmatch [regex]::Escape($shortRootUnix)) {
      throw 'Expo autolinking paths could not be shortened.'
    }

    [System.IO.File]::WriteAllText($autolinkingCmake, $patchedContents, [System.Text.UTF8Encoding]::new($false))

    Invoke-Checked -FilePath $gradleWrapper -ArgumentList @(
      'assembleRelease',
      '--no-daemon',
      '--no-parallel',
      '--max-workers=2',
      '-Dorg.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=1536m',
      '-Pkotlin.compiler.execution.strategy=in-process',
      '-x', ':app:generateAutolinkingNewArchitectureFiles',
      '-x', ':app:generateAutolinkingPackageList'
    )
  }
  finally {
    Pop-Location
  }

  $sourceApk = Join-Path $androidRoot 'app\build\outputs\apk\release\app-release.apk'
  if (-not (Test-Path -LiteralPath $sourceApk)) {
    throw "Release APK was not produced: $sourceApk"
  }

  New-Item -ItemType Directory -Path $workspaceOutput -Force | Out-Null
  $package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
  $outputApk = Join-Path $workspaceOutput "图序-v$($package.version)-release.apk"
  Copy-Item -LiteralPath $sourceApk -Destination $outputApk -Force

  $sdkRoot = $env:ANDROID_SDK_ROOT
  if ([string]::IsNullOrWhiteSpace($sdkRoot)) {
    $sdkRoot = $env:ANDROID_HOME
  }

  if (-not [string]::IsNullOrWhiteSpace($sdkRoot)) {
    $apksigner = Get-ChildItem -LiteralPath (Join-Path $sdkRoot 'build-tools') -Directory |
      Sort-Object { [version]$_.Name } -Descending |
      ForEach-Object { Join-Path $_.FullName 'apksigner.bat' } |
      Where-Object { Test-Path -LiteralPath $_ } |
      Select-Object -First 1

    if ($apksigner) {
      Invoke-Checked -FilePath $apksigner -ArgumentList @('verify', '--verbose', '--print-certs', $outputApk)
    }
  }

  $apkItem = Get-Item -LiteralPath $outputApk
  $sha256Algorithm = [System.Security.Cryptography.SHA256]::Create()
  $apkStream = [System.IO.File]::OpenRead($outputApk)
  try {
    $sha256 = [System.BitConverter]::ToString($sha256Algorithm.ComputeHash($apkStream)).Replace('-', '')
  }
  finally {
    $apkStream.Dispose()
    $sha256Algorithm.Dispose()
  }

  Write-Host ''
  Write-Host 'Android APK build completed.' -ForegroundColor Green
  Write-Host "APK: $outputApk"
  Write-Host "Size: $($apkItem.Length) bytes"
  Write-Host "SHA256: $sha256"
}
finally {
  if ($createdJunction -and (Test-Path -LiteralPath $shortPathNormalized)) {
    [System.IO.Directory]::Delete($shortPathNormalized, $false)
  }
}
