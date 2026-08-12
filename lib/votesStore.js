const GIST_FILENAME = "votes.json";
const LOG_FILENAME = "votes-log.jsonl";
const BACKUP_LATEST_FILENAME = "backup-latest.json";

const VOTE_LABELS = {
  for: "בעד עריכת אסיפת חברים שלא מן המניין",
  against: "מתנגד לקיום אסיפת חברים שלא מן המניין",
};

function getConfig() {
  const token = process.env.GITHUB_TOKEN || process.env.GIST_TOKEN;
  const gistId = process.env.GIST_ID;
  if (!token) {
    throw new Error("חסר GITHUB_TOKEN בשרת.");
  }
  if (!gistId) {
    throw new Error("חסר GIST_ID בשרת.");
  }
  return { token, gistId };
}

async function githubFetch(path, token, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "ohel-leah-vote",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${response.status}: ${text}`);
  }

  return response.json();
}

async function readGistFiles() {
  const { token, gistId } = getConfig();
  const gist = await githubFetch(`/gists/${gistId}`, token);
  return gist.files || {};
}

function parseVotesContent(content) {
  if (!content) {
    return [];
  }
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function voteKey(vote) {
  return [
    vote.timestampIso || vote.timestamp || "",
    vote.fullName || "",
    vote.phone || "",
    vote.email || "",
    vote.voteKey || "",
  ].join("|");
}

function mergeVotes(...lists) {
  const merged = [];
  const seen = new Set();

  for (const list of lists) {
    for (const vote of list) {
      const key = voteKey(vote);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(vote);
    }
  }

  return merged.sort(
    (a, b) =>
      String(a.timestampIso || a.timestamp || "").localeCompare(
        String(b.timestampIso || b.timestamp || "")
      )
  );
}

function toLogEntry(vote) {
  return {
    timestamp: vote.timestamp,
    timestampIso: vote.timestampIso,
    vote: vote.vote,
    voteKey: vote.voteKey,
    fullName: vote.fullName,
    phone: vote.phone,
    email: vote.email,
    hasSignature: Boolean(vote.signatureDataUrl),
  };
}

async function readVotes() {
  const files = await readGistFiles();
  const votes = parseVotesContent(files[GIST_FILENAME]?.content);
  const logVotes = parseVoteLog(files[LOG_FILENAME]?.content);
  return mergeVotes(votes, logVotes);
}

function parseVoteLog(content) {
  if (!content) {
    return [];
  }

  const entries = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      entries.push(JSON.parse(trimmed));
    } catch (_error) {
      // Skip malformed log lines instead of failing the whole read.
    }
  }
  return entries;
}

async function appendVoteLog(vote) {
  const { token, gistId } = getConfig();
  const files = await readGistFiles();
  const currentLog = files[LOG_FILENAME]?.content || "";
  const nextLine = `${JSON.stringify(toLogEntry(vote))}\n`;
  const nextLog = `${currentLog}${nextLine}`.replace(/^\n+/, "");

  await githubFetch(`/gists/${gistId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: {
        [LOG_FILENAME]: {
          content: nextLog,
        },
      },
    }),
  });
}

async function writeVotes(votes) {
  const { token, gistId } = getConfig();
  const files = await readGistFiles();
  const currentVotes = parseVotesContent(files[GIST_FILENAME]?.content);

  if (votes.length < currentVotes.length) {
    throw new Error(
      "נחסמה שמירה שמקטינה את מספר ההצבעות. השתמשו בשחזור מגיבוי."
    );
  }

  const payload = JSON.stringify(votes, null, 2);
  const backupPayload = files[GIST_FILENAME]?.content || JSON.stringify(currentVotes, null, 2);

  await githubFetch(`/gists/${gistId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: payload,
        },
        [BACKUP_LATEST_FILENAME]: {
          content: backupPayload,
        },
      },
    }),
  });
}

module.exports = {
  VOTE_LABELS,
  readVotes,
  writeVotes,
  appendVoteLog,
  voteKey,
  mergeVotes,
};
