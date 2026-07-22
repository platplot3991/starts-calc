<script lang="ts">
  import { onMount } from 'svelte';

  type Player = {
    name: string;
    seconds: string;
    active: boolean;
  };

  const STORAGE_KEY = 'starts-calc';
  const SAVES_KEY = 'starts-calc-saves';
  const SAVE_TTL = 6 * 60 * 60 * 1000; // 6時間

  type SavedSet = {
    name: string;
    savedAt: number;
    players: Player[];
    delayIndex: number | null;
    buzzerbeat: boolean;
    rallyMinutes: number;
  };

  let setName = '';
  let players: Player[] = [
    { name: '', seconds: '', active: true },
    { name: '', seconds: '', active: true },
    { name: '', seconds: '', active: true },
    { name: '', seconds: '', active: true },
    { name: '', seconds: '', active: true },
    { name: '', seconds: '', active: true },
  ];
  let delayIndex: number | null = null;
  let urgent = false;
  let defense = false;
  let buzzerbeat = false;
  let rallyMinutes = 1;

  let result = '';
  let copied = false;
  let mounted = false;
  let savedSets: SavedSet[] = [];
  let tooltipVisible = false;

  $: validCount = players.filter(p => p.active && String(p.seconds).trim() !== '').length;
  $: canDelay = !buzzerbeat && validCount >= 2;

  onMount(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const s = JSON.parse(saved);
        if (s.setName !== undefined) setName = s.setName;
        if (Array.isArray(s.players) && s.players.length === 6) players = s.players;
        if (s.delayIndex !== undefined) delayIndex = s.delayIndex;
        if (s.urgent !== undefined) urgent = s.urgent;
        if (s.defense !== undefined) defense = s.defense;
        if (s.buzzerbeat !== undefined) buzzerbeat = s.buzzerbeat;
        if (s.rallyMinutes !== undefined) rallyMinutes = s.rallyMinutes;
      }
    } catch {}
    loadSaves();
    mounted = true;
  });

  function loadSaves() {
    try {
      const raw = localStorage.getItem(SAVES_KEY);
      if (!raw) return;
      const all: SavedSet[] = JSON.parse(raw);
      const now = Date.now();
      savedSets = all.filter(s => now - s.savedAt < SAVE_TTL);
      if (savedSets.length !== all.length) {
        localStorage.setItem(SAVES_KEY, JSON.stringify(savedSets));
      }
    } catch {}
  }

  function saveSet() {
    if (!setName.trim()) return;
    loadSaves();
    const entry: SavedSet = {
      name: setName.trim(),
      savedAt: Date.now(),
      players,
      delayIndex,
      buzzerbeat,
      rallyMinutes,
    };
    // 同名は上書き
    savedSets = [...savedSets.filter(s => s.name !== entry.name), entry];
    localStorage.setItem(SAVES_KEY, JSON.stringify(savedSets));
  }

  function loadSet(s: SavedSet) {
    setName = s.name;
    players = s.players;
    delayIndex = s.delayIndex;
    buzzerbeat = s.buzzerbeat;
    rallyMinutes = s.rallyMinutes;
    result = '';
    memoResult = '';
  }

  $: stateJson = JSON.stringify({ setName, players, delayIndex, urgent, defense, buzzerbeat, rallyMinutes });
  $: if (mounted) localStorage.setItem(STORAGE_KEY, stateJson);

  function formatTime(baseMinSec: number, offsetSeconds: number): string {
    const baseMin = Math.floor(baseMinSec / 100);
    const baseSec = baseMinSec % 100;
    const totalSec = baseMin * 60 + baseSec + offsetSeconds;
    const min = Math.floor(totalSec / 60) % 100;
    const sec = totalSec % 60;
    return String(min).padStart(2, '0') + String(sec).padStart(2, '0');
  }

  function calculate() {
    const valid = players
      .map((p, i) => ({ name: p.name || `P${i + 1}`, sec: parseInt(p.seconds), delay: i === delayIndex }))
      .filter((_, i) => players[i].active && String(players[i].seconds).trim() !== '');

    if (valid.length < 1) {
      result = '1人以上チェックしてね';
      return;
    }
    if (valid.some(p => isNaN(p.sec) || p.sec <= 0)) {
      result = 'チェック中のプレイヤーの行軍時間を正の整数で入力してね';
      return;
    }

    const maxSec = Math.max(...valid.map(p => p.sec));
    const delayedPlayer = valid.find(p => p.delay);

    let lines: string[];
    let header = '';

    if (buzzerbeat) {
      // 次のローカル時間 XX:59:59 を求める（maxSec + 120秒以上余裕があること）
      const now = new Date();
      const localNowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      const localHourStart = now.getHours() * 3600;
      let localTargetSec = localHourStart + 59 * 60 + 59;
      const rallySec = rallyMinutes * 60;
      if (localTargetSec - localNowSec < maxSec + rallySec + 60) {
        localTargetSec += 3600;
      }
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
      const targetSec = midnight + localTargetSec;
      const targetHour = Math.floor(localTargetSec / 3600) % 24;
      header = `${String(targetHour).padStart(2, '0')}:59:59着弾（${rallyMinutes}分集結）`;

      lines = [...valid]
        .sort((a, b) => b.sec - a.sec)
        .map(p => {
          const startEpochSec = targetSec - p.sec - rallySec + (p.delay ? 1 : 0);
          const d = new Date(startEpochSec * 1000);
          const time = String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0');
          return `${p.name}: ${time}`;
        });
    } else {
      // 現在時刻+60秒（お急ぎ時は+30秒）を切り上げて次の分を集結時刻にする（UTC）
      const nowMs = Date.now() + (urgent ? 30000 : 60000);
      const targetMs = Math.ceil(nowMs / 60000) * 60000;
      const baseMin = new Date(targetMs).getUTCMinutes();
      const baseTime = baseMin * 100;

      lines = [...valid]
        .sort((a, b) => b.sec - a.sec)
        .map(p => {
          const diff = maxSec - p.sec + (p.delay ? 1 : 0);
          return `${p.name}: ${formatTime(baseTime, diff)}`;
        });
    }

    const parts: string[] = [];
    if (header) parts.push(header);
    if (setName.trim()) parts.push(setName.trim());
    parts.push(...lines);

    if (delayedPlayer) {
      parts.push('');
      if (defense) {
        parts.push(`${delayedPlayer.name}優先セルゲイorパトリック613`);
        parts.push('他ジェシー523');
      } else {
        parts.push(`${delayedPlayer.name}優先ジェシー523`);
      }
    }

    result = parts.join('\n');
  }

  function reset() {
    setName = '';
    players = Array.from({ length: 6 }, () => ({ name: '', seconds: '', active: true }));
    delayIndex = null;
    urgent = false;
    defense = false;
    result = '';
    localStorage.removeItem(STORAGE_KEY);
  }

  let memoResult = '';
  let memoCopied = false;

  function memo() {
    const valid = players
      .map((p, i) => ({ name: p.name || `P${i + 1}`, sec: parseInt(p.seconds) }))
      .filter((_, i) => players[i].active && String(players[i].seconds).trim() !== '')
      .filter(p => !isNaN(p.sec) && p.sec > 0);

    if (valid.length === 0) {
      memoResult = '入力してね';
      return;
    }
    const lines = valid.map(p => `${p.name}　${p.sec}秒`);
    const parts: string[] = [];
    if (setName.trim()) parts.push(setName.trim());
    parts.push(...lines);
    memoResult = parts.join('\n');
  }

  async function copyMemo() {
    await navigator.clipboard.writeText(memoResult);
    memoCopied = true;
    setTimeout(() => (memoCopied = false), 1500);
  }

  async function copyResult() {
    await navigator.clipboard.writeText(result);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<div class="calc">
  <div class="top-bar">
    <div class="mode-tabs">
      <button class="mode-tab" class:active={!buzzerbeat} on:click={() => { buzzerbeat = false; }}>通常</button>
      <button class="mode-tab" class:active={buzzerbeat} on:click={() => { buzzerbeat = true; }}>ブザービート</button>
    </div>
    <button class="reset-btn" on:click={reset}>リセット</button>
  </div>

  <div class="field">
    <label>セット名</label>
    <input type="text" bind:value={setName} placeholder="南砲台" autocomplete="off" />
    <button class="save-btn" on:click={saveSet} disabled={!setName.trim()}>保存</button>
  </div>

  {#if savedSets.length > 0}
    <div class="saved-sets">
      {#each savedSets as s}
        <button class="saved-btn" on:click={() => loadSet(s)}>{s.name}</button>
      {/each}
      <span class="info-wrap">
        <span
          class="info-icon"
          tabindex="0"
          on:click={() => tooltipVisible = !tooltipVisible}
          on:keydown={e => e.key === 'Enter' && (tooltipVisible = !tooltipVisible)}
          on:blur={() => tooltipVisible = false}
        >ⓘ</span>
        <span class="tooltip" class:visible={tooltipVisible}>6時間で自動削除されます</span>
      </span>
    </div>
  {/if}

  <table class="players">
    <thead>
      <tr>
        <th>参加</th>
        <th>名前</th>
        <th>行軍(秒)</th>
        {#if !buzzerbeat}<th>1秒遅れ</th>{/if}
      </tr>
    </thead>
    <tbody>
      {#each players as player, i}
        <tr class:inactive={!player.active}>
          <td class="check-cell">
            <input type="checkbox" bind:checked={player.active} />
          </td>
          <td><input type="text" bind:value={player.name} placeholder="呼び名" autocomplete="off" disabled={!player.active} /></td>
          <td><input type="text" bind:value={player.seconds} placeholder="秒" inputmode="numeric" disabled={!player.active} /></td>
          {#if !buzzerbeat}
          <td class="radio-cell">
            <input
              type="radio"
              name="delay"
              value={i}
              bind:group={delayIndex}
              disabled={!player.active || !canDelay}
            />
          </td>
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>

  {#if !buzzerbeat && delayIndex !== null}
    <button class="clear-btn" on:click={() => (delayIndex = null)}>1秒遅れ解除</button>
  {/if}

  {#if buzzerbeat}
    <div class="rally-toggle">
      <span class="rally-label">集結時間</span>
      <div class="rally-tabs">
        <button class="rally-tab" class:active={rallyMinutes === 1} on:click={() => rallyMinutes = 1}>1分</button>
        <button class="rally-tab" class:active={rallyMinutes === 5} on:click={() => rallyMinutes = 5}>5分</button>
      </div>
    </div>
  {/if}

  {#if !buzzerbeat}
    <label class="urgent-label">
      <input type="checkbox" bind:checked={urgent} />
      お急ぎモード（30秒）
    </label>
  {/if}

  {#if !buzzerbeat && delayIndex !== null}
    <label class="urgent-label">
      <input type="checkbox" bind:checked={defense} />
      防衛に移行
    </label>
  {/if}

  <div class="action-btns">
    <button class="calc-btn" on:click={calculate}>計算する</button>
    <button class="memo-btn" on:click={memo}>覚書</button>
  </div>

  {#if result}
    <div class="result">
      <pre>{result}</pre>
      <button class="copy-btn" on:click={copyResult}>
        {copied ? 'コピーした！' : 'コピー'}
      </button>
    </div>
  {/if}

  {#if memoResult}
    <div class="result memo-result">
      <pre>{memoResult}</pre>
      <button class="copy-btn" on:click={copyMemo}>
        {memoCopied ? 'コピーした！' : 'コピー'}
      </button>
    </div>
  {/if}
</div>

<style>
  .calc {
    max-width: 375px;
    margin: 0 auto;
    padding: 0.75rem;
    font-family: sans-serif;
    font-size: 16px;
  }

  .top-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .mode-tabs {
    display: flex;
    flex: 1;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #ddd;
  }

  .mode-tab {
    flex: 1;
    padding: 0.6rem;
    font-size: 0.95rem;
    font-weight: bold;
    background: #f5f5f5;
    color: #888;
    border: none;
    cursor: pointer;
  }

  .mode-tab.active {
    background: #4a90d9;
    color: white;
  }

  .reset-btn {
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
    background: none;
    color: #bbb;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .save-btn {
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
    background: #e8f4e8;
    color: #2e7d32;
    border: 1px solid #a5d6a7;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .save-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .saved-sets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 0.75rem;
  }

  .info-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .info-icon {
    font-size: 0.95rem;
    color: #aaa;
    cursor: default;
    user-select: none;
  }

  .tooltip {
    display: none;
    position: absolute;
    left: 50%;
    bottom: calc(100% + 6px);
    transform: translateX(-50%);
    background: #333;
    color: #fff;
    font-size: 0.78rem;
    padding: 0.3rem 0.6rem;
    border-radius: 6px;
    white-space: nowrap;
    pointer-events: none;
  }

  .info-wrap:hover .tooltip,
  .tooltip.visible {
    display: block;
  }

  .saved-btn {
    padding: 0.35rem 0.7rem;
    font-size: 0.85rem;
    background: #fff;
    color: #444;
    border: 1px solid #ccc;
    border-radius: 20px;
    cursor: pointer;
  }

  .field label {
    width: 4.5rem;
    font-weight: bold;
    flex-shrink: 0;
    font-size: 0.9rem;
  }

  .field input {
    flex: 1;
    padding: 0.5rem;
    font-size: 1rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-sizing: border-box;
  }

  .players {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0.75rem;
  }

  .players th {
    font-size: 0.8rem;
    text-align: center;
    padding: 0.3rem 0.2rem;
    border-bottom: 2px solid #ddd;
    color: #666;
  }

  .players td {
    padding: 0.3rem 0.2rem;
    vertical-align: middle;
  }

  .players td input[type="text"] {
    width: 100%;
    padding: 0.5rem;
    font-size: 1rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-sizing: border-box;
  }

  .check-cell,
  .radio-cell {
    text-align: center;
  }

  .check-cell input[type="checkbox"],
  .radio-cell input[type="radio"] {
    width: 1.2rem;
    height: 1.2rem;
  }

  tr.inactive td input {
    opacity: 0.35;
  }

  .rally-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .rally-label {
    font-size: 0.9rem;
    color: #555;
    white-space: nowrap;
  }

  .rally-tabs {
    display: flex;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid #ddd;
  }

  .rally-tab {
    padding: 0.3rem 0.8rem;
    font-size: 0.9rem;
    font-weight: bold;
    background: #f5f5f5;
    color: #888;
    border: none;
    cursor: pointer;
  }

  .rally-tab.active {
    background: #4a90d9;
    color: white;
  }

  .urgent-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.75rem;
    font-size: 0.95rem;
    cursor: pointer;
  }

  .urgent-label input[type="checkbox"] {
    width: 1.2rem;
    height: 1.2rem;
  }

  .clear-btn {
    display: block;
    margin: 0 0 0.75rem auto;
    padding: 0.3rem 0.7rem;
    font-size: 0.85rem;
    background: none;
    border: 1px solid #aaa;
    border-radius: 6px;
    cursor: pointer;
    color: #555;
  }

  .calc-btn {
    padding: 0.75rem;
    font-size: 1.1rem;
    font-weight: bold;
    background: #4a90d9;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }

  .action-btns {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .action-btns .calc-btn {
    flex: 1;
    margin-bottom: 0;
  }

  .memo-btn {
    padding: 0.75rem 1rem;
    font-size: 1rem;
    font-weight: bold;
    background: #f0f0f0;
    color: #555;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    white-space: nowrap;
  }

  .memo-result {
    margin-top: 0.75rem;
    background: #f0f5ff;
  }

  .result {
    background: #f5f5f5;
    border-radius: 8px;
    padding: 0.75rem;
  }

  .result pre {
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
    line-height: 1.8;
    white-space: pre-wrap;
  }

  .copy-btn {
    display: block;
    width: 100%;
    padding: 0.6rem;
    font-size: 1rem;
    background: #555;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
</style>
