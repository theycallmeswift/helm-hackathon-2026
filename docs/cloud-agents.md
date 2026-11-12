# Cloud agents

Set up a Linux cloud VM so a coding agent can build and verify this repo.

## What the VM needs

- **Node 26,** for markdownlint, installed beside the image's own.
- **Network access** to `nodejs.org` and `registry.npmjs.org`, plus the
  language's package hosts.
- **No secrets.** `npm test` and `npm run lint` need no credentials.

## 1. Setup script

Paste this into the service's setup-script field. It runs as root, installs
Node 26 into `/opt/node26` with its checksum verified, and is safe to run
twice. A failed download exits non-zero and stops the session, since a
session without its tools can't verify anything.

```bash
#!/bin/bash
set -euo pipefail

NODE_DIR=/opt/node26
RELEASES=https://nodejs.org/dist/latest-v26.x

case "$(uname -m)" in
  x86_64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) echo "unsupported CPU: $(uname -m)" >&2; exit 1 ;;
esac

# Node's Linux binaries link against libatomic, which minimal images omit.
if ! ldconfig -p | grep -q 'libatomic\.so\.1'; then
  apt-get update -qq && apt-get install -y -qq libatomic1
fi

if [ ! -x "$NODE_DIR/bin/node" ]; then
  download_dir="$(mktemp -d)"
  cd "$download_dir"
  curl -fsSLO "$RELEASES/SHASUMS256.txt"
  tarball="$(awk -v name="linux-$arch.tar.xz" '$2 ~ name "$" { print $2 }' SHASUMS256.txt)"
  curl -fsSLO "$RELEASES/$tarball"
  grep " $tarball\$" SHASUMS256.txt | sha256sum -c -
  mkdir -p "$NODE_DIR"
  tar -xJf "$tarball" -C "$NODE_DIR" --strip-components=1
  cd /
  rm -rf "$download_dir"
fi

ln -sf "$NODE_DIR/bin/node" "$NODE_DIR/bin/npm" "$NODE_DIR/bin/npx" /usr/local/bin/
"$NODE_DIR/bin/node" --version
```

## 2. Each session

Dependencies track the lockfile, which changes after the image is cached, so
install them in each session from the repository root:

```bash
node --version
npm ci
```

If `node --version` prints something older than 26, prefix each command that
reaches Node with `PATH="/opt/node26/bin:$PATH"`, since agent shells may drop
an `export` between commands.

## 3. Verify

```bash
npm test
npm run lint
```

Both pass without credentials once steps 1 and 2 are done.

## Claude Code on the web

Configure the environment at [claude.ai/code](https://claude.ai/code); the
[cloud environments](https://code.claude.com/docs/en/cloud-environments) page
is the reference.

- **Setup script:** paste step 1. Its result is cached for later sessions
  until the script or network settings change. Keep it under about five
  minutes.
- **Node on `PATH`:** the image's own Node comes first on `PATH`. The
  SessionStart hook
  [`claude-cloud-node26-path.sh`](../.claude/hooks/claude-cloud-node26-path.sh)
  puts Node 26 first in cloud sessions only.
- **Network access:** unless the level is **Full**, allow every host in
  [What the VM needs](#what-the-vm-needs).
- **Environment variables:** leave them empty.
