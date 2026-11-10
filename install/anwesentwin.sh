#!/usr/bin/env bash
# =============================================================================
#  AnwesenTwin — Proxmox VE Installer (Community-Scripts-Stil, unprivileged LXC)
#
#  Einzeiler auf dem Proxmox-Host:
#    bash -c "$(wget -qLO - https://raw.githubusercontent.com/HatchetMan111/AnwesenZwilling/main/install/anwesentwin.sh)"
#
#  Was passiert:
#    - erstellt unprivileged LXC (Debian 12, nächste freie ID ab 200) und
#      installiert die App + Web-UI unter http://<CT-IP>:8080
#    - idempotent: existiert der Container bereits → Update-Modus
#    - bei jedem Fehler: komplette Fehlerkette + Logauszug + bash -x-Hinweis
#
#  Optionen:
#    --local            App-Dateien aus dem Repo-Ordner neben diesem Script
#    --update           App-Dateien erneuern (DB, Medien, Secrets bleiben)
#    --backup           tar von DB + Medien nach /var/backups
#    --status           Dienststatus + URL
#    --uninstall        Container samt Daten entfernen (Rückfrage)
#    --id N             feste CT-ID (Default: nächste freie ab 200)
#    --ip A.B.C.D/24    feste IP (Default: dhcp)
#    --password '...'   Web-Login-Passwort (Default: zufällig, wird ausgegeben)
#    --port N           Web-UI-Port (Default: 8080)
#  Debug:  bash -x install/anwesentwin.sh   (vollständiger Trace)
# =============================================================================
# -euo pipefail ohne -E: der ERR-Trap feuert nur in der HAUPT-Shell — fehlerhafte
# Subshells (BASH_SOURCE in $(...) etc.) scheitern nach oben und lösen dort den Trap aus.
set -euo pipefail

# ---- Konfiguration (nur HIER anpassen) ---------------------------------------
APP="anwesentwin"                  # CT-Hostname + systemd-Dienstname
APP_TITLE="AnwesenTwin"
REPO="HatchetMan111/AnwesenZwilling"   # <user>/<repo> — bei Umbenennung nur hier ändern
BRANCH="main"
APP_PORT="8080"                    # Web-UI-Port im CT
CT_HOSTNAME="$APP"
CT_TEMPLATE=""                     # automatisch: neuestes debian-12-standard
CT_STORAGE="local-lvm"
CT_CORES=2
CT_MEMORY=2048
CT_ROOTFS=8
CT_IP="dhcp"
CT_BRIDGE="vmbr0"
CT_PASSWORD=""                     # CT-Root-Passwort (Default: zufällig)
WEB_PASSWORD=""                    # Web-Login (Default: zufällig, wird ausgegeben)
ID_SCAN_START=200
LOGFILE="/tmp/${APP}-install.log"

# ---- Modi/Flags --------------------------------------------------------------
MODE="install"
LOCAL_FILES=false
CT_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --local) LOCAL_FILES=true; shift ;;
    --update) MODE="update"; shift ;;
    --backup) MODE="backup"; shift ;;
    --status) MODE="status"; shift ;;
    --uninstall) MODE="uninstall"; shift ;;
    --id) CT_ID="$2"; shift 2 ;;
    --ip) CT_IP="$2"; shift 2 ;;
    --password) WEB_PASSWORD="$2"; shift 2 ;;
    --port) APP_PORT="$2"; shift 2 ;;
    -h|--help) grep '^# ' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --selftest-extract) MODE="selftest-extract"; SELFTEST_TAR="$2"; SELFTEST_ZIEL="$3"; shift 3 ;;
    *) echo "Unbekannte Option: $1"; exit 1 ;;
  esac
done

# ---- Ausgabe-Helfer (Community-Scripts-Stil) ---------------------------------
# WICHTIG: alles auf STDERR — msg-Aufrufe in $( ... )-erfassten Funktionen
# (z. B. neuestes_template) dürfen den erfassten Wert nie vermüllen.
C_INFO='\e[36m'; C_OK='\e[32m'; C_ERR='\e[31m'; C_RESET='\e[0m'
msg_info() { echo -e "${C_INFO}⏳${C_RESET} $*" >&2; }
msg_ok()   { echo -e "${C_OK}✅${C_RESET} $*" >&2; }
msg_error(){ echo -e "${C_ERR}❌${C_RESET} $*" >&2; }
die()      { msg_error "$*"; exit 1; }

# ---- Fehlerkette: kompletter Kontext statt nur der letzten Zeile -------------
exec > >(tee -a "$LOGFILE") 2>&1
fehler() {
  local zeile="$1" befehl="$2" code="$3"
  echo
  msg_error "Installationsfehler (Exit-Code $code)"
  echo    "   Zeile:  $zeile"
  echo    "   Befehl: $befehl"
  echo    "─────────── letzte 25 Logzeilen ($LOGFILE) ───────────"
  sleep 0.5   # tee den Rest schreiben lassen
  tail -n 25 "$LOGFILE" || true
  echo    "──────────────────────────────────────────────────────"
  echo    "Vollständiger Trace:   bash -x $0 <Optionen>"
  echo    "Dienst-Logs im CT:     pct exec <CT-ID> -- journalctl -u ${APP} -n 50 --no-pager"
  exit "$code"
}
trap 'fehler "$LINENO" "$BASH_COMMAND" "$?"' ERR

# ---- Grundlegende Werkzeuge ---------------------------------------------------
lade() { # $1 = Zielpfad, $2 = URL  (wget bevorzugt, curl als Fallback)
  if command -v wget >/dev/null 2>&1; then wget -qO "$1" "$2"; else curl -fsSL "$2" -o "$1"; fi
}

# ---- CT-Helfer ----------------------------------------------------------------
hostname_von() { # $1 = CT-ID → Hostname (leer bei Fehler/Lock, mit Unlock-Wiederholung)
  local id="$1" hn
  hn=$(${PCT} config "$id" 2>/dev/null | awk '/^hostname:/ {print $2}' || true)
  if [[ -z "$hn" ]] && [[ "$(${PCT} status "$id" 2>/dev/null || true)" == *"locked"* ]]; then
    ${PCT} unlock "$id" 2>/dev/null || true
    hn=$(${PCT} config "$id" 2>/dev/null | awk '/^hostname:/ {print $2}' || true)
  fi
  echo "$hn"
}

find_ct_by_hostname() {
  local id hn
  for id in $(${PCT} list 2>/dev/null | awk 'NR>1 {print $1}' || true); do
    hn=$(hostname_von "$id")
    if [[ "${hn,,}" == "${CT_HOSTNAME,,}" ]]; then
      echo "$id"; return 0
    fi
  done
  echo ""
}

find_free_id() {
  local used i
  used=$(${PCT} list 2>/dev/null | awk 'NR>1 {print $1}' || true)
  i=$((ID_SCAN_START))
  while [[ " $used " == *" $i "* ]]; do i=$((i+1)); done
  echo "$i"
}

neuestes_template() {
  local quelle
  quelle=$(${PVEAM:-pveam} list local 2>/dev/null | grep 'debian-12-standard' | awk -F'[; ]' '{print $2}' | sort -V | tail -1 || true)
  if [[ -z "$quelle" ]]; then
    msg_info "Lade Debian-12-Template herunter …"
    ${PVEAM:-pveam} update >/dev/null 2>&1 || true
    local datei
    datei=$(${PVEAM:-pveam} available --section system | grep -o 'debian-12-standard_[0-9.]*-[0-9]*_amd64.tar.zst' | sort -V | tail -1)
    ${PVEAM:-pveam} download local "$datei" >/dev/null
    quelle=$(${PVEAM:-pveam} list local | grep 'debian-12-standard' | awk -F'[; ]' '{print $2}' | sort -V | tail -1)
  fi
  echo "$quelle"
}

# ---- App-Dateien: GitHub-Tarball oder --local ---------------------------------
# Entpackt den Repo-Tarball (Wurzelordner variabel) und kopiert genau die
# benötigten Pfade nach /opt/anwesentwin — identisch für GitHub- und --local-Quelle.
entpacke_nach() { # $1 = tar.gz, $2 = Zielordner
  local paket="$1" ziel="$2" tmp root
  tmp=$(mktemp -d)
  tar xzf "$paket" -C "$tmp"
  root=$(echo "$tmp"/*/)
  [[ -d "$root/app" ]] || { rm -rf "$tmp"; die "Tarball enthält kein app/ — falsches Paket?"; }
  mkdir -p "$ziel/web" "$ziel/engine"
  cp -r "$root/app" "$root/migrations" "$root/systemd" "$root/requirements.txt" "$ziel/"
  cp -r "$root/web/dist" "$ziel/web/"
  cp "$root/engine/twin.js" "$ziel/engine/"
  rm -rf "$tmp"
}

push_app_files() { # $1 = CT-ID
  local ct="$1" basis paket
  paket=$(mktemp --suffix=.tar.gz)
  if $LOCAL_FILES; then
    basis="$(cd "$SCRIPT_DIR/.." && pwd)"
    [[ -f "$basis/app/anwesen_twin/main.py" ]] || die "--local: $basis/app nicht gefunden."
    msg_info "Packe lokale App-Dateien ($basis) …"
    tar czf "$paket" -C "$basis" app migrations systemd web/dist engine/twin.js requirements.txt
  else
    local url="https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}"
    msg_info "Lade App von GitHub (${REPO}@${BRANCH}) …"
    lade "$paket" "$url"
  fi
  local tmp_ziel
  tmp_ziel=$(mktemp -d)
  entpacke_nach "$paket" "$tmp_ziel/opt/anwesentwin"
  tar czf "$paket" -C "$tmp_ziel" opt
  ${PCT} push "$ct" "$paket" "/tmp/${APP}.tar.gz" --perms 644 >/dev/null
  ${PCT} exec "$ct" -- sh -c "
    mkdir -p /opt/${APP} &&
    tar xzf /tmp/${APP}.tar.gz -C / &&
    rm /tmp/${APP}.tar.gz"
  rm -rf "$tmp_ziel" "$paket"
  msg_ok "App-Dateien im CT hinterlegt (/opt/${APP})"
}

journal_auszug() { # $1 = CT-ID
  ${PCT} exec "$1" -- journalctl -u "${APP}" -n 50 --no-pager 2>&1 || true
}

# ---- Selftest-Modus (Extraktionslogik isoliert testen, auch außerhalb von pct) --
if [[ "$MODE" == "selftest-extract" ]]; then
  [[ -f "$SELFTEST_TAR" ]] || die "Selftest-Tarball fehlt: $SELFTEST_TAR"
  entpacke_nach "$SELFTEST_TAR" "$SELFTEST_ZIEL"
  msg_ok "Extraktion OK → $SELFTEST_ZIEL"
  find "$SELFTEST_ZIEL" -maxdepth 3 -type f | sort
  exit 0
fi

# ---- Ab hier braucht es den Proxmox-Host ---------------------------------------
PCT="pct"
if ! command -v "$PCT" >/dev/null 2>&1; then
  die "pct nicht gefunden — das Script muss auf dem Proxmox-VE-Host laufen, nicht im CT/in einer VM."
fi
command -v openssl >/dev/null 2>&1 || die "openssl fehlt auf dem Host."

# ---- Verifikation: Service + HTTP, bei Fehlern volle Logs ---------------------
verifiziere() { # $1 = CT-ID
  local ct="$1" aktiv health
  msg_info "Verifiziere Installation …"
  aktiv=$(${PCT} exec "$ct" -- systemctl is-active "${APP}" || true)
  if [[ "$aktiv" != "active" ]]; then
    msg_error "Dienst '${APP}' ist nicht aktiv (Status: ${aktiv:-unbekannt})."
    echo "─────────── journalctl -u ${APP} -n 50 ───────────"
    journal_auszug "$ct"
    echo "──────────────────────────────────────────────────"
    die "Siehe Logs oben — Debug: bash -x $0"
  fi
  msg_ok "systemd-Dienst läuft (systemctl is-active → active)"
  if ! ${PCT} exec "$ct" -- curl -sf "http://localhost:${APP_PORT}/api/health" >/dev/null; then
    msg_error "Web-UI antwortet nicht auf localhost:${APP_PORT}."
    echo "─────────── journalctl -u ${APP} -n 50 ───────────"
    journal_auszug "$ct"
    echo "──────────────────────────────────────────────────"
    die "Siehe Logs oben — Debug: bash -x $0"
  fi
  health=$(${PCT} exec "$ct" -- curl -sf "http://localhost:${APP_PORT}/api/health")
  msg_ok "Web-UI antwortet (HTTP-Check: $health)"
}

# $0-Fallback: beim Einzeiler (bash -c "$(...)") ist BASH_SOURCE[0] nicht gesetzt
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

# ---- Status -------------------------------------------------------------------
if [[ "$MODE" == "status" ]]; then
  CT=$(find_ct_by_hostname)
  [[ -z "$CT" ]] && die "Kein '${CT_HOSTNAME}'-Container gefunden."
  echo "Container:  $CT ($CT_HOSTNAME)"
  if [[ "$(${PCT} exec "$CT" -- systemctl is-active "${APP}" || true)" == "active" ]]; then
    IP=$(${PCT} exec "$CT" -- hostname -I | awk '{print $1}')
    msg_ok "Dienst läuft — Web-UI: http://${IP}:${APP_PORT}"
  else
    die "Dienst inaktiv — Logs: pct exec $CT -- journalctl -u ${APP} -n 50 --no-pager"
  fi
  exit 0
fi

# ---- Backup -------------------------------------------------------------------
if [[ "$MODE" == "backup" ]]; then
  CT=$(find_ct_by_hostname)
  [[ -z "$CT" ]] && die "Kein Container gefunden."
  ZIEL="/var/backups/${APP}-$(date +%Y%m%d-%H%M%S).tar.gz"
  msg_info "Sichere DB + Medien nach $ZIEL"
  ${PCT} exec "$CT" -- tar czf - -C / var/lib/${APP} > "$ZIEL"
  msg_ok "Backup: $ZIEL ($(du -h "$ZIEL" | cut -f1))"
  exit 0
fi

# ---- Uninstall ----------------------------------------------------------------
if [[ "$MODE" == "uninstall" ]]; then
  CT=$(find_ct_by_hostname)
  [[ -z "$CT" ]] && die "Kein Container gefunden."
  read -r -p "Container $CT ($CT_HOSTNAME) samt Daten löschen? 'JA' eingeben: " BEST
  [[ "$BEST" == "JA" ]] || die "Abgebrochen."
  ${PCT} stop "$CT" 2>/dev/null || true
  ${PCT} destroy "$CT"
  msg_ok "Entfernt."
  exit 0
fi

# ---- Update (idempotent: auch ein erneuter Einzeiler landet hier) -------------
if [[ "$MODE" == "update" ]]; then
  CT=$(find_ct_by_hostname)
  [[ -z "$CT" ]] && die "Kein Container gefunden — erst normal installieren."
  msg_info "Update Container $CT …"
  push_app_files "$CT"
  ${PCT} exec "$CT" -- bash -c "
    id ${APP} >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin ${APP}
    mkdir -p /etc/${APP} /var/lib/${APP}
    cd /opt/${APP} && .venv/bin/pip install -q -r requirements.txt
    cp /opt/${APP}/systemd/${APP}.service /etc/systemd/system/${APP}.service
    chown -R ${APP}:${APP} /var/lib/${APP}
    systemctl daemon-reload && systemctl restart ${APP}"
  msg_ok "Update fertig — DB, Medien und Secrets blieben erhalten."
  verifiziere "$CT"
  IP=$(${PCT} exec "$CT" -- hostname -I | awk '{print $1}')
  msg_ok "${APP_TITLE}: http://${IP}:${APP_PORT}"
  exit 0
fi

# ---- Install ------------------------------------------------------------------
EXISTING=$(find_ct_by_hostname)
if [[ -n "$EXISTING" ]]; then
  msg_info "Container existiert bereits (ID $EXISTING) — wechsle in den Update-Modus."
  if [[ "$LOCAL_FILES" == true ]]; then
    exec bash "$0" --update --local
  else
    exec bash "$0" --update
  fi
fi

[[ -z "$CT_ID" ]] && CT_ID=$(find_free_id)

# Existenzprüfung per ID — fängt auch Fälle, in denen der Hostname-Match scheiterte
# (z. B. halb angelegter/gelockter CT aus einem früheren, abgebrochenen Lauf).
if ${PCT} status "$CT_ID" >/dev/null 2>&1; then
  hn=$(hostname_von "$CT_ID")
  if [[ "${hn,,}" == "${CT_HOSTNAME,,}" ]]; then
    msg_info "Container $CT_ID gehört bereits zu ${APP_TITLE} — wechsle in den Update-Modus."
    if [[ "$LOCAL_FILES" == true ]]; then exec bash "$0" --update --local; else exec bash "$0" --update; fi
  fi
  die "CT $CT_ID existiert bereits (Hostname: ${hn:-unbekannt/gesperrt}, nicht '${CT_HOSTNAME}').
       → Anderen CT wählen:    bash $0 --id <freie-ID>
       → Falls es ein Überbleibsel eines abgebrochenen Laufs ist:
           pct unlock $CT_ID 2>/dev/null; pct destroy $CT_ID
         und danach diesen Installer erneut ausführen."
fi

[[ -z "$CT_PASSWORD" ]] && CT_PASSWORD=$(openssl rand -hex 12)
[[ -z "$WEB_PASSWORD" ]] && WEB_PASSWORD=$(openssl rand -hex 8)
CT_TEMPLATE=$(neuestes_template)

msg_info "Erstelle LXC $CT_ID ($CT_HOSTNAME, Template: $(basename "$CT_TEMPLATE"), ${CT_CORES} vCPU / ${CT_MEMORY} MB / ${CT_ROOTFS} GB) …"
${PCT} create "$CT_ID" "local:vztmpl/${CT_TEMPLATE}" \
  --hostname "$CT_HOSTNAME" --storage "$CT_STORAGE" \
  --rootfs "${CT_STORAGE}:${CT_ROOTFS}" \
  --cores "$CT_CORES" --memory "$CT_MEMORY" --swap 0 \
  --net0 "name=eth0,bridge=${CT_BRIDGE},ip=${CT_IP},firewall=0" \
  --password "$CT_PASSWORD" \
  --unprivileged 1 --features nesting=1,keyctl=1 \
  --onboot 1 --start 0 >/dev/null

msg_info "Starte Container und warte auf Netzwerk …"
${PCT} start "$CT_ID"
for i in $(seq 1 30); do
  if [[ -n "$(${PCT} exec "$CT_ID" -- hostname -I 2>/dev/null || true)" ]]; then break; fi
  sleep 2
done

msg_info "Installiere Python (apt) …"
${PCT} exec "$CT_ID" -- bash -c "apt-get update -qq && apt-get install -y -qq python3-venv curl >/dev/null"

push_app_files "$CT_ID"

msg_info "Richte venv + Abhängigkeiten ein …"
${PCT} exec "$CT_ID" -- bash -c "cd /opt/${APP} && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt"

msg_info "Lege Dienst-Nutzer, Datenverzeichnis und Secrets an …"
${PCT} exec "$CT_ID" -- bash -c "
  id ${APP} >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin ${APP}
  mkdir -p /etc/${APP} /var/lib/${APP}"
if ! ${PCT} exec "$CT_ID" -- test -f "/etc/${APP}/${APP}.env"; then
  SECRET=$(openssl rand -hex 32)
  ${PCT} push "$CT_ID" /dev/stdin "/etc/${APP}/${APP}.env" >/dev/null <<ENV
ANWESENTWIN_HOST=0.0.0.0
ANWESENTWIN_PORT=${APP_PORT}
ANWESENTWIN_SECRET=${SECRET}
ANWESENTWIN_PASSWORD=${WEB_PASSWORD}
ANWESENTWIN_DB=/var/lib/${APP}/${APP}.db
ANWESENTWIN_DATA=/var/lib/${APP}
ENV
fi
${PCT} exec "$CT_ID" -- bash -c "
  chown -R ${APP}:${APP} /var/lib/${APP}
  chmod 600 /etc/${APP}/${APP}.env
  cp /opt/${APP}/systemd/${APP}.service /etc/systemd/system/${APP}.service
  systemctl daemon-reload && systemctl enable --now ${APP}"

verifiziere "$CT_ID"

IP=$(${PCT} exec "$CT_ID" -- hostname -I | awk '{print $1}')
echo
echo "=============================================================="
echo "  ${APP_TITLE} ist installiert"
echo "--------------------------------------------------------------"
echo "  Web-UI:    http://${IP}:${APP_PORT}"
echo "  Passwort:  ${WEB_PASSWORD}"
echo "  CT-Root:   ${CT_PASSWORD}"
echo "  CT-ID:     ${CT_ID}"
echo "--------------------------------------------------------------"
echo "  Update:    bash $0 --update"
echo "  Backup:    bash $0 --backup"
echo "  Status:    bash $0 --status"
echo "  Reboot-Test: pct reboot ${CT_ID} && bash $0 --status"
echo "=============================================================="
echo "  Vollständiges Install-Log: $LOGFILE"
echo "=============================================================="
