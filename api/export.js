const ExcelJS = require("exceljs");
const { readVotes } = require("../lib/votesStore");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const secret = process.env.EXPORT_SECRET;
    if (secret && req.query.key !== secret) {
      return res.status(401).json({ ok: false, error: "אין הרשאה." });
    }

    const votes = await readVotes();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("הצבעות", {
      views: [{ rightToLeft: true }],
    });

    sheet.columns = [
      { header: "תאריך ושעה", key: "timestamp", width: 22 },
      { header: "הצבעה", key: "vote", width: 48 },
      { header: "שם ושם משפחה", key: "fullName", width: 24 },
      { header: "טלפון", key: "phone", width: 16 },
      { header: 'דוא"ל', key: "email", width: 28 },
      { header: "חתימה נשמרה", key: "signed", width: 14 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF407088" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    for (const item of votes) {
      sheet.addRow({
        timestamp: item.timestamp,
        vote: item.vote,
        fullName: item.fullName,
        phone: item.phone,
        email: item.email,
        signed: item.signatureDataUrl ? "כן" : "לא",
      });
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="votes.xlsx"');
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("Export failed:", error);
    return res.status(500).json({ ok: false, error: "יצוא האקסל נכשל." });
  }
};
