/**
 * DragonBox Adventure — Google Sheets logger
 *
 * SETUP (teacher / admin):
 * 1. Create a new Google Sheet.
 * 2. Extensions → Apps Script → paste this file → Save.
 * 3. Run setupSheet once (authorize when prompted).
 * 4. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the Web App URL into sheets-config.js as DRAGONBOX_SHEETS_URL.
 */

const SHEET_NAME = "DragonBox Results";

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Timestamp",
      "Player",
      "Score",
      "Puzzles Solved",
      "Session Details",
    ]);
    sheet.getRange(1, 1, 1, 5).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

function appendResult_(params) {
  setupSheet();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  sheet.appendRow([
    new Date(),
    params.player || "Anonymous",
    Number(params.score) || 0,
    Number(params.solved) || 0,
    params.details || "",
  ]);
  return { ok: true };
}

function doGet(e) {
  try {
    const result = appendResult_(e.parameter || {});
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
      ContentService.MimeType.JSON
    );
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const result = appendResult_(body);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
      ContentService.MimeType.JSON
    );
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
