import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

GIST_ID = "7cbabc8fb32ec2fbbafe33eb4aae9a51"


def gh_json(args):
    raw = subprocess.check_output(["gh", *args], stderr=subprocess.DEVNULL)
    return json.loads(raw.decode("utf-8"))


def vote_key(vote):
    return "|".join(
        [
            vote.get("timestampIso") or vote.get("timestamp") or "",
            vote.get("fullName", ""),
            vote.get("phone", ""),
            vote.get("email", ""),
            vote.get("voteKey", ""),
        ]
    )


def strip_signature(vote):
    return {k: v for k, v in vote.items() if k not in {"signatureDataUrl", "hasSignature"}}


def main():
    restored_path = Path("data/restored-votes.json")
    if not restored_path.exists():
        raise SystemExit("Missing data/restored-votes.json")

    votes_list = json.loads(restored_path.read_text(encoding="utf-8"))
    metadata = [strip_signature(vote) for vote in votes_list]

    log_lines = [json.dumps(strip_signature(vote) | {"hasSignature": bool(vote.get("signatureDataUrl"))}, ensure_ascii=False) for vote in votes_list]
    signature_lines = []
    for vote in votes_list:
        if vote.get("signatureDataUrl"):
            signature_lines.append(
                json.dumps(
                    {"key": vote_key(vote), "signatureDataUrl": vote["signatureDataUrl"]},
                    ensure_ascii=False,
                )
            )

    votes_content = json.dumps(metadata, ensure_ascii=False, indent=2)
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    payload = {
        "files": {
            "votes.json": {"content": votes_content},
            "votes-log.jsonl": {"content": "\n".join(log_lines) + ("\n" if log_lines else "")},
            "signatures.jsonl": {"content": "\n".join(signature_lines) + ("\n" if signature_lines else "")},
            "backup-latest.json": {"content": votes_content},
            f"backup-{date}.json": {"content": votes_content},
        }
    }

    patch_path = Path("data/repair-gist-payload.json")
    patch_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    subprocess.check_call(
        ["gh", "api", f"gists/{GIST_ID}", "-X", "PATCH", "--input", str(patch_path)]
    )
    print(f"repaired gist with {len(votes_list)} votes")


if __name__ == "__main__":
    main()
