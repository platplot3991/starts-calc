<script lang="ts">
  const TROOP_TYPES = ['盾', '槍', '弓'] as const;
  type TroopType = typeof TROOP_TYPES[number];

  let targetPower = '120000';
  let selectedTypes: TroopType[] = [...TROOP_TYPES];
  let mode: 'common' | 'individual' = 'common';

  // 共通入力
  let commonPower = '';
  let commonMax = '';
  let commonTime = '';

  // 個別入力
  type TroopParams = { power: string; max: string; time: string };
  let troopParams: Record<TroopType, TroopParams> = {
    盾: { power: '', max: '', time: '' },
    槍: { power: '', max: '', time: '' },
    弓: { power: '', max: '', time: '' },
  };

  type RoundInfo = { count: number; time: number | null };
  type Result = { type: TroopType; needed: number; rounds: RoundInfo[]; tooMany: boolean };

  let results: Result[] = [];
  let showHours = false;

  function toggle(type: TroopType) {
    if (selectedTypes.includes(type)) {
      selectedTypes = selectedTypes.filter(t => t !== type);
    } else {
      selectedTypes = [...selectedTypes, type];
    }
  }

  function formatTime(minutes: number): string {
    if (showHours) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return h > 0 ? `約${h}時間${m}分` : `約${m}分`;
    }
    return `約${minutes}分`;
  }

  function calculate() {
    const target = parseFloat(targetPower);
    if (isNaN(target) || selectedTypes.length === 0) { results = []; return; }

    // 各兵種のパラメータを解析
    type Params = { type: TroopType; ppt: number; max: number; time: number };
    const parsed: Params[] = selectedTypes.map(type => {
      const p = mode === 'common'
        ? { power: commonPower, max: commonMax, time: commonTime }
        : troopParams[type];
      return { type, ppt: parseFloat(p.power), max: parseInt(p.max), time: parseFloat(p.time) };
    }).filter(p => !isNaN(p.ppt) && p.ppt > 0 && !isNaN(p.max) && p.max > 0 && !isNaN(p.time) && p.time > 0);

    if (parsed.length === 0) { results = []; return; }

    // 最短バッチ時間
    const minTime = Math.min(...parsed.map(p => p.time));

    // 1ラウンドで訓練できる人数（最短基準に比例）
    const roundCapacity = (p: Params) => Math.floor(p.max * (minTime / p.time));

    // ラウンドごとに計算（最大3回）
    const troopCounts: Record<TroopType, number[]> = { 盾: [], 槍: [], 弓: [] };
    let remaining = target;
    let tooMany = false;

    for (let round = 0; round < 3; round++) {
      if (remaining <= 0) break;

      // このラウンドで得られる総力
      const roundPower = parsed.reduce((sum, p) => sum + roundCapacity(p) * p.ppt, 0);

      if (roundPower <= 0) break;

      if (remaining <= roundPower) {
        // このラウンドで完結: 比例スケールダウン
        const scale = remaining / roundPower;
        for (const p of parsed) {
          troopCounts[p.type].push(Math.ceil(roundCapacity(p) * scale));
        }
        remaining = 0;
      } else {
        // フル訓練
        for (const p of parsed) {
          troopCounts[p.type].push(roundCapacity(p));
        }
        remaining -= roundPower;
      }
    }

    if (remaining > 0) tooMany = true;

    results = parsed.map(p => {
      const rounds: RoundInfo[] = troopCounts[p.type].map(count => ({
        count,
        // 秒で計算して分に変換（切り上げ）
        time: Math.ceil((count * p.time) / 60),
      }));
      const needed = rounds.reduce((s, r) => s + r.count, 0);
      return { type: p.type, needed, rounds, tooMany };
    });
  }

  function copyNumber(value: number) {
    navigator.clipboard.writeText(String(value));
  }
</script>

<div class="calc">
  <div class="field">
    <label>目標総力</label>
    <input type="number" bind:value={targetPower} placeholder="120000" inputmode="numeric" autocomplete="off" />
  </div>

  <div class="types">
    <span class="types-label">兵種</span>
    {#each TROOP_TYPES as type}
      <label class="check-label">
        <input type="checkbox" checked={selectedTypes.includes(type)} on:change={() => toggle(type)} />
        {type}
      </label>
    {/each}
  </div>

  <div class="mode-select">
    <label class="check-label">
      <input type="radio" bind:group={mode} value="common" /> 共通
    </label>
    <label class="check-label">
      <input type="radio" bind:group={mode} value="individual" /> 個別
    </label>
  </div>

  {#if mode === 'common'}
    <div class="field">
      <label>1人あたり総力</label>
      <input type="number" bind:value={commonPower} placeholder="50" inputmode="numeric" autocomplete="off" />
    </div>
    <div class="field">
      <label>最大訓練人数</label>
      <input type="number" bind:value={commonMax} placeholder="600" inputmode="numeric" autocomplete="off" />
    </div>
    <div class="field">
      <label>1人あたり訓練時間(秒)</label>
      <input type="number" bind:value={commonTime} placeholder="例: 49" inputmode="numeric" autocomplete="off" />
    </div>
  {:else}
    <table class="input-table">
      <thead>
        <tr>
          <th>兵種</th>
          <th>総力/人</th>
          <th>最大人数</th>
          <th>1人訓練(秒)</th>
        </tr>
      </thead>
      <tbody>
        {#each TROOP_TYPES as type}
          {#if selectedTypes.includes(type)}
            <tr>
              <td class="type-cell">{type}</td>
              <td><input type="number" bind:value={troopParams[type].power} placeholder="50" inputmode="numeric" autocomplete="off" /></td>
              <td><input type="number" bind:value={troopParams[type].max} placeholder="600" inputmode="numeric" autocomplete="off" /></td>
              <td><input type="number" bind:value={troopParams[type].time} placeholder="49" inputmode="numeric" autocomplete="off" /></td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {/if}

  <button class="calc-btn" on:click={calculate}>計算する</button>

  {#if results.length > 0}
    <label class="check-label" style="margin-bottom: 0.75rem;">
      <input type="checkbox" bind:checked={showHours} />
      時間&分で表示
    </label>

    {#if results[0].tooMany}
      <p class="too-many">回数が多すぎます（4回以上必要）</p>
    {:else}
      <div class="round-times">
        {#each [0, 1, 2] as i}
          {#if results[0].rounds[i]}
            <span>{i + 1}回目: {formatTime(results[0].rounds[i].time!)}</span>
          {/if}
        {/each}
        <small class="approx">※概算</small>
      </div>

      <table class="results">
        <thead>
          <tr>
            <th>兵種</th>
            <th>必要</th>
            <th>1回目</th>
            <th>2回目</th>
            <th>3回目</th>
          </tr>
        </thead>
        <tbody>
          {#each results as r}
            <tr>
              <td>{r.type}</td>
              <td class="copyable" on:click={() => copyNumber(r.needed)}>{r.needed}人</td>
              {#each [0, 1, 2] as i}
                <td class={r.rounds[i] ? 'copyable' : ''} on:click={() => r.rounds[i] && copyNumber(r.rounds[i].count)}>
                  {#if r.rounds[i]}
                    {r.rounds[i].count}人
                  {:else}
                    -
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
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

  .field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }

  .field label {
    width: 8rem;
    font-weight: bold;
    flex-shrink: 0;
    font-size: 0.85rem;
  }

  .field input {
    flex: 1;
    padding: 0.5rem;
    font-size: 1rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-sizing: border-box;
  }

  .types, .mode-select {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .types-label {
    font-weight: bold;
    font-size: 0.85rem;
    width: 8rem;
    flex-shrink: 0;
  }

  .check-label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.95rem;
    cursor: pointer;
  }

  .check-label input {
    width: 1.2rem;
    height: 1.2rem;
  }

  .input-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0.75rem;
    font-size: 0.85rem;
  }

  .input-table th {
    background: #e8e8e8;
    padding: 0.3rem 0.2rem;
    text-align: center;
    border: 1px solid #ccc;
    font-size: 0.78rem;
  }

  .input-table td {
    border: 1px solid #ddd;
    padding: 0.2rem;
    text-align: center;
  }

  .input-table td.type-cell {
    font-weight: bold;
    background: #f5f5f5;
  }

  .input-table input {
    width: 100%;
    padding: 0.4rem 0.2rem;
    font-size: 0.9rem;
    border: none;
    text-align: center;
    box-sizing: border-box;
  }

  .calc-btn {
    display: block;
    width: 100%;
    padding: 0.75rem;
    font-size: 1.1rem;
    font-weight: bold;
    background: #4a90d9;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    margin-bottom: 1rem;
  }

  .round-times {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-bottom: 0.75rem;
    font-size: 0.9rem;
    color: #444;
  }

  .round-times span {
    font-weight: bold;
  }

  .approx {
    color: #999;
    font-size: 0.8rem;
    font-weight: normal;
  }

  .too-many {
    color: #c0392b;
    font-weight: bold;
    text-align: center;
  }

  .results {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .results th {
    background: #e8e8e8;
    padding: 0.4rem 0.2rem;
    text-align: center;
    border: 1px solid #ccc;
    font-size: 0.8rem;
  }

  .results td.copyable {
    cursor: pointer;
    background: #eaf4ff;
  }

  .results td.copyable:active {
    background: #b3d9ff;
  }

  .results td {
    padding: 0.4rem 0.2rem;
    text-align: center;
    border: 1px solid #ddd;
    line-height: 1.4;
  }

  .results small {
    color: #666;
    font-size: 0.75rem;
  }

  .results tbody tr:nth-child(even) {
    background: #f9f9f9;
  }
</style>
