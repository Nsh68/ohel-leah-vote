import json
import subprocess
from pathlib import Path

GIST_ID = "7cbabc8fb32ec2fbbafe33eb4aae9a51"
RESTORE_FROM_SHA = "6d91c55976fd52b993d814321e6e38c91daeaca6"  # 26 votes on 2026-08-09


def get_votes(sha: str):
    out = subprocess.check_output(
        ["gh", "api", f"gists/{GIST_ID}/{sha}", "--jq", '.files["votes.json"].content'],
    )
    return json.loads(out.decode("utf-8"))


def vote_key(vote: dict) -> str:
    return "|".join(
        [
            vote.get("timestampIso") or vote.get("timestamp") or "",
            vote.get("fullName", "").strip(),
            vote.get("phone", "").strip(),
            vote.get("email", "").strip(),
            vote.get("voteKey", ""),
        ]
    )


def gh_json(args):
    raw = subprocess.check_output(["gh", *args], stderr=subprocess.DEVNULL)
    return json.loads(raw.decode("utf-8"))


def get_current_votes():
    gist = gh_json(["api", f"gists/{GIST_ID}"])
    content = gist["files"]["votes.json"]["content"]
    return json.loads(content)


def main():
    restored = get_votes(RESTORE_FROM_SHA)
    current = get_current_votes()

    merged = []
    seen = set()
    for vote in restored + current:
        key = vote_key(vote)
        if key in seen:
            continue
        seen.add(key)
        merged.append(vote)

    merged.sort(key=lambda item: item.get("timestampIso") or item.get("timestamp") or "")

    payload = json.dumps(merged, ensure_ascii=False, indent=2)
    Path("data/restored-votes.json").write_text(payload, encoding="utf-8")

    patch_path = Path("data/restore-patch.json")
    patch_path.write_text(
        json.dumps({"files": {"votes.json": {"content": payload}}}, ensure_ascii=False),
        encoding="utf-8",
    )

    subprocess.check_call(
        ["gh", "api", f"gists/{GIST_ID}", "-X", "PATCH", "--input", str(patch_path)],
    )

    print(f"restored={len(restored)} current={len(current)} merged={len(merged)}")


if __name__ == "__main__":
    main()
