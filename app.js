const API_URL = "https://script.google.com/macros/s/AKfycbxJg_f3ZWFAdLQD3KHT0bS1FxXbu6HiPCkRXgDPxg_zDzksXrxL3WD9rNkWTx_zp8oI/exec";
const REFRESH_INTERVAL = 10000;
const TOTAL_MATCHES = 48;

const publicState = {
  groups: [],
  results: [],
  refreshTimer: null,
};

document.addEventListener("DOMContentLoaded", () => {
  const groupsContainer = document.getElementById("groupsContainer");
  if (groupsContainer) {
    initPublicPage();
  }
});

function initPublicPage() {
  setStatus("Loading tournament data...", "info");
  loadPublicData(true);

  publicState.refreshTimer = setInterval(() => {
    loadPublicData(false);
  }, REFRESH_INTERVAL);
}

async function loadPublicData(showLoading) {
  if (showLoading) {
    setStatus("Loading tournament data...", "info");
  }

  try {
    const [groupsResponse, resultsResponse] = await Promise.all([
      fetch(`${API_URL}?action=groups`, { cache: "no-store" }),
      fetch(`${API_URL}?action=results`, { cache: "no-store" }),
    ]);

    if (!groupsResponse.ok || !resultsResponse.ok) {
      throw new Error("Failed to load tournament data.");
    }

    const groupsPayload = await groupsResponse.json();
    const resultsPayload = await resultsResponse.json();

    if (!groupsPayload.success || !resultsPayload.success) {
      throw new Error("Apps Script returned an invalid response.");
    }

    publicState.groups = Array.isArray(groupsPayload.groups) ? groupsPayload.groups : [];
    publicState.results = Array.isArray(resultsPayload.results) ? resultsPayload.results : [];

    renderPublicPage();
    setStatus("", "info");
  } catch (error) {
    const hasExistingData = publicState.groups.length > 0 || publicState.results.length > 0;
    setStatus(
      hasExistingData
        ? "Connection temporarily unavailable. Retrying..."
        : "Unable to load tournament data. Retrying...",
      "warning"
    );
  }
}

function renderPublicPage() {
  const scrollPosition = window.scrollY;
  const groupsContainer = document.getElementById("groupsContainer");
  if (!groupsContainer) {
    return;
  }

  const completedMatches = countCompletedMatches(publicState.results);
  const remainingMatches = Math.max(TOTAL_MATCHES - completedMatches, 0);
  const completionPercentage = Math.round((completedMatches / TOTAL_MATCHES) * 100);

  const progressText = document.getElementById("progressText");
  const completionText = document.getElementById("completionText");
  const progressBar = document.getElementById("progressBar");

  if (progressText) {
    progressText.textContent = `${completedMatches} / ${TOTAL_MATCHES} MATCHES COMPLETED`;
  }

  if (completionText) {
    completionText.textContent = `${completionPercentage}%`;
  }

  if (progressBar) {
    progressBar.style.width = `${completionPercentage}%`;
  }

  if (!publicState.groups.length) {
    groupsContainer.innerHTML = '<div class="empty-state">No groups available yet.</div>';
    window.scrollTo({ top: scrollPosition, behavior: "auto" });
    return;
  }

  const markup = publicState.groups
    .map((group) => {
      const players = Array.isArray(group.players) ? group.players : [];
      const generatedMatches = generateMatches(players);
      const standings = calculateStandings(players, generatedMatches, publicState.results, group.group);
      const resultsMarkup = generatedMatches
        .map((match) => {
          const result = findResultForMatch(publicState.results, group.group, match.player1, match.player2);
          const aligned = result ? alignResultToMatch(match, result) : null;

          if (!result || aligned === null) {
            return `
              <div class="result-item">
                <div class="result-line">
                  <span>${escapeHtml(match.player1)}</span>
                  <span class="result-score">—</span>
                  <span>${escapeHtml(match.player2)}</span>
                </div>
                <span class="result-status pending">Pending</span>
              </div>
            `;
          }

          return `
            <div class="result-item">
              <div class="result-line">
                <span>${escapeHtml(match.player1)}</span>
                <span class="result-score">${aligned.score1} — ${aligned.score2}</span>
                <span>${escapeHtml(match.player2)}</span>
              </div>
              <span class="result-status completed">Completed</span>
            </div>
          `;
        })
        .join("");

      return `
        <article class="group-card">
          <h2 class="group-title">GROUP ${escapeHtml(group.group)}</h2>
          <table class="standings-table" aria-label="Group standings for Group ${escapeHtml(group.group)}">
            <thead>
              <tr>
                <th>Player</th>
                <th>P</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>GF</th>
                <th>GA</th>
                <th>GD</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              ${standings
                .map(
                  (row) => `
                    <tr>
                      <td class="player-name">${escapeHtml(row.player)}</td>
                      <td>${row.P}</td>
                      <td>${row.W}</td>
                      <td>${row.D}</td>
                      <td>${row.L}</td>
                      <td>${row.GF}</td>
                      <td>${row.GA}</td>
                      <td>${row.GD}</td>
                      <td>${row.Pts}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>

          <div class="match-results">
            <div class="results-list">
              ${resultsMarkup}
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  groupsContainer.innerHTML = markup;
  window.scrollTo({ top: scrollPosition, behavior: "auto" });

  const totalRemaining = document.getElementById("progressText");
  if (totalRemaining) {
    totalRemaining.textContent = `${completedMatches} / ${TOTAL_MATCHES} MATCHES COMPLETED • ${remainingMatches} REMAINING`;
  }
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

function countCompletedMatches(results) {
  return results.filter((result) => {
    const score1 = Number(result.score1 ?? result["Score 1"] ?? NaN);
    const score2 = Number(result.score2 ?? result["Score 2"] ?? NaN);

    return Number.isInteger(score1) && Number.isInteger(score2) && score1 >= 0 && score2 >= 0;
  }).length;
}

function calculateStandings(players, matches, results, groupId) {
  const stats = {};

  players.forEach((player) => {
    stats[player] = {
      player,
      P: 0,
      W: 0,
      D: 0,
      L: 0,
      GF: 0,
      GA: 0,
      GD: 0,
      Pts: 0,
    };
  });

  matches.forEach((match) => {
    const result = findResultForMatch(results, groupId, match.player1, match.player2);
    if (!result) {
      return;
    }

    const aligned = alignResultToMatch(match, result);
    if (!aligned) {
      return;
    }

    const home = match.player1;
    const away = match.player2;
    const homeScore = Number(aligned.score1);
    const awayScore = Number(aligned.score2);

    stats[home].P += 1;
    stats[away].P += 1;
    stats[home].GF += homeScore;
    stats[home].GA += awayScore;
    stats[away].GF += awayScore;
    stats[away].GA += homeScore;

    if (homeScore > awayScore) {
      stats[home].W += 1;
      stats[home].Pts += 3;
      stats[away].L += 1;
    } else if (homeScore < awayScore) {
      stats[away].W += 1;
      stats[away].Pts += 3;
      stats[home].L += 1;
    } else {
      stats[home].D += 1;
      stats[away].D += 1;
      stats[home].Pts += 1;
      stats[away].Pts += 1;
    }
  });

  Object.values(stats).forEach((entry) => {
    entry.GD = entry.GF - entry.GA;
  });

  return Object.values(stats).sort((a, b) => {
    if (b.Pts !== a.Pts) return b.Pts - a.Pts;
    if (b.GD !== a.GD) return b.GD - a.GD;
    if (b.GF !== a.GF) return b.GF - a.GF;
    if (b.W !== a.W) return b.W - a.W;
    return a.player.localeCompare(b.player);
  });
}

function setStatus(message, type) {
  const statusElement = document.getElementById("globalStatus");
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
