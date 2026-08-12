import json
import subprocess
from datetime import datetime, timezone

GIST_ID = "7cbabc8fb32ec2fbbafe33eb4aae9a51"


def gh_json(args):
    raw = subprocess.check_output(["gh", *args], stderr=subprocess.DEVNULL)
    return json.loads(raw.decode("utf-8"))


def main():
    gist = gh_json(["api", f"gists/{GIST_ID}"])
    files = gist.get("files", {})
    votes = files.get("votes.json", {}).get("content", "[]")
    votes_list = json.loads(votes) if votes else []

    log_lines = []
    for vote in votes_list:
        log_lines.append(
            json.dumps(
                {
                    "timestamp": vote.get("timestamp"),
                    "timestampIso": vote.get("timestampIso"),
                    "vote": vote.get("vote"),
                    "voteKey": vote.get("voteKey"),
                    "fullName": vote.get("fullName"),
                    "phone": vote.get("phone"),
                    "email": vote.get("email"),
                    "hasSignature": bool(vote.get("signatureDataUrl")),
                },
                ensure_ascii=False,
            )
        )

    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    payload = {
        "files": {
            "votes-log.jsonl": {"content": "\n".join(log_lines) + ("\n" if log_lines else "")},
            "backup-latest.json": {"content": votes},
            f"backup-{date}.json": {"content": votes},
        }
    }

    patch_path = "data/seed-backup-payload.json"
    with open(patch_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False)

    subprocess.check_call(
        ["gh", "api", f"gists/{GIST_ID}", "-X", "PATCH", "--input", patch_path]
    )
    print(f"seeded log with {len(log_lines)} entries")


if __name__ == "__main__":
    main()
