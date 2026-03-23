#!/usr/bin/env bash
set -euo pipefail

TEAM="${CLAWTEAM_TEAM_NAME:?missing team}"
AGENT="${CLAWTEAM_AGENT_NAME:?missing agent}"
LEADER="leader"
WORKDIR="${CLAWTEAM_WORKSPACE_DIR:-$PWD}"
PROMPT="${*:-}"

cd "$WORKDIR"

TASK_ID=$(python3 - <<'PY' "$TEAM" "$AGENT"
import json,sys,glob,os
team=sys.argv[1]
agent=sys.argv[2]
base=os.path.expanduser(f'~/.clawteam/tasks/{team}')
for path in sorted(glob.glob(os.path.join(base, 'task-*.json'))):
    try:
        with open(path,'r',encoding='utf-8') as f:
            data=json.load(f)
    except Exception:
        continue
    if data.get('owner') == agent and data.get('status') in ('pending','in_progress',''):
        print(data.get('id',''))
        raise SystemExit
print('')
PY
)

if [[ -n "$TASK_ID" ]]; then
  clawteam task update "$TEAM" "$TASK_ID" --status in_progress >/dev/null 2>&1 || true
fi

RESULT_FILE=$(mktemp)
cleanup() { rm -f "$RESULT_FILE"; }
trap cleanup EXIT

RUN_PROMPT=$(cat <<EOF
You are a Codex worker inside a ClawTeam team.
Team: $TEAM
Agent: $AGENT
Leader: $LEADER
Workspace: $WORKDIR

Original task prompt:
$PROMPT

Your job:
1. Read the local repository/workspace if needed.
2. Produce a concise result for the assigned task.
3. Output ONLY the final result text, no markdown fences, no extra commentary.
EOF
)

export PATH="$HOME/.npm-global/bin:$PATH"
codex exec -C "$WORKDIR" --sandbox workspace-write --skip-git-repo-check --color never -o "$RESULT_FILE" "$RUN_PROMPT" >/dev/null 2>&1 || true
RESULT=$(tr '\n' ' ' < "$RESULT_FILE" | sed 's/[[:space:]]\+/ /g' | sed 's/^ //; s/ $//')

if [[ -z "$RESULT" ]]; then
  RESULT="BLOCKED from $AGENT: worker produced no result"
  clawteam inbox send "$TEAM" "$LEADER" "$RESULT" >/dev/null 2>&1 || true
else
  clawteam inbox send "$TEAM" "$LEADER" "RESULT from $AGENT: $RESULT" >/dev/null 2>&1 || true
fi

if [[ -n "$TASK_ID" ]]; then
  clawteam task update "$TEAM" "$TASK_ID" --status completed >/dev/null 2>&1 || true
fi

exit 0
