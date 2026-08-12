const GIST_FILENAME = "votes.json";
const LOG_FILENAME = "votes-log.jsonl";
const SIGNATURES_FILENAME = "signatures.jsonl";
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

async function readFileContent(file, token) {
  if (!file) {
    return "";
  }
  if (!file.truncated) {
    return file.content || "";
  }

  const response = await fetch(file.raw_url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd+json",
      "User-Agent": "ohel-leah-vote",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch gist raw file: ${response.status}`);
  }

  return response.text();
}

async function readGistFiles() {
  const { token, gistId } = getConfig();
  const gist = await githubFetch(`/gists/${gistId}`, token);
  const files = gist.files || {};
  const contents = {};

  for (const [name, file] of Object.entries(files)) {
    contents[name] = await readFileContent(file, token);
  }

  return contents;
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

function stripSignature(vote) {
  const { signatureDataUrl, hasSignature, ...rest } = vote;
  return rest;
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

function attachSignatures(votes, signaturesByKey) {
  return votes.map((vote) => {
    const key = voteKey(vote);
    const signatureDataUrl = signaturesByKey.get(key);
    if (!signatureDataUrl) {
      return vote;
    }
    return { ...vote, signatureDataUrl };
  });
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
      // Skip malformed log lines.
    }
  }
  return entries;
}

function parseSignaturesLog(content) {
  const signaturesByKey = new Map();
  if (!content) {
    return signaturesByKey;
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const entry = JSON.parse(trimmed);
      if (entry.key && entry.signatureDataUrl) {
        signaturesByKey.set(entry.key, entry.signatureDataUrl);
      }
    } catch (_error) {
      // Skip malformed signature lines.
    }
  }

  return signaturesByKey;
}

function collectFallbackVotes(files) {
  const candidates = [];

  for (const [name, content] of Object.entries(files)) {
    if (!name.endsWith(".json") || name === GIST_FILENAME) {
      continue;
    }
    if (name.startsWith("backup-") || name === BACKUP_LATEST_FILENAME) {
      candidates.push(...parseVotesContent(content));
    }
  }

  return candidates;
}

async function readVotes() {
  const files = await readGistFiles();
  const signaturesByKey = parseSignaturesLog(files[SIGNATURES_FILENAME]);

  const metadataVotes = mergeVotes(
    parseVotesContent(files[GIST_FILENAME]),
    parseVoteLog(files[LOG_FILENAME]),
    collectFallbackVotes(files)
  );

  return attachSignatures(metadataVotes, signaturesByKey);
}

async function appendVoteLog(vote) {
  const { token, gistId } = getConfig();
  const files = await readGistFiles();
  const currentLog = files[LOG_FILENAME] || "";
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

async function appendSignature(vote) {
  if (!vote.signatureDataUrl) {
    return;
  }

  const { token, gistId } = getConfig();
  const files = await readGistFiles();
  const currentSignatures = files[SIGNATURES_FILENAME] || "";
  const nextLine = `${JSON.stringify({
    key: voteKey(vote),
    signatureDataUrl: vote.signatureDataUrl,
  })}\n`;
  const nextSignatures = `${currentSignatures}${nextLine}`.replace(/^\n+/, "");

  await githubFetch(`/gists/${gistId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: {
        [SIGNATURES_FILENAME]: {
          content: nextSignatures,
        },
      },
    }),
  });
}

async function writeVotes(votes) {
  const { token, gistId } = getConfig();
  const files = await readGistFiles();
  const currentVotes = await readVotes();

  if (votes.length < currentVotes.length) {
    throw new Error(
      "נחסמה שמירה שמקטינה את מספר ההצבעות. השתמשו בשחזור מגיבוי."
    );
  }

  const metadataOnly = votes.map(stripSignature);
  const payload = JSON.stringify(metadataOnly, null, 2);
  const backupPayload =
    files[GIST_FILENAME] || JSON.stringify(currentVotes.map(stripSignature), null, 2);

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
  appendSignature,
  voteKey,
  mergeVotes,
  stripSignature,
};
