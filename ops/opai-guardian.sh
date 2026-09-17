#!/usr/bin/env bash
set -Eeuo pipefail

PUBLIC_BASE="${PUBLIC_BASE:-https://opai.glasser.top}"
TARGET="${TARGET:-iz7xv8p0i0u9iehe5j6jgvz.tail0efbb0.ts.net}"
REPORT_PATH="${REPORT_PATH:-guardian-report.json}"

repairs=()
classification="healthy"
monitor_network="healthy"
initial_site_bad=false
feishu_bad=false

now_bjt() { TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M:%S %Z'; }
log() { printf '[guardian] %s\n' "$*"; }
add_repair() { repairs+=("$1"); log "repair: $1"; }

public_probe_once() {
  local prefix="$1" root_code health_code body provider catalog ok=false
  body="$(mktemp)"
  root_code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 12 "$PUBLIC_BASE/" || true)"
  health_code="$(curl -sS -o "$body" -w '%{http_code}' --connect-timeout 5 --max-time 12 "$PUBLIC_BASE/api/health" || true)"
  provider="$(jq -r '.provider // empty' "$body" 2>/dev/null || true)"
  catalog="$(jq -r '.catalog.status // empty' "$body" 2>/dev/null || true)"
  if [[ "$root_code" =~ ^2[0-9][0-9]$ && "$health_code" =~ ^2[0-9][0-9]$ && "$provider" == "deepseek" && "$catalog" == "ready" ]]; then
    ok=true
  fi
  printf -v "${prefix}_ROOT" '%s' "$root_code"
  printf -v "${prefix}_HEALTH" '%s' "$health_code"
  printf -v "${prefix}_PROVIDER" '%s' "$provider"
  printf -v "${prefix}_CATALOG" '%s' "$catalog"
  printf -v "${prefix}_OK" '%s' "$ok"
  rm -f "$body"
}

ssh_probe_once() {
  timeout 15s tailscale ssh "root@$TARGET" 'true' >/dev/null 2>&1
}

control_network_probe() {
  local a=false b=false
  curl -fsS --connect-timeout 5 --max-time 10 https://1.1.1.1/cdn-cgi/trace >/dev/null 2>&1 && a=true || true
  curl -fsS --connect-timeout 5 --max-time 10 https://example.com/ >/dev/null 2>&1 && b=true || true
  [[ "$a" == true && "$b" == true ]]
}

remote_collect() {
  local tmp out
  tmp="$(mktemp)"
  cat >"$tmp" <<'REMOTE'
set -u
state() { systemctl is-active "$1" 2>/dev/null || true; }
OPAI="$(state opai)"
NGINX="$(state nginx)"
TAILSCALED="$(state tailscaled)"
LOCAL8791=false
LOCAL8080=false
FUNNEL=false
curl -fsS --connect-timeout 3 --max-time 7 http://127.0.0.1:8791/api/health >/dev/null 2>&1 && LOCAL8791=true || true
curl -fsS --connect-timeout 3 --max-time 7 http://127.0.0.1:8080/ >/dev/null 2>&1 && LOCAL8080=true || true
FJ="$(tailscale funnel status --json 2>/dev/null || true)"
printf '%s' "$FJ" | grep -Fq 'http://127.0.0.1:8080' && FUNNEL=true || true

FT_ENABLED="$(systemctl is-enabled opai-feishu-auth.timer 2>/dev/null || true)"
FT_ACTIVE="$(systemctl is-active opai-feishu-auth.timer 2>/dev/null || true)"
FS_RESULT="$(systemctl show opai-feishu-auth.service -p Result --value 2>/dev/null || true)"
FS_STATUS="$(systemctl show opai-feishu-auth.service -p ExecMainStatus --value 2>/dev/null || true)"
FS_EXIT_TS="$(systemctl show opai-feishu-auth.service -p ExecMainExitTimestamp --value 2>/dev/null || true)"
FS_AGE=-1
if [[ -n "$FS_EXIT_TS" && "$FS_EXIT_TS" != "n/a" ]]; then
  EPOCH="$(date -d "$FS_EXIT_TS" +%s 2>/dev/null || true)"
  [[ -n "$EPOCH" ]] && FS_AGE=$(( $(date +%s) - EPOCH ))
fi
FS_SUMMARY="$(journalctl -u opai-feishu-auth.service -n 80 --no-pager -o cat 2>/dev/null | grep -E '^\{"service":"opai-feishu-auth"' | tail -n 1 || true)"
FS_SUMMARY_STATUS="$(printf '%s' "$FS_SUMMARY" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')"
FS_EXPIRES="$(printf '%s' "$FS_SUMMARY" | sed -n 's/.*"expiresAt":"\([^"]*\)".*/\1/p')"
FS_REFRESH_EXPIRES="$(printf '%s' "$FS_SUMMARY" | sed -n 's/.*"refreshExpiresAt":"\([^"]*\)".*/\1/p')"

printf 'OPAI=%s\n' "$OPAI"
printf 'NGINX=%s\n' "$NGINX"
printf 'TAILSCALED=%s\n' "$TAILSCALED"
printf 'LOCAL8791=%s\n' "$LOCAL8791"
printf 'LOCAL8080=%s\n' "$LOCAL8080"
printf 'FUNNEL=%s\n' "$FUNNEL"
printf 'FT_ENABLED=%s\n' "$FT_ENABLED"
printf 'FT_ACTIVE=%s\n' "$FT_ACTIVE"
printf 'FS_RESULT=%s\n' "$FS_RESULT"
printf 'FS_STATUS=%s\n' "$FS_STATUS"
printf 'FS_AGE=%s\n' "$FS_AGE"
printf 'FS_SUMMARY_STATUS=%s\n' "$FS_SUMMARY_STATUS"
printf 'FS_EXPIRES=%s\n' "$FS_EXPIRES"
printf 'FS_REFRESH_EXPIRES=%s\n' "$FS_REFRESH_EXPIRES"
REMOTE
  out="$(timeout 25s tailscale ssh "root@$TARGET" 'bash -s' <"$tmp" 2>/dev/null || true)"
  rm -f "$tmp"
  printf '%s\n' "$out"
}

declare -A R=()
parse_remote() {
  R=()
  local line k v
  while IFS= read -r line; do
    [[ "$line" == *=* ]] || continue
    k="${line%%=*}"; v="${line#*=}"
    R["$k"]="$v"
  done <<<"$1"
}

site_remote_ok() {
  [[ "${R[OPAI]:-}" == active && "${R[NGINX]:-}" == active && "${R[TAILSCALED]:-}" == active && "${R[LOCAL8791]:-}" == true && "${R[LOCAL8080]:-}" == true && "${R[FUNNEL]:-}" == true ]]
}

feishu_ok() {
  local age="${R[FS_AGE]:--1}"
  [[ "${R[FT_ENABLED]:-}" == enabled && "${R[FT_ACTIVE]:-}" == active && "${R[FS_RESULT]:-}" == success && "${R[FS_STATUS]:-}" == 0 && "${R[FS_SUMMARY_STATUS]:-}" == ready && "$age" =~ ^[0-9]+$ && "$age" -ge 0 && "$age" -le 5400 ]]
}

remote_wait_collect() {
  local seconds="$1" i out
  for ((i=0; i<seconds; i++)); do
    sleep 1
    out="$(remote_collect)"
    parse_remote "$out"
    site_remote_ok && return 0
  done
  return 1
}

remote_cmd() {
  local cmd="$1"
  timeout 70s tailscale ssh "root@$TARGET" "$cmd"
}

log "round 1 public probe"
public_probe_once P1
sleep 4
log "round 2 public probe"
public_probe_once P2
PUBLIC_INITIAL_OK=false
if [[ "$P1_OK" == true || "$P2_OK" == true ]]; then PUBLIC_INITIAL_OK=true; fi

SSH1=false; SSH2=false
ssh_probe_once && SSH1=true || true
sleep 3
ssh_probe_once && SSH2=true || true
SSH_OK=false
if [[ "$SSH1" == true || "$SSH2" == true ]]; then SSH_OK=true; fi

if [[ "$PUBLIC_INITIAL_OK" != true && "$SSH_OK" != true ]]; then
  if ! control_network_probe; then
    classification="monitor_network_unhealthy"
    monitor_network="unhealthy"
    log "monitor network unhealthy; no remote repair"
  fi
fi

REMOTE_INITIAL_OK=false
if [[ "$SSH_OK" == true ]]; then
  out="$(remote_collect)"; parse_remote "$out"
  if site_remote_ok; then
    REMOTE_INITIAL_OK=true
  else
    sleep 3
    out="$(remote_collect)"; parse_remote "$out"
    site_remote_ok && REMOTE_INITIAL_OK=true || true
  fi
else
  R[OPAI]="unknown"; R[NGINX]="unknown"; R[TAILSCALED]="unknown"; R[LOCAL8791]="unknown"; R[LOCAL8080]="unknown"; R[FUNNEL]="unknown"
  R[FT_ENABLED]="unknown"; R[FT_ACTIVE]="unknown"; R[FS_RESULT]="unknown"; R[FS_STATUS]="unknown"; R[FS_AGE]="-1"; R[FS_SUMMARY_STATUS]="unknown"; R[FS_EXPIRES]=""; R[FS_REFRESH_EXPIRES]=""
fi

if [[ "$PUBLIC_INITIAL_OK" != true || "$REMOTE_INITIAL_OK" != true ]]; then initial_site_bad=true; fi

if [[ "$classification" != monitor_network_unhealthy && "$initial_site_bad" == true && "$SSH_OK" == true ]]; then
  if [[ "${R[OPAI]:-}" != active || "${R[LOCAL8791]:-}" != true ]]; then
    add_repair "restart opai"
    remote_cmd 'systemctl restart opai' >/dev/null 2>&1 || true
    remote_wait_collect 15 || true
  fi

  if [[ "${R[NGINX]:-}" != active || "${R[LOCAL8080]:-}" != true ]]; then
    if remote_cmd 'nginx -t >/dev/null 2>&1'; then
      add_repair "nginx -t passed; restart nginx"
      remote_cmd 'systemctl restart nginx' >/dev/null 2>&1 || true
      remote_wait_collect 15 || true
    else
      add_repair "nginx -t failed; nginx not restarted"
    fi
  fi

  if [[ "${R[OPAI]:-}" == active && "${R[LOCAL8791]:-}" == true && "${R[NGINX]:-}" == active && "${R[LOCAL8080]:-}" == true && ( "${R[TAILSCALED]:-}" != active || "${R[FUNNEL]:-}" != true ) ]]; then
    add_repair "restart tailscaled and restore Funnel"
    timeout 20s tailscale ssh "root@$TARGET" 'systemctl restart tailscaled' >/dev/null 2>&1 || true
    sleep 5
    timeout 20s tailscale ping --c 1 "$TARGET" >/dev/null 2>&1 || true
    timeout 30s tailscale ssh "root@$TARGET" 'tailscale funnel --bg http://127.0.0.1:8080 >/dev/null 2>&1' >/dev/null 2>&1 || true
    out="$(remote_collect)"; parse_remote "$out"
  fi
fi

# Independent Feishu auth maintenance check.
if [[ "$SSH_OK" == true ]]; then
  feishu_ok || feishu_bad=true
  if [[ "$feishu_bad" == true && "$classification" != monitor_network_unhealthy ]]; then
    sleep 3
    out="$(remote_collect)"; parse_remote "$out"
    if ! feishu_ok; then
      age="${R[FS_AGE]:--1}"
      timer_bad=false
      [[ "${R[FT_ENABLED]:-}" == enabled && "${R[FT_ACTIVE]:-}" == active ]] || timer_bad=true
      [[ "$age" =~ ^[0-9]+$ && "$age" -ge 0 && "$age" -le 5400 ]] || timer_bad=true
      if [[ "$timer_bad" == true ]]; then
        add_repair "restore opai-feishu-auth.timer and run bounded auth check"
        remote_cmd 'systemctl enable --now opai-feishu-auth.timer >/dev/null 2>&1; timeout 60s systemctl start opai-feishu-auth.service' >/dev/null 2>&1 || true
      elif [[ "${R[FS_RESULT]:-}" != success || "${R[FS_STATUS]:-}" != 0 || "${R[FS_SUMMARY_STATUS]:-}" != ready ]]; then
        add_repair "retry opai-feishu-auth.service once"
        remote_cmd 'timeout 60s systemctl start opai-feishu-auth.service' >/dev/null 2>&1 || true
      fi
      out="$(remote_collect)"; parse_remote "$out"
    fi
    feishu_ok && feishu_bad=false || feishu_bad=true
  fi
fi

log "final public probes"
public_probe_once F1
sleep 3
public_probe_once F2
FINAL_PUBLIC_OK=false
if [[ "$F1_OK" == true || "$F2_OK" == true ]]; then FINAL_PUBLIC_OK=true; fi

FINAL_REMOTE_OK=false
if [[ "$SSH_OK" == true ]]; then
  out="$(remote_collect)"; parse_remote "$out"
  site_remote_ok && FINAL_REMOTE_OK=true || true
fi

if [[ "$classification" != monitor_network_unhealthy ]]; then
  if [[ "$FINAL_PUBLIC_OK" == true && "$FINAL_REMOTE_OK" == true ]]; then
    if [[ "$initial_site_bad" == true ]]; then classification="auto_recovered"; else classification="healthy"; fi
  else
    if [[ "$SSH_OK" == true && "${R[OPAI]:-}" == active && "${R[LOCAL8791]:-}" == true && "${R[NGINX]:-}" == active && "${R[LOCAL8080]:-}" == true && "${R[FUNNEL]:-}" == true && "$FINAL_PUBLIC_OK" != true ]]; then
      classification="edge_unhealthy"
    else
      classification="unhealthy"
    fi
  fi
fi

repairs_json='[]'
for item in "${repairs[@]:-}"; do
  [[ -n "$item" ]] || continue
  repairs_json="$(jq --arg x "$item" '. + [$x]' <<<"$repairs_json")"
done

jq -n \
  --arg time "$(now_bjt)" \
  --arg classification "$classification" \
  --arg monitorNetwork "$monitor_network" \
  --argjson initialSiteBad "$initial_site_bad" \
  --argjson initialPublicOk "$PUBLIC_INITIAL_OK" \
  --arg initialRoot "$P2_ROOT" --arg initialHealth "$P2_HEALTH" --arg initialProvider "$P2_PROVIDER" --arg initialCatalog "$P2_CATALOG" \
  --argjson sshOk "$SSH_OK" \
  --arg opai "${R[OPAI]:-unknown}" --arg nginx "${R[NGINX]:-unknown}" --arg tailscaled "${R[TAILSCALED]:-unknown}" \
  --arg local8791 "${R[LOCAL8791]:-unknown}" --arg local8080 "${R[LOCAL8080]:-unknown}" --arg funnel "${R[FUNNEL]:-unknown}" \
  --argjson finalPublicOk "$FINAL_PUBLIC_OK" --arg finalRoot "$F2_ROOT" --arg finalHealth "$F2_HEALTH" --arg finalProvider "$F2_PROVIDER" --arg finalCatalog "$F2_CATALOG" \
  --arg ftEnabled "${R[FT_ENABLED]:-unknown}" --arg ftActive "${R[FT_ACTIVE]:-unknown}" --arg fsResult "${R[FS_RESULT]:-unknown}" --arg fsExit "${R[FS_STATUS]:-unknown}" --arg fsAge "${R[FS_AGE]:--1}" \
  --arg fsSummary "${R[FS_SUMMARY_STATUS]:-unknown}" --arg fsExpires "${R[FS_EXPIRES]:-}" --arg fsRefreshExpires "${R[FS_REFRESH_EXPIRES]:-}" \
  --argjson feishuBad "$feishu_bad" --argjson repairs "$repairs_json" \
  '{time:$time,classification:$classification,monitorNetwork:$monitorNetwork,initial:{siteBad:$initialSiteBad,publicOk:$initialPublicOk,rootHttp:$initialRoot,healthHttp:$initialHealth,provider:$initialProvider,catalog:$initialCatalog,sshOk:$sshOk},remote:{opai:$opai,nginx:$nginx,tailscaled:$tailscaled,local8791:$local8791,local8080:$local8080,funnel:$funnel},final:{publicOk:$finalPublicOk,rootHttp:$finalRoot,healthHttp:$finalHealth,provider:$finalProvider,catalog:$finalCatalog},feishuAuth:{unhealthy:$feishuBad,timerEnabled:$ftEnabled,timerActive:$ftActive,serviceResult:$fsResult,execMainStatus:$fsExit,lastRunAgeSec:$fsAge,status:$fsSummary,expiresAt:$fsExpires,refreshExpiresAt:$fsRefreshExpires},repairs:$repairs,controlPlaneLimitation:"If target tailscaled is fully down, Tailscale-only SSH cannot restart it; an independent recovery channel is required."}' >"$REPORT_PATH"

cat "$REPORT_PATH"

{
  echo '## OPAI Guardian'
  echo
  echo "- 时间：$(jq -r .time "$REPORT_PATH")"
  echo "- 状态：$(jq -r .classification "$REPORT_PATH")"
  echo "- 公网：root $(jq -r .final.rootHttp "$REPORT_PATH"), health $(jq -r .final.healthHttp "$REPORT_PATH"), provider=$(jq -r .final.provider "$REPORT_PATH"), catalog=$(jq -r .final.catalog "$REPORT_PATH")"
  echo "- 源站：opai=$(jq -r .remote.opai "$REPORT_PATH"), nginx=$(jq -r .remote.nginx "$REPORT_PATH"), tailscaled=$(jq -r .remote.tailscaled "$REPORT_PATH"), 8791=$(jq -r .remote.local8791 "$REPORT_PATH"), 8080=$(jq -r .remote.local8080 "$REPORT_PATH"), funnel=$(jq -r .remote.funnel "$REPORT_PATH")"
  echo "- 飞书授权维护：$(jq -r .feishuAuth.status "$REPORT_PATH"), timer=$(jq -r .feishuAuth.timerActive "$REPORT_PATH"), lastRunAgeSec=$(jq -r .feishuAuth.lastRunAgeSec "$REPORT_PATH")"
  echo "- 修复动作：$(jq -r 'if (.repairs|length)==0 then "无" else (.repairs|join("；")) end' "$REPORT_PATH")"
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
