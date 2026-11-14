# shellcheck shell=bash
#
# alert-policy.sh - helpers for scripts that keep one Cloud Monitoring alert policy equal to a
# committed JSON file (--check / --apply). Source it; it defines functions only.
#
# Used by scripts/gcp/prod-mail-failure-alert.sh. prod-scheduler-liveness-alert.sh carries its
# own copies of the same steps; moving it onto these is a follow-up, done when its --check can be
# re-run against production to prove the move changed nothing.
#
# Every function takes the project explicitly and prints failures as "FAIL: ..." lines.

# Prints the resource names of policies whose displayName EQUALS the given name, compared
# client-side so a server-side substring match cannot select a decoy.
ap_matching_policies() {
  local project="$1" name="$2" all
  all="$(gcloud alpha monitoring policies list --project="$project" --format=json)" || {
    echo "FAIL: could not list alert policies in $project (see gcloud error above)." >&2
    return 1
  }
  jq -r --arg n "$name" '.[] | select(.displayName == $n) | .name' <<<"$all"
}

# Diffs a live policy (JSON on stdin) against the committed file, through a jq projection of the
# fields that decide when and whom it alerts. Returns 1 and prints the diff on drift.
ap_semantic_diff() {
  local file="$1" projection="$2" live diff_out
  live="$(cat)"
  if ! diff_out="$(diff <(jq -S "$projection" <<<"$live") <(jq -S "$projection" "$file"))"; then
    echo "FAIL: the live policy has drifted from $file (< live, > committed):"
    echo "$diff_out" | sed 's/^/      /'
    return 1
  fi
}

# Checks every notification channel of a live policy (JSON on stdin) is enabled and unchanged
# since delivery through it was last proven (a channel edited in place keeps its name, so the
# policy diff cannot see the edit).
ap_check_channels() {
  local project="$1" proven_at="$2" live channel chan changed
  live="$(cat)"
  for channel in $(jq -r '.notificationChannels[]' <<<"$live"); do
    chan="$(gcloud alpha monitoring channels describe "$channel" --project="$project" --format=json)" || {
      echo "FAIL: could not read channel $channel (see gcloud error above)."; return 1; }
    if [ "$(jq -r '.enabled' <<<"$chan")" != "true" ]; then
      echo "FAIL: notification channel $channel is disabled, so nothing is delivered."
      return 1
    fi
    changed="$(jq -r '[(.mutationRecords // [])[].mutateTime, .creationRecord.mutateTime] | map(select(. != null) | .[0:19]) | max // ""' <<<"$chan")"
    if [ -z "$changed" ] || [[ "$changed" > "$proven_at" ]]; then
      echo "FAIL: notification channel $channel was changed at ${changed:-an unknown time}Z, after delivery"
      echo "      was last proven (${proven_at}Z). Re-prove delivery, then update DELIVERY_PROVEN_AT."
      return 1
    fi
  done
}

# Creates the policy from the file, or updates the one policy with that exact name; refuses
# when more than one has it.
ap_apply() {
  local project="$1" name="$2" file="$3" names count
  [ -f "$file" ] || { echo "missing policy file: $file" >&2; return 1; }
  names="$(ap_matching_policies "$project" "$name")" || return 1
  count="$(grep -c . <<<"$names" || true)"
  if [ "$count" -gt 1 ]; then
    echo "Refusing: $count policies are named \"$name\"; resolve the duplicates first:" >&2
    echo "$names" >&2
    return 1
  elif [ "$count" -eq 1 ]; then
    echo "Updating existing policy $names ..."
    gcloud alpha monitoring policies update "$names" --project="$project" --policy-from-file="$file"
  else
    echo "Creating \"$name\" in $project..."
    gcloud alpha monitoring policies create --project="$project" --policy-from-file="$file"
  fi
}
