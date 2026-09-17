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
  local prefix="$1" body root_code health_code provider catalog ok=false
  body="$(mktemp)"
  root_code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 12 "$PUBLIC_BASE/" || true)"
  health_code="$(curl -sS -o "$body" -w '%{http_code}' --connect-timeout 5 --max-time 12 "$PUBLIC_BASE/api/health" || true)"
  provider="$(jq -r '.provider // empty' "$body" 2>/dev/null || true)"
  catalog="$(jq -r '.catalog.status // empty' "$body" 2>/dev/null || true)"
  if [[ "$root_code" =~ ^2[0-9][0-9]$ && "$health_code" =~ ^2[0-9][0-9]$ && "$provider" == deepseek && "$catalog" == ready ]]; then
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
FT_NEXT="$(systemctl show opai-feishu-auth.timer -p NextElapseUSecRealtime --value 2>/dev/null || true)"
FS_RESULT="$(systemctl show opai-feishu-auth.service -p Result --value 2>/dev/null || true)"
FS_STATUS="$(systemctl show opai-feishu-auth.service -p ExecMainStatus --value 2>/dev/null || true)"
FS_EXIT_TS="$(systemctl show opai-feishu-auth.service -p ExecMainExitTimestamp --value 2>/dev/null || true)"
FS_AGE=-1
if [[ -n "$FS_EXIT_TS" && "$FS_EXIT_TS" != n/a ]]; then
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
printf 'FT_NEXT=%s\n' "$FT_NEXT"
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

remote_cmd() {
  timeout 70s tailscale ssh "root@$TARGET" "$1"
}

remote_refresh() {
  local out
  out="$(remote_collect)"
  parse_remote "$out"
}

log "round 1 public probe"
public_probe_once P1
sleep 4
log "round 2 public probe"
public_probe_once P2
PUBLIC_INITIAL_OK=false
[[ "$P1_OK" == true || "$P2_OK" == true ]] && PUBLIC_INITIAL_OK=true

SSH1=false; SSH2=false
ssh_probe_once && SSH1=true || true
sleep 3
ssh_probe_once && SSH2=true || true
SSH_OK=false
[[ "$SSH1" == true || "$SSH2" == true ]] && SSH_OK=true

if [[ "$PUBLIC_INITIAL_OK" != true && "$SSH_OK" != true ]]; then
  if ! control_network_probe; then
    classification="monitor_network_unhealthy"
    monitor_network="unhealthy"
    log "monitor network unhealthy; no remote repair"
  fi
fi

REMOTE_INITIAL_OK=false
if [[ "$SSH_OK" == true ]]; then
  remote_refresh
  if site_remote_ok; then
    REMOTE_INITIAL_OK=true
  else
    sleep 3
    remote_refresh
    site_remote_ok && REMOTE_INITIAL_OK=true || true
  fi
else
  for k in OPAI NGINX TAILSCALED LOCAL8791 LOCAL8080 FUNNEL FT_ENABLED FT_ACTIVE FT_NEXT FS_RESULT FS_STATUS FS_SUMMARY_STATUS; do R[$k]="unknown"; done
  R[FS_AGE]="-1"; R[FS_EXPIRES]=""; R[FS_REFRESH_EXPIRES]=""
fi

if [[ "$PUBLIC_INITIAL_OK" != true || "$REMOTE_INITIAL_OK" != true ]]; then initial_site_bad=true; fi

if [[ "$classification" != monitor_network_unhealthy && "$initial_site_bad" == true && "$SSH_OK" == true ]]; then
  if [[ "${R[OPAI]:-}" != active || "${R[LOCAL8791]:-}" != true ]]; then
    add_repair "restart opai"
    remote_cmd 'systemctl restart opai' >/dev/null 2>&1 || true
    sleep 8
    remote_refresh
  fi

  if [[ "${R[NGINX]:-}" != active || "${R[LOCAL8080]:-}" != true ]]; then
    if remote_cmd 'nginx -t >/dev/null 2>&1'; then
      add_repair "nginx -t passed; restart nginx"
      remote_cmd 'systemctl restart nginx' >/dev/null 2>&1 || true
      sleep 8
      remote_refresh
    else
      add_repair "nginx -t failed; nginx not restarted"
    fi
  fi

  if [[ "${R[OPAI]:-}" == active && "${R[LOCAL8791]:-}" == true && "${R[NGINX]:-}" == active && "${R[LOCAL8080]:-}" == true && "${R[FUNNEL]:-}" != true ]]; then
    add_repair "restore Funnel mapping"
    remote_cmd 'tailscale funnel --bg http://127.0.0.1:8080 >/dev/null 2>&1' >/dev/null 2>&1 || true
    sleep 5
    remote_refresh
  fi
fi

# Independent Feishu authorization maintenance. It never changes website health classification.
if [[ "$SSH_OK" == true ]]; then
  feishu_ok || feishu_bad=true
  if [[ "$feishu_bad" == true && "$classification" != monitor_network_unhealthy ]]; then
    sleep 3
    remote_refresh
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
      remote_refresh
    fi
    feishu_ok && feishu_bad=false || feishu_bad=true
  fi
fi

log "final public probes"
public_probe_once F1
sleep 3
public_probe_once F2
FINAL_PUBLIC_OK=false
[[ "$F1_OK" == true || "$F2_OK" == true ]] && FINAL_PUBLIC_OK=true

FINAL_REMOTE_OK=false
if [[ "$SSH_OK" == true ]]; then
  remote_refresh
  site_remote_ok && FINAL_REMOTE_OK=true || true
fi

if [[ "$classification" != monitor_network_unhealthy ]]; then
  if [[ "$FINAL_PUBLIC_OK" == true && "$FINAL_REMOTE_OK" == true ]]; then
    if [[ "$initial_site_bad" == true ]]; then classification="auto_recovered"; else classification="healthy"; fi
  elif [[ "$SSH_OK" == true && "${R[OPAI]:-}" == active && "${R[LOCAL8791]:-}" == true && "${R[NGINX]:-}" == active && "${R[LOCAL8080]:-}" == true && "${R[FUNNEL]:-}" == true && "$FINAL_PUBLIC_OK" != true ]]; then
    classification="edge_unhealthy"
  else
    classification="unhealthy"
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
  --argjson feishuUnhealthy "$feishu_bad" --arg ftEnabled "${R[FT_ENABLED]:-unknown}" --arg ftActive "${R[FT_ACTIVE]:-unknown}" --arg ftNext "${R[FT_NEXT]:-unknown}" \
  --arg fsResult "${R[FS_RESULT]:-unknown}" --arg fsExit "${R[FS_STATUS]:-unknown}" --arg fsAge "${R[FS_AGE]:--1}" --arg fsSummary "${R[FS_SUMMARY_STATUS]:-unknown}" \
  --arg fsExpires "${R[FS_EXPIRES]:-}" --arg fsRefreshExpires "${R[FS_REFRESH_EXPIRES]:-}" \
  --argjson repairs "$repairs_json" \
  '{time:$time,classification:$classification,monitorNetwork:$monitorNetwork,initial:{siteBad:$initialSiteBad,publicOk:$initialPublicOk,rootHttp:$initialRoot,healthHttp:$initialHealth,provider:$initialProvider,catalog:$initialCatalog,sshOk:$sshOk},remote:{opai:$opai,nginx:$nginx,tailscaled:$tailscaled,local8791:$local8791,local8080:$local8080,funnel:$funnel},final:{publicOk:$finalPublicOk,rootHttp:$finalRoot,healthHttp:$finalHealth,provider:$finalProvider,catalog:$finalCatalog},feishuAuth:{unhealthy:$feishuUnhealthy,timerEnabled:$ftEnabled,timerActive:$ftActive,nextTrigger:$ftNext,serviceResult:$fsResult,execMainStatus:$fsExit,lastRunAgeSec:$fsAge,status:$fsSummary,expiresAt:$fsExpires,refreshExpiresAt:$fsRefreshExpires},repairs:$repairs,controlPlaneLimitation:"If target tailscaled is fully down, Tailscale-only SSH cannot restart it; an independent recovery channel is required."}' | tee "$REPORT_PATH"
