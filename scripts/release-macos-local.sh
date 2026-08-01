#!/usr/bin/env bash
# Build verified Apple Silicon and Intel macOS release artifacts. Never publishes.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FINALIZE_TOOL="$ROOT_DIR/scripts/finalize-local-macos-release.mjs"
IDENTITY_NAME="Developer ID Application: bitylabs (XFC6SG6TLY)"
G2_SHA1="5B45F61068B29FCC8FFFF1A7E99B78DA9E9C4635"

print_plan() {
  cat <<'PLAN'
Space Zero local macOS release plan
  arm64 app: sign -> notarize -> staple
  arm64 DMG: sign -> notarize -> staple
  x64 app: sign -> notarize -> staple
  x64 DMG: sign -> notarize -> staple
  Finalize: regenerate blockmaps, beta-mac.yml, and checksums from final bytes
  Verify: architectures, signatures, tickets, Gatekeeper, and mounted DMGs
  Publishing: disabled
PLAN
}

if [[ "${1:-}" == "--" ]]; then
  shift
fi
if [[ "${1:-}" == "--plan" && $# -eq 1 ]]; then
  print_plan
  exit 0
fi
if [[ $# -ne 0 ]]; then
  echo "Usage: $0 [--plan]" >&2
  exit 1
fi
if [[ "$EUID" -eq 0 ]]; then
  echo "Do not run this script with sudo." >&2
  exit 1
fi
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This release script must run on macOS." >&2
  exit 1
fi

for command_name in security openssl shasum codesign xcrun ditto pnpm node hdiutil spctl lipo arch git; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

cd "$ROOT_DIR"
VERSION="$(node -p "require('./package.json').version")"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+-beta\.[0-9]+$ ]]; then
  echo "package.json must contain a beta version; found: $VERSION" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Commit tracked changes before producing release artifacts." >&2
  exit 1
fi

SIGNING_ROOT="${SPACEZERO_SIGNING_ROOT:-$HOME/Desktop/spacezero-signing}"
P12_PATH="${SPACEZERO_P12_PATH:-$SIGNING_ROOT/new/SpaceZeroDeveloperID.github-actions.p12}"
API_KEY_ID="${APPLE_API_KEY_ID:-769R3M3364}"
P8_PATH="${SPACEZERO_P8_PATH:-$SIGNING_ROOT/AuthKey_${API_KEY_ID}.p8}"
RELEASE_ROOT="${SPACEZERO_RELEASE_ROOT:-$SIGNING_ROOT/new/releases}"
RUN_STAMP="$(date '+%Y%m%d-%H%M%S')"
RUN_DIR="$RELEASE_ROOT/v${VERSION}-${RUN_STAMP}"
ARTIFACT_DIR="$RUN_DIR/artifacts"
RUN_TEMP=""
SIGNING_KEYCHAIN=""
KEYCHAIN_PASSWORD=""
LOGIN_KEYCHAIN="$(security default-keychain -d user | sed -e 's/^[[:space:]]*"//' -e 's/"[[:space:]]*$//')"
MOUNT_POINT=""
existing_keychains=()
existing_keychain_count=0

mkdir -p "$ARTIFACT_DIR" "$RUN_DIR/logs" "$RUN_DIR/submissions" "$RUN_DIR/work"
chmod 700 "$RUN_DIR" "$ARTIFACT_DIR" "$RUN_DIR/logs" "$RUN_DIR/submissions" "$RUN_DIR/work"

if [[ ! -f "$P12_PATH" ]]; then
  echo "Missing signing identity: $P12_PATH" >&2
  exit 1
fi
if [[ ! -f "$P8_PATH" ]]; then
  echo "Missing App Store Connect API key: $P8_PATH" >&2
  exit 1
fi

APPLE_ISSUER="${APPLE_ISSUER:-}"
if [[ -z "$APPLE_ISSUER" ]]; then
  printf "Apple Issuer UUID: " >/dev/tty
  IFS= read -r APPLE_ISSUER </dev/tty
fi
if [[ ! "$APPLE_ISSUER" =~ ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$ ]]; then
  echo "Invalid Apple Issuer UUID." >&2
  unset APPLE_ISSUER
  exit 1
fi

IFS= read -r -s -p "Developer ID .p12 password: " P12_PASSWORD </dev/tty
printf '\n' >/dev/tty
if [[ -z "$P12_PASSWORD" ]]; then
  echo "The .p12 password cannot be empty." >&2
  unset APPLE_ISSUER
  exit 1
fi

while IFS= read -r keychain; do
  keychain="${keychain#*\"}"
  keychain="${keychain%\"*}"
  if [[ -n "$keychain" ]]; then
    existing_keychains[$existing_keychain_count]="$keychain"
    existing_keychain_count=$((existing_keychain_count + 1))
  fi
done < <(security list-keychains -d user)

RUN_TEMP="$(mktemp -d "$SIGNING_ROOT/new/.multiarch-release-work.XXXXXX")"
SIGNING_KEYCHAIN="$RUN_TEMP/spacezero-release-signing.keychain-db"
KEYCHAIN_PASSWORD="$(openssl rand -base64 32)"

cleanup() {
  if [[ -n "$MOUNT_POINT" ]]; then
    hdiutil detach "$MOUNT_POINT" -quiet >/dev/null 2>&1 || true
  fi
  if ((existing_keychain_count > 0)); then
    security list-keychains -d user -s "${existing_keychains[@]}" >/dev/null 2>&1 || true
  elif [[ -n "$LOGIN_KEYCHAIN" && -f "$LOGIN_KEYCHAIN" ]]; then
    security list-keychains -d user -s "$LOGIN_KEYCHAIN" >/dev/null 2>&1 || true
  fi
  if [[ -n "$SIGNING_KEYCHAIN" ]]; then
    security delete-keychain "$SIGNING_KEYCHAIN" >/dev/null 2>&1 || true
  fi
  if [[ -n "$RUN_TEMP" ]]; then
    rm -rf "$RUN_TEMP"
  fi
  unset APPLE_ISSUER P12_PASSWORD KEYCHAIN_PASSWORD
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

exec > >(tee "$RUN_DIR/logs/release.log") 2>&1
printf 'Release run: %s\nVersion: %s\nCommit: %s\n' "$RUN_DIR" "$VERSION" "$(git rev-parse HEAD)"

if [[ -z "$LOGIN_KEYCHAIN" || ! -f "$LOGIN_KEYCHAIN" ]]; then
  echo "Unable to find the login keychain." >&2
  exit 1
fi
login_certificates="$(security find-certificate -a -Z "$LOGIN_KEYCHAIN" 2>/dev/null || true)"
if [[ "$login_certificates" != *"$G2_SHA1"* ]]; then
  echo "Install Apple's Developer ID G2 intermediate in the login keychain first." >&2
  exit 1
fi
if [[ "$(uname -m)" == "arm64" ]] && ! arch -x86_64 /usr/bin/true >/dev/null 2>&1; then
  echo "Rosetta 2 is required for x64 validation." >&2
  echo "Install it with: softwareupdate --install-rosetta --agree-to-license" >&2
  exit 1
fi

security delete-keychain "$SIGNING_KEYCHAIN" >/dev/null 2>&1 || rm -f "$SIGNING_KEYCHAIN"
security create-keychain -p "$KEYCHAIN_PASSWORD" "$SIGNING_KEYCHAIN" >/dev/null
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$SIGNING_KEYCHAIN" >/dev/null
security set-keychain-settings -lut 21600 "$SIGNING_KEYCHAIN" >/dev/null
security import "$P12_PATH" \
  -k "$SIGNING_KEYCHAIN" \
  -f pkcs12 \
  -P "$P12_PASSWORD" \
  -T /usr/bin/codesign \
  -T /usr/bin/productbuild \
  >/dev/null
security set-key-partition-list \
  -S apple-tool:,apple: \
  -s \
  -k "$KEYCHAIN_PASSWORD" \
  "$SIGNING_KEYCHAIN" \
  >/dev/null
unset P12_PASSWORD

if ((existing_keychain_count > 0)); then
  security list-keychains -d user -s "$SIGNING_KEYCHAIN" "${existing_keychains[@]}"
else
  security list-keychains -d user -s "$SIGNING_KEYCHAIN" "$LOGIN_KEYCHAIN"
fi
identities="$(security find-identity -v -p codesigning "$SIGNING_KEYCHAIN")"
printf '%s\n' "$identities"
identity_line="$(printf '%s\n' "$identities" | awk -v name="$IDENTITY_NAME" 'index($0, name) { print; exit }')"
if [[ -z "$identity_line" ]]; then
  echo "Expected Developer ID identity was not found." >&2
  exit 1
fi
IDENTITY_SHA="$(awk '{print $2}' <<<"$identity_line")"

export CSC_KEYCHAIN="$SIGNING_KEYCHAIN"
export CSC_NAME='bitylabs (XFC6SG6TLY)'
unset CSC_LINK CSC_KEY_PASSWORD CSC_INSTALLER_LINK CSC_INSTALLER_KEY_PASSWORD
unset APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID APPLE_API_KEY APPLE_API_ISSUER
export NODE_OPTIONS='--max-old-space-size=4096'

submission_status_from_log() {
  awk '/^[[:space:]]*status: / { status=$2 } END { print status }' "$1" 2>/dev/null || true
}

submission_id_from_log() {
  awk '/^[[:space:]]*id: / { print $2; exit }' "$1" 2>/dev/null || true
}

submit_and_wait() {
  local payload="$1"
  local label="$2"
  local log_path="$3"
  local command_status
  local apple_status
  local submission_id

  set +e
  xcrun notarytool submit "$payload" \
    --key "$P8_PATH" \
    --key-id "$API_KEY_ID" \
    --issuer "$APPLE_ISSUER" \
    --wait \
    --timeout 6h \
    --progress \
    --output-format normal \
    2>&1 | tee "$log_path"
  command_status=${PIPESTATUS[0]}
  set -e

  apple_status="$(submission_status_from_log "$log_path")"
  submission_id="$(submission_id_from_log "$log_path")"
  printf '%s submission ID: %s\n' "$label" "${submission_id:-unavailable}"

  if [[ "$apple_status" == "Accepted" && "$command_status" -eq 0 ]]; then
    return 0
  fi
  if [[ "$apple_status" == "Invalid" || "$apple_status" == "Rejected" ]]; then
    if [[ -n "$submission_id" ]]; then
      xcrun notarytool log "$submission_id" "$log_path.rejection.json" \
        --key "$P8_PATH" \
        --key-id "$API_KEY_ID" \
        --issuer "$APPLE_ISSUER" || true
    fi
    echo "Apple rejected $label. See $log_path and its rejection log." >&2
    return 1
  fi

  echo "$label did not reach Accepted status. The exact payload remains at: $payload" >&2
  echo "Do not resubmit blindly; check the submission ID in: $log_path" >&2
  return 1
}

staple_if_needed() {
  local path="$1"
  if ! xcrun stapler validate "$path" >/dev/null 2>&1; then
    xcrun stapler staple "$path"
  fi
  xcrun stapler validate "$path"
}

verify_macho_architecture() {
  local path="$1"
  local expected_arch="$2"
  local arches
  arches="$(lipo -archs "$path" 2>/dev/null || true)"
  if [[ " $arches " != *" $expected_arch "* ]]; then
    echo "Wrong architecture for $path: expected $expected_arch, found ${arches:-non-Mach-O}" >&2
    return 1
  fi
}

verify_app_architecture() {
  local app_path="$1"
  local release_arch="$2"
  local macho_arch="$release_arch"
  if [[ "$release_arch" == "x64" ]]; then
    macho_arch="x86_64"
  fi
  verify_macho_architecture "$app_path/Contents/MacOS/Space Zero" "$macho_arch"
  verify_macho_architecture \
    "$app_path/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework" \
    "$macho_arch"
  while IFS= read -r native_module; do
    verify_macho_architecture "$native_module" "$macho_arch"
  done < <(find "$app_path" -type f -name '*.node' -print)
}

verify_signed_app() {
  local app_path="$1"
  codesign --verify --deep --strict --verbose=4 "$app_path"
  local signature_info
  signature_info="$(codesign -dv --verbose=4 "$app_path" 2>&1)"
  printf '%s\n' "$signature_info"
  [[ "$signature_info" == *"Authority=$IDENTITY_NAME"* ]]
  [[ "$signature_info" == *'TeamIdentifier=XFC6SG6TLY'* ]]
  [[ "$signature_info" == *'Timestamp='* ]]
}

verify_signed_dmg() {
  local dmg_path="$1"
  codesign --verify --strict --verbose=4 "$dmg_path"
  local signature_info
  signature_info="$(codesign -dv --verbose=4 "$dmg_path" 2>&1)"
  printf '%s\n' "$signature_info"
  [[ "$signature_info" == *"Authority=$IDENTITY_NAME"* ]]
  [[ "$signature_info" == *'TeamIdentifier=XFC6SG6TLY'* ]]
  [[ "$signature_info" == *'Timestamp='* ]]
}

canonical_name() {
  local release_arch="$1"
  local kind="$2"
  if [[ "$kind" == "zip" ]]; then
    printf 'Space-Zero-%s-%s-mac.zip\n' "$VERSION" "$release_arch"
  else
    printf 'Space-Zero-%s-%s.dmg\n' "$VERSION" "$release_arch"
  fi
}

printf '\n[shared] Install dependencies and build JavaScript bundles\n'
pnpm install --frozen-lockfile
pnpm package:prepare-github
pnpm build

for release_arch in arm64 x64; do
  arch_dir="$RUN_DIR/work/$release_arch"
  builder_dir="$arch_dir/builder"
  package_dir="$arch_dir/package"
  app_path="$arch_dir/Space Zero.app"
  app_payload="$RUN_DIR/submissions/$release_arch-app.zip"
  zip_path="$ARTIFACT_DIR/$(canonical_name "$release_arch" zip)"
  dmg_path="$ARTIFACT_DIR/$(canonical_name "$release_arch" dmg)"
  arch_option="--$release_arch"
  mkdir -p "$arch_dir" "$builder_dir" "$package_dir"

  printf '\n[%s 1/4] Package, sign, and verify application\n' "$release_arch"
  pnpm exec electron-builder \
    --mac \
    "$arch_option" \
    --dir \
    --publish never \
    -c.forceCodeSigning=true \
    -c.mac.notarize=false \
    -c.directories.output="$builder_dir"
  built_app="$(find "$builder_dir" -maxdepth 3 -type d -name 'Space Zero.app' -print -quit)"
  if [[ -z "$built_app" ]]; then
    echo "Packaged app was not found for $release_arch." >&2
    exit 1
  fi
  mv "$built_app" "$app_path"
  verify_app_architecture "$app_path" "$release_arch"
  verify_signed_app "$app_path"

  printf '\n[%s 2/4] Notarize, staple, and verify application\n' "$release_arch"
  ditto -c -k --sequesterRsrc --keepParent "$app_path" "$app_payload"
  submit_and_wait "$app_payload" "$release_arch app" "$RUN_DIR/logs/$release_arch-app-notarytool.log"
  staple_if_needed "$app_path"
  verify_signed_app "$app_path"
  spctl --assess --type execute --verbose=4 "$app_path"

  printf '\n[%s 3/4] Build updater ZIP and signed DMG\n' "$release_arch"
  pnpm exec electron-builder \
    --mac dmg zip \
    "$arch_option" \
    --prepackaged "$app_path" \
    --publish never \
    -c.mac.notarize=false \
    -c.dmg.sign=true \
    -c.directories.output="$package_dir"
  built_zip="$(find "$package_dir" -maxdepth 1 -type f -name '*.zip' ! -name '*.blockmap' -print -quit)"
  built_dmg="$(find "$package_dir" -maxdepth 1 -type f -name '*.dmg' -print -quit)"
  if [[ -z "$built_zip" || -z "$built_dmg" ]]; then
    echo "ZIP or DMG was not produced for $release_arch." >&2
    exit 1
  fi
  mv "$built_zip" "$zip_path"
  mv "$built_dmg" "$dmg_path"
  codesign \
    --force \
    --sign "$IDENTITY_SHA" \
    --keychain "$SIGNING_KEYCHAIN" \
    --timestamp \
    --verbose=4 \
    "$dmg_path"
  verify_signed_dmg "$dmg_path"

  printf '\n[%s 4/4] Notarize, staple, and verify DMG\n' "$release_arch"
  submit_and_wait "$dmg_path" "$release_arch DMG" "$RUN_DIR/logs/$release_arch-dmg-notarytool.log"
  staple_if_needed "$dmg_path"
  hdiutil verify "$dmg_path"
  verify_signed_dmg "$dmg_path"
  spctl --assess --type open --context context:primary-signature --verbose=4 "$dmg_path"

  rm -rf "$builder_dir" "$package_dir"
done

printf '\n[final] Generate update metadata and checksums from final bytes\n'
node "$FINALIZE_TOOL" --artifact-dir "$ARTIFACT_DIR" --version "$VERSION"
node "$ROOT_DIR/scripts/verify-macos-release-artifacts.mjs" \
  "$ARTIFACT_DIR" \
  --version "$VERSION" \
  --architectures arm64,x64

for release_arch in arm64 x64; do
  dmg_path="$ARTIFACT_DIR/$(canonical_name "$release_arch" dmg)"
  MOUNT_POINT="$RUN_TEMP/mount-$release_arch"
  mkdir -p "$MOUNT_POINT"
  hdiutil attach "$dmg_path" -nobrowse -readonly -mountpoint "$MOUNT_POINT" -quiet
  mounted_app="$MOUNT_POINT/Space Zero.app"
  verify_app_architecture "$mounted_app" "$release_arch"
  verify_signed_app "$mounted_app"
  xcrun stapler validate "$mounted_app"
  spctl --assess --type execute --verbose=4 "$mounted_app"
  xcrun stapler validate "$dmg_path"
  spctl --assess --type open --context context:primary-signature --verbose=4 "$dmg_path"
  hdiutil detach "$MOUNT_POINT" -quiet
  rmdir "$MOUNT_POINT"
  MOUNT_POINT=""
done

printf '\nSUCCESS\n'
printf 'Apple Silicon and Intel release artifacts are ready at:\n  %s\n' "$ARTIFACT_DIR"
printf 'Nothing was published.\n'
