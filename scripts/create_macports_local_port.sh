#!/bin/bash
# Build and register a LOCAL MacPorts port from the current checkout, so that
# `sudo port install flux-markdown` installs THIS build — including local changes
# not present in the published xykong release.
#
# macOS only. Requires: MacPorts, Xcode, xcodegen, npm.
#
# What it does:
#   1. Runs scripts/create_macports_tarball.sh to produce a MacPorts source
#      tarball from the committed HEAD (pre-built web-renderer/dist +
#      pre-generated .xcodeproj, Sparkle removed).
#   2. Renders macports/Portfile.local.in into a local ports tree, pointing at
#      that tarball via a file:// distfile with the real checksums.
#   3. Prints the one-time steps to register the tree and install.
#
# Usage: ./scripts/create_macports_local_port.sh [VERSION]
#   VERSION            defaults to the contents of .version
#   LOCAL_PORTS_TREE   env override for the local ports tree (default: ~/ports)

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/.."
cd "$PROJECT_ROOT"

VERSION="${1:-$(cat .version)}"
PORTS_TREE="${LOCAL_PORTS_TREE:-$HOME/ports}"
PORT_DIR="$PORTS_TREE/aqua/flux-markdown"
TEMPLATE="macports/Portfile.local.in"

if [ ! -f "$TEMPLATE" ]; then
    echo "❌ Template not found: $TEMPLATE" >&2
    exit 1
fi

# ── 1. Build the source tarball from the current checkout ─────────────────────
# create_macports_tarball.sh rewrites macports/Portfile in place (that edit is
# meant for the upstream release flow); restore it afterwards so the working
# tree stays clean.
echo "📦 Building MacPorts source tarball from HEAD (v${VERSION})..."
PORTFILE_DIRTY_BEFORE=""
if git -C "$PROJECT_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    if ! git -C "$PROJECT_ROOT" diff --quiet -- macports/Portfile 2>/dev/null; then
        PORTFILE_DIRTY_BEFORE="yes"
    fi
fi

./scripts/create_macports_tarball.sh "$VERSION"

if [ -z "$PORTFILE_DIRTY_BEFORE" ] && git -C "$PROJECT_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    git -C "$PROJECT_ROOT" checkout -- macports/Portfile 2>/dev/null || true
fi

TARBALL="build/artifacts/FluxMarkdown-${VERSION}-macports-source.tar.gz"
if [ ! -f "$TARBALL" ]; then
    echo "❌ Expected tarball not found: $TARBALL" >&2
    exit 1
fi

DISTPATH="$( cd "$( dirname "$TARBALL" )" && pwd )"
SHA256="$(shasum -a 256 "$TARBALL" | awk '{print $1}')"
RMD160="$(openssl dgst -rmd160 "$TARBALL" | awk '{print $NF}')"
SIZE="$(wc -c < "$TARBALL" | tr -d ' ')"

# ── 2. Render the local Portfile ──────────────────────────────────────────────
echo "📝 Rendering local Portfile into ${PORT_DIR}/Portfile..."
mkdir -p "$PORT_DIR"
sed \
    -e "s|@VERSION@|${VERSION}|g" \
    -e "s|@DISTPATH@|${DISTPATH}|g" \
    -e "s|@SHA256@|${SHA256}|g" \
    -e "s|@RMD160@|${RMD160}|g" \
    -e "s|@SIZE@|${SIZE}|g" \
    "$TEMPLATE" > "$PORT_DIR/Portfile"

# ── 3. Report next steps ──────────────────────────────────────────────────────
SOURCES_CONF="/opt/local/etc/macports/sources.conf"

echo ""
echo "✅ Local port written: ${PORT_DIR}/Portfile"
echo "   distfile: ${TARBALL}"
echo "   sha256    ${SHA256}"
echo "   size      ${SIZE}"
echo ""
echo "Next steps:"
echo "  1. One-time: add this line ABOVE the rsync:// line in ${SOURCES_CONF}"
echo "     (needs sudo):"
echo ""
echo "         file://${PORTS_TREE}"
echo ""
echo "  2. Index the tree and install:"
echo ""
echo "         (cd \"${PORTS_TREE}\" && portindex)"
echo "         sudo port install flux-markdown"
echo ""
echo "  To rebuild after new commits, re-run this script then:"
echo "         sudo port -n upgrade --force flux-markdown"
echo ""
echo "  Then test: select a .md file in Finder and press Space."
