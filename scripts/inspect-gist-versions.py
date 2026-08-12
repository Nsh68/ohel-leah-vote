import json
import subprocess
import sys

GIST_ID = "7cbabc8fb32ec2fbbafe33eb4aae9a51"


def get_votes(sha: str):
    out = subprocess.check_output(
        ["gh", "api", f"gists/{GIST_ID}/{sha}", "--jq", '.files["votes.json"].content'],
        text=True,
        encoding="utf-8",
    )
    return json.loads(out)


def main():
    commits = json.loads(
        subprocess.check_output(["gh", "api", f"gists/{GIST_ID}/commits"], text=True)
    )
    for commit in commits[:10]:
        sha = commit["version"]
        date = commit["committed_at"]
        try:
            votes = get_votes(sha)
            print(f"{date} count={len(votes)}")
        except Exception as error:
            print(f"{date} ERR={type(error).__name__}")


if __name__ == "__main__":
    main()
