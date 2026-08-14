function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action).toLowerCase() : "";

  try {
    if (action === "groups") {
      return jsonResponse({ success: true, groups: readGroups() });
    }

    if (action === "results") {
      return jsonResponse({ success: true, results: readResults() });
    }

    return jsonResponse({
      success: false,
      error: "Unknown action. Supported actions: groups, results",
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error && error.message ? error.message : "Unknown server error",
    });
  }
}

function doPost(e) {
  try {
    const payload = parseRequestPayload(e);
    const action = payload.action ? String(payload.action).toLowerCase() : "";

    if (action === "updateresult") {
      return jsonResponse(saveResult(payload));
    }

    if (action === "clearresult") {
      return jsonResponse(clearResult(payload));
    }

    return jsonResponse({ success: false, error: "Unknown action. Supported actions: updateResult, clearResult" });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error && error.message ? error.message : "Unknown server error",
    });
  }
}

function parseRequestPayload(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  const raw = e.postData.contents;

  try {
    return JSON.parse(raw);
  } catch (error) {
    const params = {};
    raw.split("&").forEach((pair) => {
      if (!pair) return;
      const index = pair.indexOf("=");
      const key = index === -1 ? pair : pair.slice(0, index);
      const value = index === -1 ? "" : decodeURIComponent(pair.slice(index + 1));
      params[key] = value;
    });
    return params;
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function readGroups() {
  const sheet = getOrCreateSheet("Groups");
  const values = sheet.getDataRange().getValues();

  if (!values.length) {
    return [];
  }

  const headerRow = values[0];
  const indexMap = getGroupHeaderIndexes(headerRow);

  const groups = [];

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex] || [];
    const groupValue = safeTrim(row[indexMap.group]);

    if (!groupValue) {
      continue;
    }

    const players = [
      safeTrim(row[indexMap.player1]),
      safeTrim(row[indexMap.player2]),
      safeTrim(row[indexMap.player3]),
      safeTrim(row[indexMap.player4]),
    ].filter(Boolean);

    if (!players.length) {
      continue;
    }

    groups.push({
      group: groupValue,
      players: players,
    });
  }

  return groups;
}

function readResults() {
  const sheet = getOrCreateSheet("Results");
  const values = sheet.getDataRange().getValues();

  if (!values.length) {
    return [];
  }

  const headerRow = values[0] || [];
  const indexMap = getResultHeaderIndexes(headerRow);

  const results = [];

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex] || [];
    const groupValue = safeTrim(row[indexMap.group]);
    const player1Value = safeTrim(row[indexMap.player1]);
    const player2Value = safeTrim(row[indexMap.player2]);

    if (!groupValue && !player1Value && !player2Value) {
      continue;
    }

    const score1 = normalizeScoreValue(row[indexMap.score1]);
    const score2 = normalizeScoreValue(row[indexMap.score2]);

    if (player1Value && player2Value) {
      results.push({
        group: groupValue,
        player1: player1Value,
        score1: score1,
        score2: score2,
        player2: player2Value,
      });
    }
  }

  return results;
}

function saveResult(payload) {
  const groupValue = safeTrim(payload.group);
  const player1Value = safeTrim(payload.player1);
  const player2Value = safeTrim(payload.player2);

  if (!groupValue || !player1Value || !player2Value) {
    return { success: false, error: "Missing match information." };
  }

  const score1Result = validateScore(payload.score1);
  const score2Result = validateScore(payload.score2);

  if (!score1Result.valid || !score2Result.valid) {
    return { success: false, error: "Scores must be valid integers: 0, 1, 2, 3, or 10." };
  }

  const sheet = getOrCreateSheet("Results");
  const values = sheet.getDataRange().getValues();
  const headerRow = values.length ? values[0] : [];
  const indexMap = getResultHeaderIndexes(headerRow);

  if (!headerRow.length) {
    setResultHeaders(sheet);
    return saveResult(payload);
  }

  const matchKey = getMatchKey(groupValue, player1Value, player2Value);
  let rowIndex = -1;

  for (let i = 1; i < values.length; i += 1) {
    const row = values[i] || [];
    const rowGroup = safeTrim(row[indexMap.group]);
    const rowPlayer1 = safeTrim(row[indexMap.player1]);
    const rowPlayer2 = safeTrim(row[indexMap.player2]);

    if (!rowGroup && !rowPlayer1 && !rowPlayer2) {
      continue;
    }

    if (getMatchKey(rowGroup, rowPlayer1, rowPlayer2) === matchKey) {
      rowIndex = i + 1;
      break;
    }
  }

  const rowData = [
    groupValue,
    player1Value,
    score1Result.value,
    score2Result.value,
    player2Value,
  ];

  if (rowIndex === -1) {
    sheet.appendRow(rowData);
  } else {
    const range = sheet.getRange(rowIndex, 1, 1, rowData.length);
    range.setValues([rowData]);
  }

  return { success: true };
}

function clearResult(payload) {
  const groupValue = safeTrim(payload.group);
  const player1Value = safeTrim(payload.player1);
  const player2Value = safeTrim(payload.player2);

  if (!groupValue || !player1Value || !player2Value) {
    return { success: false, error: "Missing match information." };
  }

  const sheet = getOrCreateSheet("Results");
  const values = sheet.getDataRange().getValues();
  const headerRow = values.length ? values[0] : [];
  const indexMap = getResultHeaderIndexes(headerRow);

  if (!headerRow.length) {
    setResultHeaders(sheet);
    return { success: true };
  }

  const matchKey = getMatchKey(groupValue, player1Value, player2Value);
  let rowIndex = -1;

  for (let i = 1; i < values.length; i += 1) {
    const row = values[i] || [];
    const rowGroup = safeTrim(row[indexMap.group]);
    const rowPlayer1 = safeTrim(row[indexMap.player1]);
    const rowPlayer2 = safeTrim(row[indexMap.player2]);

    if (!rowGroup && !rowPlayer1 && !rowPlayer2) {
      continue;
    }

    if (getMatchKey(rowGroup, rowPlayer1, rowPlayer2) === matchKey) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) {
    return { success: true };
  }

  const clearRange = sheet.getRange(rowIndex, 1, 1, 5);
  const currentValues = clearRange.getValues()[0];
  currentValues[0] = groupValue;
  currentValues[1] = player1Value;
  currentValues[2] = "";
  currentValues[3] = "";
  currentValues[4] = player2Value;
  clearRange.setValues([currentValues]);

  return { success: true };
}

function validateScore(value) {
  const score = value;
  if (score === "" || score === null || score === undefined) {
    return { valid: false, value: null };
  }

  const numeric = Number(score);
  const allowed = [0, 1, 2, 3, 10];

  if (!Number.isInteger(numeric) || !allowed.includes(numeric)) {
    return { valid: false, value: null };
  }

  return { valid: true, value: numeric };
}

function getOrCreateSheet(sheetName) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  if (sheetName === "Results" && !sheet.getDataRange().getValues().length) {
    setResultHeaders(sheet);
  }

  return sheet;
}

function setResultHeaders(sheet) {
  sheet.getRange(1, 1, 1, 5).setValues([["Group", "Player 1", "Score 1", "Score 2", "Player 2"]]);
}

function getGroupHeaderIndexes(headerRow) {
  const row = (headerRow || []).map((cell) => String(cell || "").trim());
  return {
    group: row.indexOf("Group"),
    player1: row.indexOf("Player 1"),
    player2: row.indexOf("Player 2"),
    player3: row.indexOf("Player 3"),
    player4: row.indexOf("Player 4"),
  };
}

function getResultHeaderIndexes(headerRow) {
  const row = (headerRow || []).map((cell) => String(cell || "").trim());
  return {
    group: row.indexOf("Group"),
    player1: row.indexOf("Player 1"),
    score1: row.indexOf("Score 1"),
    score2: row.indexOf("Score 2"),
    player2: row.indexOf("Player 2"),
  };
}

function normalizeScoreValue(value) {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : "";
}

function getMatchKey(groupValue, player1Value, player2Value) {
  const group = safeTrim(groupValue);
  const player1 = safeTrim(player1Value);
  const player2 = safeTrim(player2Value);
  const ordered = [player1, player2].sort((a, b) => a.localeCompare(b));
  return `${group}|${ordered[0]}|${ordered[1]}`;
}

function safeTrim(value) {
  return (value === null || value === undefined) ? "" : String(value).trim();
}
