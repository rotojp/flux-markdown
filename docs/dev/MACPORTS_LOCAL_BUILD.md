# Local MacPorts build

Install FluxMarkdown via MacPorts from a **local source checkout** — including
changes that aren't in the published upstream (`xykong`) release — so
`sudo port install flux-markdown` gives you *your* build.

> The official `macports/Portfile` fetches the `xykong` GitHub release. Use this
> local flow instead when you want to install your own fork/branch (e.g. with
> local patches or security fixes that haven't been released upstream).

## Requirements (macOS only)

- [MacPorts](https://www.macports.org/install.php)
- Xcode (full install, for `xcodebuild`)
- `xcodegen` and Node.js — `brew install xcodegen node`

## One command

From a clean, **committed** checkout (the tarball is built from `git archive HEAD`):

```bash
./scripts/create_macports_local_port.sh
```

This:

1. Runs `scripts/create_macports_tarball.sh` to build a MacPorts source tarball
   from `HEAD` (pre-built `web-renderer/dist`, pre-generated `.xcodeproj`,
   Sparkle removed), then restores the working tree.
2. Renders `macports/Portfile.local.in` into `~/ports/aqua/flux-markdown/Portfile`,
   pointing at that tarball via a `file://` distfile with real checksums.
3. Prints the steps below.

Override the tree location with `LOCAL_PORTS_TREE=/path ./scripts/create_macports_local_port.sh`.

## Register the local tree and install

One-time: add your local tree **above** the `rsync://` line in
`/opt/local/etc/macports/sources.conf` (needs `sudo`):

```
file:///Users/YOU/ports
```

Then:

```bash
(cd ~/ports && portindex)
sudo port install flux-markdown
```

`post-activate` clears quarantine, registers the QuickLook extension
(`pluginkit -a`), and resets the QuickLook cache (`qlmanage -r`). Test by
selecting a `.md` file in Finder and pressing **Space**.

### Rebuild after new commits

```bash
./scripts/create_macports_local_port.sh
sudo port -n upgrade --force flux-markdown
```

## Notes & caveats

- **Ad-hoc signed, not notarized.** Fine for local use; not for redistribution.
- **QuickLook registration.** The build mirrors the official Portfile, which
  passes `CODE_SIGN_ENTITLEMENTS=''`. If the app launches but the Finder **Space**
  preview never appears, the extension likely failed to register because its
  `com.apple.security.app-sandbox` entitlement was stripped. In that case, edit
  the generated `~/ports/aqua/flux-markdown/Portfile` and remove the
  `CODE_SIGN_ENTITLEMENTS=''` line (and add `CODE_SIGN_IDENTITY='-'`) so each
  target keeps its own `*Release.entitlements`, then
  `sudo port -n upgrade --force flux-markdown`.
- **Committed HEAD only.** `git archive HEAD` ignores uncommitted changes —
  commit first.
