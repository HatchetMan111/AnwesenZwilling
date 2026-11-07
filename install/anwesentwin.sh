#!/usr/bin/env bash
# =============================================================================
#  AnwesenTwin — Proxmox-LXC-Installer (unprivileged Debian 12)
#  Muster wie bei den übrigen HatchetMan111-Installern:
#    pct create → venv + systemd → Web-UI auf :8080
#
#  Nutzung (auf dem Proxmox-Host):
#    bash anwesentwin.sh                    # installieren (Dateien aus dem Repo-Ordner)
#    bash anwesentwin.sh --local            # Dateien neben dem Script verwenden
#    bash anwesentwin.sh --update           # App-Dateien erneuern, Daten/Secrets bleiben
#    bash anwesentwin.sh --backup           # tar der DB + Medien nach /var/backups
#    bash anwesentwin.sh --status           # Dienststatus + Kurzinfo
#    bash anwesentwin.sh --uninstall        # Container entfernen (Rückfrage)
#  Optionale Flags: --id N  --ip 192.168.1.50/24  --password '...'  --port 8080
# =============================================================================
set -euo pipefail

# ---- Defaults (per Flag überschreibbar) -------------------------------------
CT_ID=""
CT_HOSTNAME="anwesentwin"
CT_TEMPLATE=""                     # automatisch: neuestes debian-12-standard
CT_STORAGE="local-lvm"
CT_CORES=2
CT_MEMORY=2048
CT_ROOTFS=8
CT_IP="dhcp"
CT_PASSWORD=""                     # auto-generiert, wird ausgegeben
APP_PORT="8080"
APP_PASSWORD=""                    # Web-Login; auto-generiert, wird ausgegeben
MODE="install"
LOCAL_FILES=false
ID_SCAN_START=200

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---- Flags -------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --id) CT_ID="$2"; shift 2 ;;
    --ip) CT_IP="$2"; shift 2 ;;
    --password) APP_PASSWORD="$2"; shift 2 ;;
    --port) APP_PORT="$2"; shift 2 ;;
    --local) LOCAL_FILES=true; shift ;;
    --update) MODE="update"; shift ;;
    --backup) MODE="backup"; shift ;;
    --status) MODE="status"; shift ;;
    --uninstall) MODE="uninstall"; shift ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unbekannte Option: $1"; exit 1 ;;
  esac
done

msg()  { echo -e "\e[32m▸\e[0m $*"; }
err()  { echo -e "\e[31m✗\e[0m $*" >&2; }
PCT="pct"

# ---- Existierenden CT anhand Hostname finden --------------------------------
find_ct_by_hostname() {
  for id in $(${PCT} list 2>/dev/null | awk 'NR>1 {print $1}'); do
    [[ "$($PCT config "$id" 2>/dev/null | grep '^hostname:')" == *": ${CT_HOSTNAME}" ]] && { echo "$id"; return; }
  done
  echo ""
}

find_free_id() {
  local used; used=$(${PCT} list 2>/dev/null | awk 'NR>1 {print $1}')
  local i=$((ID_SCAN_START))
  while [[ " $used " == *" $i "* ]]; do i=$((i+1)); done
  echo "$i"
}

neuestes_template() {
  local t
  t=$(${PVEAM:-pveam} list local 2>/dev/null | grep 'debian-12-standard' | awk -F'[; ]' '{print $2}' | sort -V | tail -1)
  if [[ -z "$t" ]]; then
    msg "Lade Debian-12-Template herunter …"
    ${PVEAM:-pveam} update >/dev/null 2>&1 || true
    ${PVEAM:-pveam} available --section system | grep 'debian-12-standard' >/dev/null || true
    ${PVEAM:-pveam} download local $( ${PVEAM:-pveam} available --section system | grep -o 'debian-12-standard_[0-9.]*-[0-9]*_amd64.tar.zst' | sort -V | tail -1 ) >/dev/null
    t=$(${PVEAM:-pveam} list local | grep 'debian-12-standard' | awk -F'[; ]' '{print $2}' | sort -V | tail -1)
  fi
  echo "$t"
}

# ---- Status ------------------------------------------------------------------
if [[ "$MODE" == "status" ]]; then
  CT=$(find_ct_by_hostname); [[ -z "$CT" ]] && { err "Kein '${CT_HOSTNAME}'-Container gefunden."; exit 1; }
  echo "Container:  $CT ($CT_HOSTNAME)"
  ${PCT} exec "$CT" -- systemctl is-active anwesentwin && \
    ${PCT} exec "$CT" -- sh -c 'IP=$(hostname -I | awk "{print \$1}"); echo "Web-UI:  http://$IP:'"$APP_PORT"'"' || err "Dienst inaktiv"
  exit 0
fi

# ---- Backup ------------------------------------------------------------------
if [[ "$MODE" == "backup" ]]; then
  CT=$(find_ct_by_hostname); [[ -z "$CT" ]] && { err "Kein Container gefunden."; exit 1; }
  ZIEL="/var/backups/anwesentwin-$(date +%Y%m%d-%H%M%S).tar.gz"
  msg "Sichere DB + Medien nach $ZIEL"
  ${PCT} exec "$CT" -- tar czf - -C / var/lib/anwesentwin > "$ZIEL"
  echo "OK: $ZIEL ($(du -h "$ZIEL" | cut -f1))"
  exit 0
fi

# ---- Uninstall ---------------------------------------------------------------
if [[ "$MODE" == "uninstall" ]]; then
  CT=$(find_ct_by_hostname); [[ -z "$CT" ]] && { err "Kein Container gefunden."; exit 1; }
  read -r -p "Container $CT ($CT_HOSTNAME) samt Daten löschen? 'JA' eingeben: " BEST
  [[ "$BEST" == "JA" ]] || { msg "Abgebrochen."; exit 0; }
  ${PCT} stop "$CT" 2>/dev/null || true
  ${PCT} destroy "$CT"
  msg "Entfernt."
  exit 0
fi

# ---- Quelldateien ------------------------------------------------------------
push_app_files() {
  # $1 = CT-ID.  Schickt app/, migrations/, web/dist, engine/twin.js, requirements.txt in den CT.
  local ct="$1" basis
  if $LOCAL_FILES; then
    basis="$(cd "$SCRIPT_DIR/.." && pwd)"
    [[ -f "$basis/app/anwesen_twin/main.py" ]] || { err "--local: $basis/app nicht gefunden."; exit 1; }
    msg "Packe lokale Dateien ($basis) …"
    local paket="/tmp/anwesentwin-$$"
    tar czf "$paket" -C "$basis" app migrations systemd web/dist engine/twin.js requirements.txt
  else
    msg "Lade Install-Paket aus GitHub …"
    local paket="/tmp/anwesentwin-$$"
    curl -fsSL "https://raw.githubusercontent.com/HatchetMan111/AnwesenTwin/main/install/anwesentwin-install.tar.gz" -o "$paket"
  fi
  ${PCT} push "$ct" "$paket" /tmp/anwesentwin.tar.gz --perms 644 >/dev/null
  ${PCT} exec "$ct" -- sh -c "
    mkdir -p /opt/anwesentwin &&
    tar xzf /tmp/anwesentwin.tar.gz -C /opt/anwesentwin &&
    rm /tmp/anwesentwin.tar.gz"
  rm -f "$paket"
}

# ---- Update ------------------------------------------------------------------
if [[ "$MODE" == "update" ]]; then
  CT=$(find_ct_by_hostname); [[ -z "$CT" ]] && { err "Kein Container gefunden — erst normal installieren."; exit 1; }
  msg "Update Container $CT …"
  push_app_files "$CT"
  ${PCT} exec "$CT" -- sh -c "cd /opt/anwesentwin && .venv/bin/pip install -q -r requirements.txt"
  ${PCT} exec "$CT" -- systemctl restart anwesentwin
  msg "Update fertig — DB, Medien und Secrets blieben erhalten."
  bash "$0" --status
  exit 0
fi

# ---- Install -----------------------------------------------------------------
if command -v ${PCT} >/dev/null 2>&1; then
  EXISTING=$(find_ct_by_hostname)
  if [[ -n "$EXISTING" ]]; then
    msg "Container existiert bereits (ID $EXISTING) — wechsle in den Update-Modus."
    MODE="update"; CT_ID="$EXISTING"
  fi
fi

if [[ "$MODE" == "install" ]]; then
  [[ -z "$CT_ID" ]] && CT_ID=$(find_free_id)
  [[ -z "$CT_PASSWORD" ]] && CT_PASSWORD=$(openssl rand -hex 12)
  [[ -z "$APP_PASSWORD" ]] && APP_PASSWORD=$(openssl rand -hex 8)
  CT_TEMPLATE=$(neuestes_template)

  msg "Erstelle LXC $CT_ID ($CT_HOSTNAME, Template $CT_TEMPLATE) …"
  ${PCT} create "$CT_ID" "local:vztmpl/${CT_TEMPLATE}" \
    --hostname "$CT_HOSTNAME" --storage "$CT_STORAGE" \
    --rootfs "${CT_STORAGE}:${CT_ROOTFS}" \
    --cores "$CT_CORES" --memory "$CT_MEMORY" --swap 0 \
    --net0 "name=eth0,bridge=vmbr0,ip=${CT_IP},firewall=0" \
    --password "$CT_PASSWORD" \
    --unprivileged 1 --features nesting=1,keyctl=1 \
    --onboot 1 --start 0 >/dev/null

  msg "Starte Container …"
  ${PCT} start "$CT_ID"
  for i in $(seq 1 30); do
    [[ -n "$(${PCT} exec "$CT_ID" -- hostname -I 2>/dev/null)" ]] && break
    sleep 2
  done

  msg "Installiere Python …"
  ${PCT} exec "$CT_ID" -- bash -c "apt-get update -qq && apt-get install -y -qq python3-venv curl >/dev/null"

  push_app_files "$CT_ID"

  msg "Richte venv + Abhängigkeiten ein …"
  ${PCT} exec "$CT_ID" -- bash -c "cd /opt/anwesentwin && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt"

  msg "Lege Nutzer + Secrets an …"
  ${PCT} exec "$CT_ID" -- bash -c "id anwesentwin >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin anwesentwin"
  ${PCT} exec "$CT_ID" -- mkdir -p /etc/anwesentwin /var/lib/anwesentwin
  if ! ${PCT} exec "$CT_ID" -- test -f /etc/anwesentwin/anwesentwin.env; then
    SECRET=$(openssl rand -hex 32)
    ${PCT} push "$CT_ID" /dev/stdin /etc/anwesentwin/anwesentwin.env >/dev/null <<ENV
ANWESENTWIN_HOST=127.0.0.1
ANWESENTWIN_PORT=${APP_PORT}
ANWESENTWIN_SECRET=${SECRET}
ANWESENTWIN_PASSWORD=${APP_PASSWORD}
ANWESENTWIN_DB=/var/lib/anwesentwin/anwesentwin.db
ANWESENTWIN_DATA=/var/lib/anwesentwin
ENV
  fi
  ${PCT} exec "$CT_ID" -- bash -c "chown -R anwesentwin:anwesentwin /var/lib/anwesentwin && chmod 600 /etc/anwesentwin/anwesentwin.env"

  msg "Richte systemd-Dienst ein …"
  ${PCT} exec "$CT_ID" -- bash -c "
    sed 's/^User=.*/User=anwesentwin/' /opt/anwesentwin/systemd/anwesentwin.service > /etc/systemd/system/anwesentwin.service
    systemctl daemon-reload && systemctl enable --now anwesentwin"

  # kurzer Health-Check
  sleep 3
  if ${PCT} exec "$CT_ID" -- curl -sf "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null; then
    IP=$(${PCT} exec "$CT_ID" -- hostname -I | awk '{print $1}')
    echo
    echo "=============================================================="
    echo "  AnwesenTwin ist installiert ✅"
    echo "--------------------------------------------------------------"
    echo "  Web-UI:    http://${IP}:${APP_PORT}"
    echo "  Passwort:  ${APP_PASSWORD}"
    echo "  CT-Passwort (Root): ${CT_PASSWORD}"
    echo "  Update:    bash $0 --update   |  Backup: bash $0 --backup"
    echo "=============================================================="
  else
    err "Dienst antwortet nicht — Logs: pct exec $CT_ID -- journalctl -u anwesentwin -n 50"
    exit 1
  fi
fi
