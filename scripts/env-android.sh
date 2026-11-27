#!/usr/bin/env bash
# Entorno de build Android solo para la sesión actual (no toca el PATH global).
# Uso (Git Bash, desde la raíz del repo):  source scripts/env-android.sh
# Por defecto busca las herramientas en %USERPROFILE%\tools; se puede cambiar con ANDROID_TOOLS_DIR.

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  echo "Este script se usa con 'source': source scripts/env-android.sh" >&2
  exit 1
fi

_tools_win="${ANDROID_TOOLS_DIR:-${USERPROFILE:-$HOME}\\tools}"
_tools_unix="$(cygpath -u "$_tools_win" 2>/dev/null || echo "$_tools_win")"

if [ ! -x "$_tools_unix/jdk-21/bin/java" ] || [ ! -d "$_tools_unix/android-sdk/platforms" ]; then
  echo "No encuentro jdk-21 o android-sdk en $_tools_win" >&2
  return 1
fi

export JAVA_HOME="$_tools_win\\jdk-21"
export ANDROID_HOME="$_tools_win\\android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$_tools_unix/jdk-21/bin:$_tools_unix/android-sdk/platform-tools:$_tools_unix/android-sdk/cmdline-tools/latest/bin:$PATH"

unset _tools_win _tools_unix
echo "JAVA_HOME=$JAVA_HOME"
echo "ANDROID_HOME=$ANDROID_HOME"
