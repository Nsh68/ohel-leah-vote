const GIST_FILENAME = "votes.json";

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

async function readVotes() {
  const { token, gistId } = getConfig();
  const gist = await githubFetch(`/gists/${gistId}`, token);
  const file = gist.files?.[GIST_FILENAME];
  if (!file || !file.content) {
    return [];
  }
  try {
    const parsed = JSON.parse(file.content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

async function writeVotes(votes) {
  const { token, gistId } = getConfig();
  await githubFetch(`/gists/${gistId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(votes, null, 2),
        },
      },
    }),
  });
}

module.exports = {
  VOTE_LABELS,
  readVotes,
  writeVotes,
};
