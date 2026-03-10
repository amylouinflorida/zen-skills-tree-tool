let rawConfig = null;
let translations = {};
let activeTreeKey = "survival";
let buildState = {};

const treeColors = {
  survival: "#ff9600",
  hunting: "#ff0000",
  gathering: "#40b840",
  crafting: "#5258d6"
};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    rawConfig = await loadSkillsConfig();
    translations = await loadTranslations();

    initializeBuildState(rawConfig);
    loadBuildFromUrl();
    setupButtons();
    renderTabs();
    renderTree();
    renderOverallSummary();
  } catch (err) {
    console.error(err);
    document.body.innerHTML = `<pre style="color:white;padding:20px;">Error loading planner files.\n\n${err}</pre>`;
  }
});

async function loadSkillsConfig() {
  const response = await fetch("./skills.json");
  if (!response.ok) throw new Error("Could not load skills.json");
  return await response.json();
}

async function loadTranslations() {
  const response = await fetch("./stringtable.csv");
  if (!response.ok) throw new Error("Could not load stringtable.csv");

  const csvText = await response.text();

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true
  });

  const map = {};

  for (const row of parsed.data) {
    const key = (row.Language || "").trim();
    const english = (row.english || "").trim();

    if (key) {
      map[key] = english || key;
    }
  }

  return map;
}

function initializeBuildState(config) {
  for (const [treeKey, treeDef] of Object.entries(config.SkillDefs)) {
    buildState[treeKey] = {};

    for (const perkKey of Object.keys(treeDef.Perks)) {
      buildState[treeKey][perkKey] = 0;
    }
  }
}

function resolveString(str) {
  if (!str) return "";
  if (!str.startsWith("#")) return str;

  const key = str.replace(/^#/, "");
  return translations[key] || key;
}

function renderTabs() {
  const tabsEl = document.getElementById("tabs");
  if (!tabsEl) return;

  tabsEl.innerHTML = "";

  const iconMap = {
    survival: "Survival.png",
    hunting: "Hunting.png",
    gathering: "Gathering.png",
    crafting: "Building.png"
  };

  for (const [treeKey, treeDef] of Object.entries(rawConfig.SkillDefs)) {
    const btn = document.createElement("button");
    btn.className = "tab-btn tree-" + treeKey + (treeKey === activeTreeKey ? " active" : "");

    const displayName = resolveString(treeDef.DisplayName);
    const iconFile = iconMap[treeKey] || "";

    btn.innerHTML = `
      <img src="assets/${iconFile}" class="tab-icon" alt="${displayName}">
      <span>${displayName}</span>
    `;

    btn.addEventListener("click", () => {
      activeTreeKey = treeKey;
      renderTabs();
      renderTree();
    });

    tabsEl.appendChild(btn);
  }
}

function renderTree() {
  const treeDef = rawConfig.SkillDefs[activeTreeKey];
  const treeTitle = document.getElementById("tree-title");
  const treeDescription = document.getElementById("tree-description");
  const treeGrid = document.getElementById("tree-grid");

  if (!treeDef || !treeTitle || !treeDescription || !treeGrid) return;

  treeTitle.textContent = resolveString(treeDef.DisplayName);
  treeDescription.textContent = resolveString(treeDef.Description);
  treeGrid.innerHTML = "";

  const rows = {
    1: ["1_1", "1_2", "1_3"],
    2: ["2_1", "2_2"],
    3: ["3_1", "3_2", "3_3"],
    4: ["4_1", "4_2"]
  };

  for (const perkKeys of Object.values(rows)) {
    const rowEl = document.createElement("div");
    rowEl.className = "row";

    perkKeys.forEach((perkKey) => {
      const perkDef = treeDef.Perks[perkKey];
      if (!perkDef) return;

      const level = buildState[activeTreeKey][perkKey];
      const unlocked = isPerkUnlocked(activeTreeKey, perkKey);
      const rewardText = getRewardText(perkDef, level);

      const card = document.createElement("div");

      let stateClass = "locked";
      if (level > 0) {
        stateClass = "active";
      } else if (unlocked) {
        stateClass = "available";
      }

      card.className = `perk-card tree-${activeTreeKey} ${stateClass}`;

      if (level > 0) {
        const color = treeColors[activeTreeKey] || "#ffffff";
        card.style.borderColor = color;
        card.style.boxShadow = `0 0 5px ${color}66`;
      }

      card.innerHTML = `
        <div class="perk-status-icon"></div>
        <div class="perk-name">${resolveString(perkDef.DisplayName)}</div>
        <div class="perk-rank">Rank: ${level}/3</div>
        <div class="perk-reward">Current: ${rewardText}</div>
      `;

      card.addEventListener("mouseenter", (event) => {
        showTooltip(perkDef, level, event);
      });

      card.addEventListener("mousemove", (event) => {
        moveTooltip(event);
      });

      card.addEventListener("mouseleave", () => {
        hideTooltip();
      });

      const controls = document.createElement("div");
      controls.className = "perk-controls";

      const minusBtn = document.createElement("button");
      minusBtn.type = "button";
      minusBtn.textContent = "-";
      minusBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        changePerkLevel(activeTreeKey, perkKey, -1);
      });

      const plusBtn = document.createElement("button");
      plusBtn.type = "button";
      plusBtn.textContent = "+";
      plusBtn.disabled =
        !unlocked ||
        level >= 3 ||
        getTreeRanksSpent(activeTreeKey) >= treeDef.MaxAllowedPerks;

      plusBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        changePerkLevel(activeTreeKey, perkKey, 1);
      });

      controls.appendChild(minusBtn);
      controls.appendChild(plusBtn);
      card.appendChild(controls);

      rowEl.appendChild(card);
    });

    treeGrid.appendChild(rowEl);
  }

  renderTreeSummary();
  updateTopTotals();
}

function showTooltip(perkDef, level, event) {
  const tooltip = document.getElementById("perk-tooltip");
  if (!tooltip) return;

  const title = resolveString(perkDef.DisplayName);
  const description = formatPerkDescription(perkDef, level);
  const currentValue = level > 0 ? getRewardText(perkDef, level) : "Not selected";

  tooltip.innerHTML = `
    <div class="tooltip-title">${title}</div>
    <div>${description}</div>
    <span class="tooltip-value">Current: ${currentValue}</span>
  `;

  tooltip.style.display = "block";
  moveTooltip(event);
}

function moveTooltip(event) {
  const tooltip = document.getElementById("perk-tooltip");
  if (!tooltip) return;

  const offsetX = 16;
  const offsetY = 16;

  let left = event.clientX + offsetX;
  let top = event.clientY + offsetY;

  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (left + tooltipRect.width > viewportWidth - 10) {
    left = event.clientX - tooltipRect.width - 16;
  }

  if (top + tooltipRect.height > viewportHeight - 10) {
    top = event.clientY - tooltipRect.height - 16;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTooltip() {
  const tooltip = document.getElementById("perk-tooltip");
  if (!tooltip) return;
  tooltip.style.display = "none";
}

function changePerkLevel(treeKey, perkKey, delta) {
  const current = buildState[treeKey][perkKey];
  const next = current + delta;
  const treeDef = rawConfig.SkillDefs[treeKey];

  if (next < 0 || next > 3) return;

  if (delta > 0) {
    if (!isPerkUnlocked(treeKey, perkKey)) return;
    if (getTreeRanksSpent(treeKey) >= treeDef.MaxAllowedPerks) return;
  }

  buildState[treeKey][perkKey] = next;

  renderTree();
  renderOverallSummary();
}

function isPerkUnlocked(treeKey, perkKey) {
  const tier = Number(perkKey.split("_")[0]);
  if (tier === 1) return true;

  const perkDef = rawConfig.SkillDefs[treeKey].Perks[perkKey];
  const required = perkDef.MinPerksRequiredFromPrevTier ?? 1;
  const prevTier = tier - 1;

  let count = 0;

  for (const [key, level] of Object.entries(buildState[treeKey])) {
    const row = Number(key.split("_")[0]);
    if (row === prevTier && level > 0) {
      count += 1;
    }
  }

  return count >= required;
}

function getRewardText(perkDef, level) {
  if (level <= 0) return "None";

  const reward = perkDef.Rewards[level - 1];
  const symbol = perkDef.RewardSymbol || "";
  return `${reward}${symbol}`;
}

function formatPerkDescription(perkDef, level) {
  const rawDescription = resolveString(perkDef.Description);
  const symbol = perkDef.RewardSymbol || "";

  let value;
  if (level <= 0) {
    value = `${perkDef.Rewards[0]}${symbol}`;
  } else {
    value = `${perkDef.Rewards[level - 1]}${symbol}`;
  }

  return rawDescription.replace("%1", value);
}

function getTreeRanksSpent(treeKey) {
  return Object.values(buildState[treeKey]).reduce((sum, level) => sum + level, 0);
}

function getTotalRanksSpent() {
  return Object.keys(buildState).reduce((sum, treeKey) => sum + getTreeRanksSpent(treeKey), 0);
}

function getTotalExpRequired() {
  let total = 0;

  for (const [treeKey, treeDef] of Object.entries(rawConfig.SkillDefs)) {
    total += getTreeRanksSpent(treeKey) * treeDef.EXP_Per_Perk;
  }

  return total;
}

function updateTopTotals() {
  const totalRanksEl = document.getElementById("total-ranks");
  const totalExpEl = document.getElementById("total-exp");

  if (totalRanksEl) {
    totalRanksEl.textContent = `Ranks Spent: ${getTotalRanksSpent()}`;
  }

  if (totalExpEl) {
    totalExpEl.textContent = `EXP Required: ${getTotalExpRequired().toLocaleString()}`;
  }
}

function renderTreeSummary() {
  const treeDef = rawConfig.SkillDefs[activeTreeKey];
  const summaryEl = document.getElementById("tree-summary");
  if (!summaryEl) return;

  summaryEl.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "summary-list";

  const ranksSpent = getTreeRanksSpent(activeTreeKey);
  const expRequired = ranksSpent * treeDef.EXP_Per_Perk;

  const treeHeader = document.createElement("div");
  treeHeader.className = "summary-item";
  treeHeader.textContent = resolveString(treeDef.DisplayName);
  treeHeader.style.color = treeColors[activeTreeKey] || "#ffffff";
  treeHeader.style.fontWeight = "bold";
  wrapper.appendChild(treeHeader);

  wrapper.appendChild(makeSummaryItem(`Ranks Invested: ${ranksSpent} / ${treeDef.MaxAllowedPerks}`));
  wrapper.appendChild(makeSummaryItem(`EXP Required: ${expRequired.toLocaleString()}`));

  for (const [perkKey, level] of Object.entries(buildState[activeTreeKey])) {
    if (level <= 0) continue;

    const perkDef = treeDef.Perks[perkKey];
    const perkName = resolveString(perkDef.DisplayName);
    const reward = getRewardText(perkDef, level);

    wrapper.appendChild(makeSummaryItem(`${perkName}: ${reward}`));
  }

  summaryEl.appendChild(wrapper);
}

function renderOverallSummary() {
  const overallEl = document.getElementById("overall-summary");
  if (!overallEl) return;

  overallEl.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "summary-list";

  wrapper.appendChild(makeSummaryItem(`Total Ranks Spent: ${getTotalRanksSpent()}`));
  wrapper.appendChild(makeSummaryItem(`Total EXP Required: ${getTotalExpRequired().toLocaleString()}`));

  for (const [treeKey, treeDef] of Object.entries(rawConfig.SkillDefs)) {
    const treeName = resolveString(treeDef.DisplayName);
    const spent = getTreeRanksSpent(treeKey);

    if (spent <= 0) continue;

    const treeHeader = makeSummaryItem(`${treeName}: ${spent} ranks`);
    treeHeader.style.color = treeColors[treeKey] || "#ffffff";
    treeHeader.style.fontWeight = "bold";
    wrapper.appendChild(treeHeader);

    for (const [perkKey, level] of Object.entries(buildState[treeKey])) {
      if (level <= 0) continue;

      const perkDef = treeDef.Perks[perkKey];
      const perkName = resolveString(perkDef.DisplayName);
      const reward = getRewardText(perkDef, level);

      wrapper.appendChild(makeSummaryItem(`- ${perkName}: ${reward}`));
    }
  }

  overallEl.appendChild(wrapper);
}

function makeSummaryItem(text) {
  const div = document.createElement("div");
  div.className = "summary-item";
  div.textContent = text;
  return div;
}

function setupButtons() {
  const resetTreeBtn = document.getElementById("reset-tree-btn");
  const exportBtn = document.getElementById("export-build-btn");
  const shareBtn = document.getElementById("share-build-btn");

  if (resetTreeBtn) {
    resetTreeBtn.addEventListener("click", () => {
      resetActiveTree();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      exportBuild();
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener("click", () => {
      shareBuild();
    });
  }
}

function resetActiveTree() {
  if (!buildState[activeTreeKey]) return;

  for (const perkKey of Object.keys(buildState[activeTreeKey])) {
    buildState[activeTreeKey][perkKey] = 0;
  }

  renderTree();
  renderOverallSummary();
}

function shareBuild() {
  let parts = [];

  for (const [treeKey, perks] of Object.entries(buildState)) {
    let perkParts = [];

    for (const [perkKey, level] of Object.entries(perks)) {
      if (level > 0) {
        perkParts.push(`${perkKey}=${level}`);
      }
    }

    if (perkParts.length > 0) {
      parts.push(`${treeKey}:${perkParts.join(",")}`);
    }
  }

  const buildString = parts.join(";");
  const url = `${window.location.origin}${window.location.pathname}?build=${buildString}`;

  const btn = document.getElementById("share-build-btn");

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url).then(() => {
      if (btn) {
        btn.textContent = "Link Copied!";
        setTimeout(() => {
          btn.textContent = "Share My Build";
        }, 2000);
      }
    }).catch(() => {
      fallbackCopyText(url, btn, "Share My Build");
    });
  } else {
    fallbackCopyText(url, btn, "Share My Build");
  }
}

function loadBuildFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const buildParam = params.get("build");

  if (!buildParam) return;

  let firstTreeWithPoints = null;

  try {
    const treeParts = buildParam.split(";");

    for (const treePart of treeParts) {
      const [treeKey, perksString] = treePart.split(":");
      if (!treeKey || !perksString || !buildState[treeKey]) continue;

      const perkParts = perksString.split(",");

      for (const perkPart of perkParts) {
        const [perkKey, levelStr] = perkPart.split("=");
        const level = parseInt(levelStr, 10);

        if (
          perkKey &&
          !isNaN(level) &&
          buildState[treeKey][perkKey] !== undefined
        ) {
          buildState[treeKey][perkKey] = level;

          if (level > 0 && !firstTreeWithPoints) {
            firstTreeWithPoints = treeKey;
          }
        }
      }
    }

    if (firstTreeWithPoints) {
      activeTreeKey = firstTreeWithPoints;
    }
  } catch (err) {
    console.warn("Could not load build from URL", err);
  }
}

function exportBuild() {
  let text =
`===== DayZRP Zen Skills Planner =====
https://dayzrp.com

Created by MagenShae * Graphics by Gio

`;

  for (const [treeKey, treeDef] of Object.entries(rawConfig.SkillDefs)) {
    const treeName = resolveString(treeDef.DisplayName);
    let treeLines = [];

    for (const [perkKey, level] of Object.entries(buildState[treeKey])) {
      if (level <= 0) continue;

      const perkDef = treeDef.Perks[perkKey];
      const perkName = resolveString(perkDef.DisplayName);
      const reward = getRewardText(perkDef, level);

      treeLines.push(`• ${perkName} — Rank ${level} (${reward})`);
    }

    if (treeLines.length > 0) {
      text += `${treeName}\n`;
      text += treeLines.join("\n") + "\n\n";
    }
  }

  text += `Total Ranks Spent: ${getTotalRanksSpent()}\n`;
  text += `Total EXP Required: ${getTotalExpRequired().toLocaleString()}`;

  const btn = document.getElementById("export-build-btn");

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      if (btn) {
        btn.textContent = "Build Copied!";
        setTimeout(() => {
          btn.textContent = "Copy Build to Clipboard";
        }, 2000);
      }
    }).catch(() => {
      fallbackCopyText(text, btn, "Copy Build to Clipboard");
    });
  } else {
    fallbackCopyText(text, btn, "Copy Build to Clipboard");
  }
}

function fallbackCopyText(text, btn, originalLabel = "Copy") {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    document.execCommand("copy");
    if (btn) {
      btn.textContent = btn.id === "share-build-btn" ? "Link Copied!" : "Build Copied!";
      setTimeout(() => {
        btn.textContent = originalLabel;
      }, 2000);
    }
  } catch (err) {
    console.error("Copy failed:", err);
    alert("Could not copy to clipboard.");
  }

  document.body.removeChild(textArea);
}