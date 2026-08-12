const { readVotes, writeVotes, appendVoteLog, VOTE_LABELS } = require("../lib/votesStore");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { vote, fullName, phone, email, signatureDataUrl } = req.body || {};

    if (!vote || !VOTE_LABELS[vote]) {
      return res.status(400).json({ ok: false, error: "יש לבחור אפשרות הצבעה." });
    }
    if (!fullName || !String(fullName).trim()) {
      return res.status(400).json({ ok: false, error: "יש למלא שם ושם משפחה." });
    }
    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ ok: false, error: "יש למלא מספר טלפון." });
    }
    if (!email || !String(email).trim()) {
      return res.status(400).json({ ok: false, error: 'יש למלא כתובת דוא"ל.' });
    }
    if (!signatureDataUrl || !String(signatureDataUrl).startsWith("data:image")) {
      return res.status(400).json({ ok: false, error: "יש לחתום בתיבת החתימה." });
    }

    const votes = await readVotes();
    const timestamp = new Date();

    const newVote = {
      timestamp: timestamp.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }),
      timestampIso: timestamp.toISOString(),
      vote: VOTE_LABELS[vote],
      voteKey: vote,
      fullName: String(fullName).trim(),
      phone: String(phone).trim(),
      email: String(email).trim(),
      signatureDataUrl: String(signatureDataUrl),
    };

    votes.push(newVote);

    await appendVoteLog(newVote);
    await writeVotes(votes);

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Vote save failed:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "שמירת ההצבעה נכשלה. נסו שוב.",
    });
  }
};
