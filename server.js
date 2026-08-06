const express = require("express");
const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const SIGNATURES_DIR = path.join(DATA_DIR, "signatures");
const EXCEL_PATH = path.join(DATA_DIR, "votes.xlsx");

const VOTE_LABELS = {
  for: 'בעד עריכת אסיפת חברים שלא מן המניין',
  against: 'מתנגד לקיום אסיפת חברים שלא מן המניין',
};

fs.mkdirSync(SIGNATURES_DIR, { recursive: true });

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function sanitizeFilename(value) {
  return String(value || "anonymous")
    .replace(/[^\u0590-\u05FFa-zA-Z0-9-_]+/g, "_")
    .slice(0, 40);
}

async function ensureWorkbook() {
  const workbook = new ExcelJS.Workbook();

  if (fs.existsSync(EXCEL_PATH)) {
    await workbook.xlsx.readFile(EXCEL_PATH);
    return workbook;
  }

  const sheet = workbook.addWorksheet("הצבעות", {
    views: [{ rightToLeft: true }],
  });

  sheet.columns = [
    { header: "תאריך ושעה", key: "timestamp", width: 22 },
    { header: "הצבעה", key: "vote", width: 48 },
    { header: "שם ושם משפחה", key: "fullName", width: 24 },
    { header: "טלפון", key: "phone", width: 16 },
    { header: 'דוא"ל', key: "email", width: 28 },
    { header: "קובץ חתימה", key: "signatureFile", width: 36 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF407088" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 22;

  await workbook.xlsx.writeFile(EXCEL_PATH);
  return workbook;
}

app.post("/api/vote", async (req, res) => {
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

    const match = String(signatureDataUrl).match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ ok: false, error: "פורמט החתימה אינו תקין." });
    }

    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const timestamp = new Date();
    const stamp = timestamp
      .toISOString()
      .replace(/[:.]/g, "-");
    const signatureFile = `${stamp}_${sanitizeFilename(fullName)}.${ext}`;
    const signaturePath = path.join(SIGNATURES_DIR, signatureFile);

    fs.writeFileSync(signaturePath, Buffer.from(match[2], "base64"));

    const workbook = await ensureWorkbook();
    const sheet = workbook.getWorksheet("הצבעות") || workbook.worksheets[0];

    sheet.addRow({
      timestamp: timestamp.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }),
      vote: VOTE_LABELS[vote],
      fullName: String(fullName).trim(),
      phone: String(phone).trim(),
      email: String(email).trim(),
      signatureFile,
    });

    await workbook.xlsx.writeFile(EXCEL_PATH);

    return res.json({ ok: true });
  } catch (error) {
    console.error("Vote save failed:", error);
    return res.status(500).json({ ok: false, error: "שמירת ההצבעה נכשלה. נסו שוב." });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/export", (req, res) => {
  const secret = process.env.EXPORT_SECRET;
  if (secret && req.query.key !== secret) {
    return res.status(401).json({ ok: false, error: "אין הרשאה." });
  }
  if (!fs.existsSync(EXCEL_PATH)) {
    return res.status(404).json({ ok: false, error: "עדיין אין הצבעות." });
  }
  res.download(EXCEL_PATH, "votes.xlsx");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`שרת ההצבעה פועל בכתובת http://localhost:${PORT}`);
  console.log(`קובץ האקסל יישמר ב: ${EXCEL_PATH}`);
});
