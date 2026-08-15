const API_URL =
  "https://script.google.com/macros/s/AKfycbxJg_f3ZWFAdLQD3KHT0bS1FxXbu6HiPCkRXgDPxg_zDzksXrxL3WD9rNkWTx_zp8oI/exec";

const adminState = {
  groups: [],
  results: [],
  knockout: [],
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


// ============================================================
// LOAD DATA
// ============================================================

async function loadAdminData(showLoading) {
  if (showLoading) {
    setStatus("Loading tournament data...", "info");
  }

  try {
    const [
      groupsResponse,
      resultsResponse,
      knockoutResponse,
    ] = await Promise.all([
      fetch(`${API_URL}?action=groups`, {
        cache: "no-store",
      }),

      fetch(`${API_URL}?action=results`, {
        cache: "no-store",
      }),

      fetch(`${API_URL}?action=knockout`, {
        cache: "no-store",
      }),
    ]);

    if (
      !groupsResponse.ok ||
      !resultsResponse.ok ||
      !knockoutResponse.ok
    ) {
      throw new Error(
        "Google Apps Script is unavailable."
      );
    }

    const groupsPayload =
      await groupsResponse.json();

    const resultsPayload =
      await resultsResponse.json();

    const knockoutPayload =
      await knockoutResponse.json();

    if (
      !groupsPayload.success ||
      !resultsPayload.success ||
      !knockoutPayload.success
    ) {
      throw new Error(
        "Apps Script returned an invalid response."
      );
    }

    const nextGroups = Array.isArray(
      groupsPayload.groups
    )
      ? groupsPayload.groups
      : [];

    const nextResults = Array.isArray(
      resultsPayload.results
    )
      ? resultsPayload.results
      : [];

    const nextKnockout = Array.isArray(
      knockoutPayload.knockout
    )
      ? knockoutPayload.knockout
      : [];

    adminState.groups = nextGroups;
    adminState.results = nextResults;
    adminState.knockout = nextKnockout;

    if (!adminState.currentGroup && nextGroups.length) {
      adminState.currentGroup =
        String(nextGroups[0].group);
    }

    if (
      adminState.currentGroup &&
      !nextGroups.some(
        (group) =>
          String(group.group) ===
          String(adminState.currentGroup)
      )
    ) {
      adminState.currentGroup =
        String(nextGroups[0]?.group || "");
    }

    renderAdminPage();
    renderKnockoutAdmin();

    setStatus("", "info");

  } catch (error) {
    console.error(
      "Tournament data error:",
      error
    );

    const hasExistingData =
      adminState.groups.length > 0 ||
      adminState.results.length > 0 ||
      adminState.knockout.length > 0;

    setStatus(
      hasExistingData
        ? "Connection temporarily unavailable. Retrying..."
        : "Unable to load tournament data. Retrying...",
      "warning"
    );
  }
}


// ============================================================
// GROUP STAGE ADMIN
// ============================================================

function renderAdminPage() {
  const groupTabs =
    document.getElementById("groupTabs");

  const groupResultsPanel =
    document.getElementById(
      "groupResultsPanel"
    );

  if (!groupTabs || !groupResultsPanel) {
    return;
  }

  const groups = adminState.groups;

  if (!groups.length) {
    groupTabs.innerHTML = "";

    groupResultsPanel.innerHTML =
      '<div class="empty-state">No groups available yet.</div>';

    return;
  }

  groupTabs.innerHTML = groups
    .map((group) => {
      const selected =
        String(group.group) ===
        String(adminState.currentGroup)
          ? "active"
          : "";

      return `
        <button
          type="button"
          class="group-tab ${selected}"
          data-group="${escapeHtml(group.group)}"
        >
          GROUP ${escapeHtml(group.group)}
        </button>
      `;
    })
    .join("");

  groupTabs
    .querySelectorAll(".group-tab")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          adminState.currentGroup =
            button.dataset.group;

          renderAdminPage();
        }
      );
    });

  const selectedGroup = groups.find(
    (group) =>
      String(group.group) ===
      String(adminState.currentGroup)
  );

  const players =
    selectedGroup &&
    Array.isArray(selectedGroup.players)
      ? selectedGroup.players
      : [];

  if (!selectedGroup || !players.length) {
    groupResultsPanel.innerHTML =
      '<div class="empty-state">No players found for this group.</div>';

    return;
  }

  const matches = generateMatches(players);

  const markup = matches
    .map((match) => {
      const existingResult =
        findResultForMatch(
          adminState.results,
          String(selectedGroup.group),
          match.player1,
          match.player2
        );

      const aligned =
        existingResult
          ? alignResultToMatch(
              match,
              existingResult
            )
          : null;

      const completed =
        !!(existingResult && aligned);

      const score1Value =
        completed
          ? aligned.score1
          : "";

      const score2Value =
        completed
          ? aligned.score2
          : "";

      const stateLabel =
        completed
          ? "COMPLETED"
          : "PENDING";

      const stateClass =
        completed
          ? "completed"
          : "pending";

      return `
        <div class="match-card">

          <div class="match-header">

            <div class="match-player">
              ${escapeHtml(match.player1)}
            </div>

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

              <span class="score-divider">
                —
              </span>

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

            <div class="match-player right">
              ${escapeHtml(match.player2)}
            </div>

          </div>

          <div class="match-footer">

            <span class="match-state ${stateClass}">
              ${stateLabel}
            </span>

            <button
              type="button"
              class="save-button"
              data-group="${escapeHtml(selectedGroup.group)}"
              data-player1="${escapeHtml(match.player1)}"
              data-player2="${escapeHtml(match.player2)}"
            >
              SAVE
            </button>

          </div>

        </div>
      `;
    })
    .join("");

  groupResultsPanel.innerHTML = `
    <h2 class="group-title">
      GROUP ${escapeHtml(selectedGroup.group)}
    </h2>

    ${markup}
  `;

  groupResultsPanel
    .querySelectorAll(".save-button")
    .forEach((button) => {

      button.addEventListener(
        "click",
        async () => {

          const group =
            button.dataset.group;

          const player1 =
            button.dataset.player1;

          const player2 =
            button.dataset.player2;

          const pairInputs =
            groupResultsPanel.querySelectorAll(
              `.score-input[data-group="${CSS.escape(group)}"][data-player1="${CSS.escape(player1)}"][data-player2="${CSS.escape(player2)}"]`
            );

          const values =
            Array.from(pairInputs).reduce(
              (accumulator, input) => {

                accumulator[
                  input.dataset.scoreSlot
                ] = input.value;

                return accumulator;

              },
              {}
            );

          const result =
            await saveResult(
              group,
              player1,
              player2,
              values["1"],
              values["2"]
            );

          if (result.success) {

            setStatus(
              "✓ Result saved",
              "success"
            );

            await loadAdminData(false);

          } else {

            setStatus(
              "✕ Could not save result. Please try again.",
              "error"
            );
          }
        }
      );
    });

  sanitizeScoreInputs();
}


// ============================================================
// KNOCKOUT ADMIN
// ============================================================

function renderKnockoutAdmin() {

  let container =
    document.getElementById(
      "knockoutAdminContainer"
    );

  /*
   * If admin.html doesn't already contain
   * the container, create it automatically.
   */

  if (!container) {

    const groupResultsPanel =
      document.getElementById(
        "groupResultsPanel"
      );

    if (!groupResultsPanel) {
      return;
    }

    container =
      document.createElement("section");

    container.id =
      "knockoutAdminContainer";

    container.className =
      "knockout-admin-section";

    groupResultsPanel.parentNode.insertBefore(
      container,
      groupResultsPanel.nextSibling
    );
  }

  const knockout =
    adminState.knockout || [];

  if (!knockout.length) {

    container.innerHTML = `
      <div class="empty-state">
        No knockout matches available.
      </div>
    `;

    return;
  }

  const order = [
    "QF1",
    "QF2",
    "QF3",
    "QF4",
    "SF1",
    "SF2",
    "FINAL",
  ];

  const matches = order
    .map((name) =>
      knockout.find(
        (match) =>
          String(match.match)
            .trim()
            .toUpperCase() === name
      )
    )
    .filter(Boolean);

  container.innerHTML = `
    <div class="knockout-admin">

      <div class="knockout-admin-header">
        <p class="eyebrow">
          TOURNAMENT
        </p>

        <h2>
          KNOCKOUT STAGE
        </h2>

        <p class="knockout-description">
          Enter the qualified players and match scores.
        </p>
      </div>

      ${renderKnockoutRound(
        "QUARTERFINALS",
        matches.filter((m) =>
          ["QF1", "QF2", "QF3", "QF4"]
            .includes(
              String(m.match).trim()
            )
        )
      )}

      ${renderKnockoutRound(
        "SEMIFINALS",
        matches.filter((m) =>
          ["SF1", "SF2"].includes(
            String(m.match).trim()
          )
        )
      )}

      ${renderKnockoutRound(
        "FINAL",
        matches.filter(
          (m) =>
            String(m.match)
              .trim()
              .toUpperCase() === "FINAL"
        )
      )}

    </div>
  `;

  attachKnockoutListeners();
}


function renderKnockoutRound(
  title,
  matches
) {

  if (!matches.length) {
    return "";
  }

  return `
    <div class="knockout-round">

      <h3>
        ${escapeHtml(title)}
      </h3>

      <div class="knockout-match-list">

        ${matches
          .map(
            (match) =>
              renderKnockoutAdminMatch(
                match
              )
          )
          .join("")}

      </div>

    </div>
  `;
}


function renderKnockoutAdminMatch(
  match
) {

  const player1 =
    String(match.player1 || "");

  const player2 =
    String(match.player2 || "");

  const score1 =
    match.score1 === ""
      ? ""
      : match.score1;

  const score2 =
    match.score2 === ""
      ? ""
      : match.score2;

  const completed =
    player1 &&
    player2 &&
    score1 !== "" &&
    score2 !== "";

  return `
    <div
      class="knockout-admin-match"
      data-match="${escapeHtml(match.match)}"
    >

      <div class="knockout-match-title">
        ${escapeHtml(match.match)}
      </div>

      <div class="knockout-input-row">

        <input
          type="text"
          class="knockout-player-input"
          placeholder="Player 1"
          value="${escapeHtml(player1)}"
          data-field="player1"
        />

        <div class="knockout-score-inputs">

          <input
            type="number"
            class="knockout-score-input"
            min="0"
            step="1"
            inputmode="numeric"
            placeholder="0"
            value="${score1}"
            data-field="score1"
          />

          <span>—</span>

          <input
            type="number"
            class="knockout-score-input"
            min="0"
            step="1"
            inputmode="numeric"
            placeholder="0"
            value="${score2}"
            data-field="score2"
          />

        </div>

        <input
          type="text"
          class="knockout-player-input"
          placeholder="Player 2"
          value="${escapeHtml(player2)}"
          data-field="player2"
        />

      </div>

      <div class="knockout-match-footer">

        <span class="match-state ${
          completed
            ? "completed"
            : "pending"
        }">

          ${
            completed
              ? "COMPLETED"
              : "PENDING"
          }

        </span>

        <button
          type="button"
          class="knockout-save-button"
          data-match="${escapeHtml(match.match)}"
        >
          SAVE
        </button>

      </div>

    </div>
  `;
}


function attachKnockoutListeners() {

  const container =
    document.getElementById(
      "knockoutAdminContainer"
    );

  if (!container) {
    return;
  }

  container
    .querySelectorAll(
      ".knockout-save-button"
    )
    .forEach((button) => {

      button.addEventListener(
        "click",
        async () => {

          const matchName =
            button.dataset.match;

          const card =
            button.closest(
              ".knockout-admin-match"
            );

          if (!card) {
            return;
          }

          const player1 =
            card.querySelector(
              '[data-field="player1"]'
            ).value.trim();

          const player2 =
            card.querySelector(
              '[data-field="player2"]'
            ).value.trim();

          const score1 =
            card.querySelector(
              '[data-field="score1"]'
            ).value.trim();

          const score2 =
            card.querySelector(
              '[data-field="score2"]'
            ).value.trim();

          if (!player1 || !player2) {

            setStatus(
              "✕ Enter both player names.",
              "error"
            );

            return;
          }

          if (
            (score1 === "" &&
              score2 !== "") ||
            (score1 !== "" &&
              score2 === "")
          ) {

            setStatus(
              "✕ Enter both scores.",
              "error"
            );

            return;
          }

          button.disabled = true;
          button.textContent = "SAVING...";

          const result =
            await saveKnockout(
              matchName,
              player1,
              player2,
              score1,
              score2
            );

          button.disabled = false;
          button.textContent = "SAVE";

          if (result.success) {

            setStatus(
              `✓ ${matchName} saved`,
              "success"
            );

            await loadAdminData(false);

          } else {

            setStatus(
              `✕ ${result.error || "Could not save knockout result."}`,
              "error"
            );
          }
        }
      );
    });
}


// ============================================================
// SAVE KNOCKOUT
// ============================================================

async function saveKnockout(
  match,
  player1,
  player2,
  score1,
  score2
) {

  try {

    const formData =
      new URLSearchParams();

    formData.append(
      "action",
      "updateKnockout"
    );

    formData.append(
      "match",
      match
    );

    formData.append(
      "player1",
      player1
    );

    formData.append(
      "player2",
      player2
    );

    formData.append(
      "score1",
      score1
    );

    formData.append(
      "score2",
      score2
    );

    const response =
      await fetch(API_URL, {
        method: "POST",
        body: formData,
      });

    const text =
      await response.text();

    console.log(
      "Knockout Apps Script response:",
      text
    );

    const payload =
      JSON.parse(text);

    if (
      !response.ok ||
      !payload.success
    ) {

      return {
        success: false,
        error:
          payload.error ||
          "Unable to save knockout result.",
      };
    }

    return {
      success: true,
    };

  } catch (error) {

    console.error(
      "Knockout save error:",
      error
    );

    return {
      success: false,
      error: error.message,
    };
  }
}


// ============================================================
// GROUP RESULT SAVE
// ============================================================

async function saveResult(
  group,
  player1,
  player2,
  score1,
  score2
) {

  const validated1 =
    validateScore(score1);

  const validated2 =
    validateScore(score2);

  if (
    !validated1.isValid ||
    !validated2.isValid
  ) {

    return {
      success: false,
      error: "Invalid scores",
    };
  }

  try {

    const formData =
      new URLSearchParams();

    formData.append(
      "action",
      "updateResult"
    );

    formData.append(
      "group",
      group
    );

    formData.append(
      "player1",
      player1
    );

    formData.append(
      "player2",
      player2
    );

    formData.append(
      "score1",
      validated1.value
    );

    formData.append(
      "score2",
      validated2.value
    );

    const response =
      await fetch(API_URL, {
        method: "POST",
        body: formData,
      });

    const text =
      await response.text();

    console.log(
      "Apps Script response:",
      text
    );

    const payload =
      JSON.parse(text);

    if (
      !response.ok ||
      !payload.success
    ) {

      return {
        success: false,
        error:
          payload.error ||
          "Unable to save result",
      };
    }

    return {
      success: true,
    };

  } catch (error) {

    console.error(
      "Save error:",
      error
    );

    return {
      success: false,
      error: error.message,
    };
  }
}


// ============================================================
// SCORE INPUT
// ============================================================

function sanitizeScoreInputs() {

  const inputs =
    document.querySelectorAll(
      ".score-input"
    );

  inputs.forEach((input) => {

    input.addEventListener(
      "input",
      () => {

        const cleanedValue =
          input.value.replace(
            /[^0-9]/g,
            ""
          );

        input.value =
          cleanedValue;

        if (input.value.length > 0) {

          const numericValue =
            Number(input.value);

          if (numericValue > 10) {
            input.value = "10";
          }
        }
      }
    );
  });
}


function validateScore(value) {

  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {

    return {
      isValid: false,
      value: null,
    };
  }

  const numberValue =
    Number(value);

  if (
    !Number.isInteger(numberValue) ||
    numberValue < 0
  ) {

    return {
      isValid: false,
      value: null,
    };
  }

  return {
    isValid: true,
    value: numberValue,
  };
}


// ============================================================
// MATCH HELPERS
// ============================================================

function normalizeMatchKey(
  group,
  player1,
  player2
) {

  const normalizedGroup =
    String(group || "").trim();

  const left =
    String(player1 || "").trim();

  const right =
    String(player2 || "").trim();

  const ordered =
    [left, right].sort(
      (a, b) =>
        a.localeCompare(b)
    );

  return `${normalizedGroup}|${ordered[0]}|${ordered[1]}`;
}


function findResultForMatch(
  results,
  group,
  player1,
  player2
) {

  const targetKey =
    normalizeMatchKey(
      group,
      player1,
      player2
    );

  return results.find(
    (result) => {

      const rowGroup =
        String(
          result.group || ""
        ).trim();

      const rowPlayer1 =
        String(
          result.player1 || ""
        ).trim();

      const rowPlayer2 =
        String(
          result.player2 || ""
        ).trim();

      return (
        rowGroup ===
          String(group).trim() &&
        normalizeMatchKey(
          rowGroup,
          rowPlayer1,
          rowPlayer2
        ) === targetKey
      );
    }
  );
}


function alignResultToMatch(
  match,
  result
) {

  const resultPlayer1 =
    String(
      result.player1 || ""
    ).trim();

  const resultPlayer2 =
    String(
      result.player2 || ""
    ).trim();

  const matchPlayer1 =
    String(
      match.player1 || ""
    ).trim();

  const matchPlayer2 =
    String(
      match.player2 || ""
    ).trim();

  const score1 =
    Number(
      result.score1 ??
        result["Score 1"] ??
        0
    );

  const score2 =
    Number(
      result.score2 ??
        result["Score 2"] ??
        0
    );

  if (
    resultPlayer1 === matchPlayer1 &&
    resultPlayer2 === matchPlayer2
  ) {

    return {
      score1,
      score2,
    };
  }

  if (
    resultPlayer1 === matchPlayer2 &&
    resultPlayer2 === matchPlayer1
  ) {

    return {
      score1: score2,
      score2: score1,
    };
  }

  return null;
}


function generateMatches(players) {

  const list = [];

  for (
    let i = 0;
    i < players.length;
    i += 1
  ) {

    for (
      let j = i + 1;
      j < players.length;
      j += 1
    ) {

      list.push({
        player1: players[i],
        player2: players[j],
      });
    }
  }

  return list;
}


// ============================================================
// STATUS
// ============================================================

function setStatus(
  message,
  type
) {

  const statusElement =
    document.getElementById(
      "adminStatus"
    );

  if (!statusElement) {
    return;
  }

  if (!message) {

    statusElement.classList.remove(
      "visible",
      "success",
      "error",
      "warning"
    );

    statusElement.textContent = "";

    return;
  }

  statusElement.textContent =
    message;

  statusElement.classList.remove(
    "success",
    "error",
    "warning"
  );

  statusElement.classList.add(
    type || "info",
    "visible"
  );
}


// ============================================================
// HTML ESCAPING
// ============================================================

function escapeHtml(value) {

  return String(value)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /\"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}