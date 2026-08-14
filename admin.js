const API_URL = "https://script.google.com/macros/s/AKfycbxJg_f3ZWFAdLQD3KHT0bS1FxXbu6HiPCkRXgDPxg_zDzksXrxL3WD9rNkWTx_zp8oI/exec";

const adminState = {
  groups: [],
  results: [],
  currentGroup: null,
};

document.addEventListener("DOMContentLoaded", () => {
  const groupTabs = document.getElementById("groupTabs");
  if (groupTabs) {
    initAdminPage();
  }
});

function initAdminPage() {
  setStatus("Loading tournament data...", "info");
  loadAdminData(true);
  setInterval(() => {
    loadAdminData(false);
  }, 10000);
}

async function loadAdminData(showLoading) {
  if (showLoading) {
    setStatus("Loading tournament data...", "info");
  }

  try {
    const [groupsResponse, resultsResponse] = await Promise.all([
      fetch(`${API_URL}?action=groups`, { cache: "no-store" }),
      fetch(`${API_URL}?action=results`, { cache: "no-store" }),
    ]);

    if (!groupsResponse.ok || !resultsResponse.ok) {
      throw new Error("Google Apps Script is unavailable.");
    }

    const groupsPayload = await groupsResponse.json();
    const resultsPayload = await resultsResponse.json();

    if (!groupsPayload.success || !resultsPayload.success) {
      throw new Error("Apps Script returned an invalid response.");
    }

    const nextGroups = Array.isArray(groupsPayload.groups) ? groupsPayload.groups : [];
    const nextResults = Array.isArray(resultsPayload.results) ? resultsPayload.results : [];

    if (!nextGroups.length) {
      adminState.groups = [];
      adminState.results = nextResults;
      renderAdminPage();
      setStatus("Unable to load tournament data. Retrying...", "warning");
      return;
    }

    adminState.groups = nextGroups;
    adminState.results = nextResults;

    if (!adminState.currentGroup || !nextGroups.some((group) => String(group.group) === String(adminState.currentGroup))) {
      adminState.currentGroup = String(nextGroups[0].group);
    }

    renderAdminPage();
    setStatus("", "info");
  } catch (error) {
    const hasExistingData = adminState.groups.length > 0 || adminState.results.length > 0;
    setStatus(
      hasExistingData
        ? "Connection temporarily unavailable. Retrying..."
        : "Unable to load tournament data. Retrying...",
      "warning"
    );
  }
}

function renderAdminPage() {
  const groupTabs = document.getElementById("groupTabs");
  const groupResultsPanel = document.getElementById("groupResultsPanel");

  if (!groupTabs || !groupResultsPanel) {
    return;
  }

  const groups = adminState.groups;
  if (!groups.length) {
    groupTabs.innerHTML = "";
    groupResultsPanel.innerHTML = '<div class="empty-state">No groups available yet.</div>';
    return;
  }

  groupTabs.innerHTML = groups
    .map((group) => {
      const selected = String(group.group) === String(adminState.currentGroup) ? "active" : "";
      return `
        <button type="button" class="group-tab ${selected}" data-group="${escapeHtml(group.group)}">
          GROUP ${escapeHtml(group.group)}
        </button>
      `;
    })
    .join("");

  groupTabs.querySelectorAll(".group-tab").forEach((button) => {
    button.addEventListener("click", () => {
      adminState.currentGroup = button.dataset.group;
      renderAdminPage();
    });
  });

  const selectedGroup = groups.find((group) => String(group.group) === String(adminState.currentGroup));
  const players = selectedGroup && Array.isArray(selectedGroup.players) ? selectedGroup.players : [];

  if (!selectedGroup || !players.length) {
    groupResultsPanel.innerHTML = '<div class="empty-state">No players found for this group.</div>';
    return;
  }

  const matches = generateMatches(players);
  const markup = matches
    .map((match) => {
      const existingResult = findResultForMatch(adminState.results, String(selectedGroup.group), match.player1, match.player2);
      const aligned = existingResult ? alignResultToMatch(match, existingResult) : null;
      const completed = !!(existingResult && aligned);

      const score1Value = completed ? aligned.score1 : "";
      const score2Value = completed ? aligned.score2 : "";
      const stateLabel = completed ? "COMPLETED" : "PENDING";
      const stateClass = completed ? "completed" : "pending";

      return `
        <div class="match-card">
          <div class="match-header">
            <div class="match-player">${escapeHtml(match.player1)}</div>
            <div class="score-stack">
              <input
                class="score-input"
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                value="${score1Value}"
                aria-label="${escapeHtml(match.player1)} score"
                data-group="${escapeHtml(selectedGroup.group)}"
                data-player1="${escapeHtml(match.player1)}"
                data-player2="${escapeHtml(match.player2)}"
                data-score-slot="1"
              />
              <span class="score-divider">—</span>
              <input
                class="score-input"
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                value="${score2Value}"
                aria-label="${escapeHtml(match.player2)} score"
                data-group="${escapeHtml(selectedGroup.group)}"
                data-player1="${escapeHtml(match.player1)}"
                data-player2="${escapeHtml(match.player2)}"
                data-score-slot="2"
              />
            </div>
            <div class="match-player right">${escapeHtml(match.player2)}</div>
          </div>

          <div class="match-footer">
            <span class="match-state ${stateClass}">${stateLabel}</span>
            <button type="button" class="save-button" data-group="${escapeHtml(selectedGroup.group)}" data-player1="${escapeHtml(match.player1)}" data-player2="${escapeHtml(match.player2)}">SAVE</button>
          </div>
        </div>
      `;
    })
    .join("");

  groupResultsPanel.innerHTML = `
    <h2 class="group-title">GROUP ${escapeHtml(selectedGroup.group)}</h2>
    ${markup}
  `;

  groupResultsPanel.querySelectorAll(".save-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const group = button.dataset.group;
      const player1 = button.dataset.player1;
      const player2 = button.dataset.player2;

      const pairInputs = groupResultsPanel.querySelectorAll(
        `.score-input[data-group="${CSS.escape(group)}"][data-player1="${CSS.escape(player1)}"][data-player2="${CSS.escape(player2)}"]`
      );

      const values = Array.from(pairInputs).reduce((accumulator, input) => {
        accumulator[input.dataset.scoreSlot] = input.value;
        return accumulator;
      }, {});

      const result = await saveResult(group, player1, player2, values["1"], values["2"]);
      if (result.success) {
        setStatus("✓ Result saved", "success");
        await loadAdminData(false);
      } else {
        setStatus("✕ Could not save result. Please try again.", "error");
      }
    });
  });

  sanitizeScoreInputs();
}

function sanitizeScoreInputs() {
  const inputs = document.querySelectorAll(".score-input");
  inputs.forEach((input) => {
    input.addEventListener("input", () => {
      const cleanedValue = input.value.replace(/[^0-9]/g, "");
      input.value = cleanedValue;
      if (input.value.length > 0) {
        const numericValue = Number(input.value);
        if (numericValue > 10) {
          input.value = "10";
        }
      }
    });
  });
}

async function saveResult(group, player1, player2, score1, score2) {
  const validated1 = validateScore(score1);
  const validated2 = validateScore(score2);

  if (!validated1.isValid || !validated2.isValid) {
    return {
      success: false,
      error: "Invalid scores"
    };
  }

  try {
    const formData = new URLSearchParams();

    formData.append("action", "updateResult");
    formData.append("group", group);
    formData.append("player1", player1);
    formData.append("player2", player2);
    formData.append("score1", validated1.value);
    formData.append("score2", validated2.value);

    const response = await fetch(API_URL, {
      method: "POST",
      body: formData
    });

    const text = await response.text();

    console.log("Apps Script response:", text);

    const payload = JSON.parse(text);

    if (!response.ok || !payload.success) {
      return {
        success: false,
        error: payload.error || "Unable to save result"
      };
    }

    return {
      success: true
    };

  } catch (error) {
    console.error("Save error:", error);

    return {
      success: false,
      error: error.message
    };
  }
}

function validateScore(value) {
  if (value === "" || value === null || value === undefined) {
    return { isValid: false, value: null };
  }

  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 0) {
    return { isValid: false, value: null };
  }

  return {
    isValid: true,
    value: numberValue
  };
}

function normalizeMatchKey(group, player1, player2) {
  const normalizedGroup = String(group || "").trim();
  const left = String(player1 || "").trim();
  const right = String(player2 || "").trim();
  const ordered = [left, right].sort((a, b) => a.localeCompare(b));
  return `${normalizedGroup}|${ordered[0]}|${ordered[1]}`;
}

function findResultForMatch(results, group, player1, player2) {
  const targetKey = normalizeMatchKey(group, player1, player2);

  return results.find((result) => {
    const rowGroup = String(result.group || "").trim();
    const rowPlayer1 = String(result.player1 || "").trim();
    const rowPlayer2 = String(result.player2 || "").trim();

    return rowGroup === String(group).trim() && normalizeMatchKey(rowGroup, rowPlayer1, rowPlayer2) === targetKey;
  });
}

function alignResultToMatch(match, result) {
  const resultPlayer1 = String(result.player1 || "").trim();
  const resultPlayer2 = String(result.player2 || "").trim();
  const matchPlayer1 = String(match.player1 || "").trim();
  const matchPlayer2 = String(match.player2 || "").trim();

  const score1 = Number(result.score1 ?? result["Score 1"] ?? 0);
  const score2 = Number(result.score2 ?? result["Score 2"] ?? 0);

  if (resultPlayer1 === matchPlayer1 && resultPlayer2 === matchPlayer2) {
    return { score1, score2 };
  }

  if (resultPlayer1 === matchPlayer2 && resultPlayer2 === matchPlayer1) {
    return { score1: score2, score2: score1 };
  }

  return null;
}

function generateMatches(players) {
  const list = [];
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      list.push({
        player1: players[i],
        player2: players[j],
      });
    }
  }
  return list;
}

function setStatus(message, type) {
  const statusElement = document.getElementById("adminStatus");
  if (!statusElement) {
    return;
  }

  if (!message) {
    statusElement.classList.remove("visible", "success", "error", "warning");
    statusElement.textContent = "";
    return;
  }

  statusElement.textContent = message;
  statusElement.classList.remove("success", "error", "warning");
  statusElement.classList.add(type || "info", "visible");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
