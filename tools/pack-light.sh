#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
target="${1:?Укажите Rust target}"
version="$(node -p "require('./package.json').version")"
out="$PWD/src-tauri/target/$target/release"
case "$target" in
  aarch64-apple-darwin) arch=mac-arm64 ;;
  x86_64-apple-darwin) arch=mac-x64 ;;
  x86_64-pc-windows-msvc) arch=win-x64 ;;
  *) echo "Неизвестный target: $target" >&2; exit 1 ;;
esac

mkdir -p release
archive="$PWD/release/Ktoya-Light-$version-$arch.zip"
rm -f "$archive"
if [[ "$arch" == win-x64 ]]; then
  stage="$(mktemp -d)"
  trap 'rm -rf "$stage"' EXIT
  cp "$out/Ktoya.exe" LICENSE resources/CREDITS.md "$stage"
  cp -R resources/licenses "$stage"
  (cd "$stage" && 7z a -tzip "$(cygpath -w "$archive")" Ktoya.exe LICENSE CREDITS.md licenses)
else
  bundle="$out/bundle/macos/Ktoya.app"
  codesign --verify --deep --strict "$bundle"
  ditto -c -k --keepParent "$bundle" "$archive"
fi
