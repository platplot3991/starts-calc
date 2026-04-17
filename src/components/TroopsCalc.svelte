<script lang="ts">
  const TROOP_TYPES = ['盾', '槍', '弓'] as const;
  type TroopType = typeof TROOP_TYPES[number];

  let targetPower = '120000';
  let selectedTypes: TroopType[] = [...TROOP_TYPES];
  let mode: 'common' | 'scheduler' = 'common';

  // 共通入力
  let commonPower = '';
  let commonMax = '';
  let commonTime = '';

  // スケジューラー入力
  type BlockData = { count: string; power: string; time: string };
  type SchedulerTypeData = { blocks: BlockData[] };
  let schedulerData: Record<TroopType, SchedulerTypeData> = {
    盾: { blocks: [{ count: '', power: '', time: '' }] },
    槍: { blocks: [{ count: '', power: '', time: '' }] },
    弓: { blocks: [{ count: '', power: '', time: '' }] },
  };

  function forceUpdate() {
    schedulerData = schedulerData;
  }

  function moveBlock(type: TroopType, from: number, to: number) {
    const blocks = [...schedulerData[type].blocks];
    const [item] = blocks.splice(from, 1);
    blocks.splice(to, 0, item);
    schedulerData[type].blocks = blocks;
    schedulerData = schedulerData;
  }

  $: typeStats = (() => {
    const stats: Record<TroopType, { count: number; power: number; time: number }> = {
      盾: { count: 0, power: 0, time: 0 },
      槍: { count: 0, power: 0, time: 0 },
      弓: { count: 0, power: 0, time: 0 },
    };
    for (const type of TROOP_TYPES) {
      for (const block of schedulerData[type].blocks) {
        const c = parseInt(block.count);
        const p = parseFloat(block.power);
        const t = parseFloat(block.time);
        if (isNaN(c) || c <= 0) continue;
        stats[type].count += c;
        if (!isNaN(p) && p > 0) stats[type].power += c * p;
        if (!isNaN(t) && t > 0) stats[type].time += Math.ceil(c * t / 60);
      }
    }
    return stats;
  })();

  $: totalPower = selectedTypes.reduce((sum, type) => sum + typeStats[type].power, 0);

  $: targetNum = parseFloat(targetPower);
  $: remaining = isNaN(targetNum) ? 0 : Math.max(0, targetNum - totalPower);
  $: achieved = !isNaN(targetNum) && targetNum > 0 && totalPower >= targetNum;
  $: progressPct = isNaN(targetNum) || targetNum <= 0 ? 0 : Math.min(100, (totalPower / targetNum) * 100);

  function addBlock(type: TroopType) {
    schedulerData[type].blocks = [...schedulerData[type].blocks, { count: '', power: '', time: '' }];
    schedulerData = schedulerData;
  }

  function removeBlock(type: TroopType, idx: number) {
    schedulerData[type].blocks = schedulerData[type].blocks.filter((_, i) => i !== idx);
    schedulerData = schedulerData;
  }

  // 共通モード
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

    type Params = { type: TroopType; ppt: number; max: number; time: number };
    const parsed: Params[] = selectedTypes.map(type => {
      const p = { power: commonPower, max: commonMax, time: commonTime };
      return { type, ppt: parseFloat(p.power), max: parseInt(p.max), time: parseFloat(p.time) };
    }).filter(p => !isNaN(p.ppt) && p.ppt > 0 && !isNaN(p.max) && p.max > 0 && !isNaN(p.time) && p.time > 0);

    if (parsed.length === 0) { results = []; return; }

    const minTime = Math.min(...parsed.map(p => p.time));
    const roundCapacity = (p: Params) => Math.floor(p.max * (minTime / p.time));

    const troopCounts: Record<TroopType, number[]> = { 盾: [], 槍: [], 弓: [] };
    let remaining = target;
    let tooMany = false;

    for (let round = 0; round < 6; round++) {
      if (remaining <= 0) break;

      const roundPower = parsed.reduce((sum, p) => sum + roundCapacity(p) * p.ppt, 0);
      if (roundPower <= 0) break;

      if (remaining <= roundPower) {
        const scale = remaining / roundPower;
        for (const p of parsed) {
          troopCounts[p.type].push(Math.ceil(roundCapacity(p) * scale));
        }
        remaining = 0;
      } else {
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
        time: Math.ceil((count * p.time) / 60),
      }));
      const needed = rounds.reduce((s, r) => s + r.count, 0);
      return { type: p.type, needed, rounds, tooMany };
    });
  }

  function copyNumber(value: number) {
    navigator.clipboard.writeText(String(value));
  }

  let textCopied = false;

  function pad(s: string, width: number) {
    const len = [...s].reduce((n, c) => n + (c.match(/[^\x00-\x7F]/) ? 2 : 1), 0);
    return s + ' '.repeat(Math.max(0, width - len));
  }

  function buildText(): string {
    if (results.length === 0) return '';
    const COL = 7;
    const header = pad('　', 4) + pad('必要', COL) + results[0].rounds.map((_, i) => pad(`${i+1}回目`, COL)).join('');
    const rows = results.map(r =>
      pad(r.type, 4) + pad(`${r.needed}人`, COL) + r.rounds.map(rd => pad(`${rd.count}人`, COL)).join('')
    );
    const footer = pad('目安', 4) + pad('　', COL) + results[0].rounds.map(rd => pad(`${rd.time}m`, COL)).join('');
    return [header, ...rows, footer].join('\n');
  }

  async function copyText() {
    await navigator.clipboard.writeText(buildText());
    textCopied = true;
    setTimeout(() => (textCopied = false), 1500);
  }

  // スケジューラーテキスト出力
  $: schedulerText = (() => {
    const lines: string[] = [];
    for (const type of selectedTypes) {
      const d = schedulerData[type];
      const valid = d.blocks.filter(b => parseInt(b.count) > 0 && parseFloat(b.power) > 0);
      if (valid.length === 0) continue;
      const { count, time } = typeStats[type];
      const timeStr = time > 0 ? ` 約${time}分` : '';
      lines.push(`【${type}】${count}人${timeStr}`);
      valid.forEach((b, i) => {
        const c = parseInt(b.count);
        const t = parseFloat(b.time);
        const tStr = !isNaN(t) && t > 0 ? ` 約${Math.ceil(c * t / 60)}分` : '';
        lines.push(`  ${i + 1}回目: ${c}人${tStr}`);
      });
    }
    const t = isNaN(targetNum) ? '?' : targetNum.toLocaleString();
    lines.push(`合計: ${totalPower.toLocaleString()} / ${t}`);
    return lines.join('\n');
  })();

  let schedulerCopied = false;
  async function copySchedulerText() {
    await navigator.clipboard.writeText(schedulerText);
    schedulerCopied = true;
    setTimeout(() => (schedulerCopied = false), 1500);
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
      <input type="radio" bind:group={mode} value="scheduler" /> スケジューラー
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

    <button class="calc-btn" on:click={calculate}>計算する</button>

    {#if results.length > 0}
      <label class="check-label" style="margin-bottom: 0.75rem;">
        <input type="checkbox" bind:checked={showHours} />
        時間&分で表示
      </label>

      {#if results[0].tooMany}
        <p class="too-many">回数が多すぎます（7回以上必要）</p>
      {:else}
        <div class="table-wrap">
          {#if results[0].rounds.length > 3}
            <div class="scroll-hint">›</div>
          {/if}
          <div class="table-scroll">
            <table class="results">
              <thead>
                <tr>
                  <th>兵種</th>
                  <th>必要</th>
                  {#each results[0].rounds as round, i}
                    <th>{i + 1}回目<br /><small>{formatTime(round.time!)}</small></th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each results as r}
                  <tr>
                    <td>{r.type}</td>
                    <td class="copyable" on:click={() => copyNumber(r.needed)}>{r.needed}人</td>
                    {#each r.rounds as round}
                      <td class="copyable" on:click={() => copyNumber(round.count)}>
                        {round.count}人
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
        <small class="approx">※時間は概算</small>

        <div class="text-result">
          <pre>{buildText()}</pre>
          <button class="copy-btn" on:click={copyText}>
            {textCopied ? 'コピーした！' : 'テキストコピー'}
          </button>
        </div>
      {/if}
    {/if}

  {:else}
    <!-- スケジューラーモード -->
    <div class="sched-summary" class:achieved>
      <div class="sched-summary-row">
        <span class="sched-total">{totalPower.toLocaleString()}</span>
        <span class="sched-sep">/</span>
        <span class="sched-target">{isNaN(targetNum) ? '?' : targetNum.toLocaleString()}</span>
        {#if achieved}
          <span class="badge-ok">達成！</span>
        {/if}
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: {progressPct}%"></div>
      </div>
      {#if !achieved && totalPower > 0}
        <div class="sched-remaining">残り {remaining.toLocaleString()}</div>
      {/if}
    </div>

    <div class="scheduler">
      {#each TROOP_TYPES as type}
        {#if selectedTypes.includes(type)}
          <div class="type-section">
            <div class="type-header">
              <span class="type-name">{type}</span>
              <button class="add-btn" on:click={() => addBlock(type)}>+ 追加</button>
            </div>

            <div class="block-col-labels">
              <span class="block-order-spacer"></span>
              <span class="label-col">訓練人数</span>
              <span class="label-col">総力/人</span>
              <span class="label-col">秒/人</span>
            </div>

            {#each schedulerData[type].blocks as block, i}
              <div class="block-wrap">
                <div class="block-row">
                  <div class="block-order">
                    <button class="order-btn" on:click={() => moveBlock(type, i, i - 1)} disabled={i === 0}>▲</button>
                    <button class="order-btn" on:click={() => moveBlock(type, i, i + 1)} disabled={i === schedulerData[type].blocks.length - 1}>▼</button>
                  </div>
                  <input
                    class="block-input"
                    type="number"
                    bind:value={schedulerData[type].blocks[i].count}
                    on:input={forceUpdate}
                    placeholder="600"
                    inputmode="numeric"
                    autocomplete="off"
                  />
                  <input
                    class="block-input"
                    type="number"
                    bind:value={schedulerData[type].blocks[i].power}
                    on:input={forceUpdate}
                    placeholder="50"
                    inputmode="numeric"
                    autocomplete="off"
                  />
                  <input
                    class="block-input"
                    type="number"
                    bind:value={schedulerData[type].blocks[i].time}
                    on:input={forceUpdate}
                    placeholder="49"
                    inputmode="numeric"
                    autocomplete="off"
                  />
                  <button class="del-btn" on:click={() => removeBlock(type, i)}>−</button>
                </div>
                {#if (parseInt(schedulerData[type].blocks[i].count) > 0 && parseFloat(schedulerData[type].blocks[i].power) > 0) || (parseInt(schedulerData[type].blocks[i].count) > 0 && parseFloat(schedulerData[type].blocks[i].time) > 0)}
                  <div class="block-info">
                    {#if parseInt(schedulerData[type].blocks[i].count) > 0 && parseFloat(schedulerData[type].blocks[i].power) > 0}
                      <span class="block-power-val">= {(parseInt(schedulerData[type].blocks[i].count) * parseFloat(schedulerData[type].blocks[i].power)).toLocaleString()}</span>
                    {/if}
                    {#if parseInt(schedulerData[type].blocks[i].count) > 0 && parseFloat(schedulerData[type].blocks[i].time) > 0}
                      <span class="block-time-val">約{Math.ceil(parseInt(schedulerData[type].blocks[i].count) * parseFloat(schedulerData[type].blocks[i].time) / 60)}分</span>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}

            {#if typeStats[type].count > 0}
              <div class="type-subtotal">
                計 {typeStats[type].count.toLocaleString()}人 / {typeStats[type].power.toLocaleString()}総力
                {#if typeStats[type].time > 0}
                  / 約{typeStats[type].time}分
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>

    {#if totalPower > 0}
      <div class="text-result">
        <pre>{schedulerText}</pre>
        <button class="copy-btn" on:click={copySchedulerText}>
          {schedulerCopied ? 'コピーした！' : 'テキストコピー'}
        </button>
      </div>
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

  /* スケジューラーサマリー */
  .sched-summary {
    background: #f0f4f8;
    border-radius: 10px;
    padding: 0.75rem;
    margin-bottom: 1rem;
    transition: background 0.3s;
  }

  .sched-summary.achieved {
    background: #e6f4ea;
  }

  .sched-summary-row {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    margin-bottom: 0.4rem;
  }

  .sched-total {
    font-size: 1.4rem;
    font-weight: bold;
    color: #333;
  }

  .sched-sep {
    color: #999;
    font-size: 1rem;
  }

  .sched-target {
    font-size: 1rem;
    color: #666;
  }

  .badge-ok {
    margin-left: 0.3rem;
    background: #27ae60;
    color: white;
    font-size: 0.85rem;
    font-weight: bold;
    padding: 0.1rem 0.5rem;
    border-radius: 12px;
  }

  .progress-track {
    height: 8px;
    background: #ddd;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #4a90d9;
    border-radius: 4px;
    transition: width 0.2s ease;
  }

  .sched-summary.achieved .progress-fill {
    background: #27ae60;
  }

  .sched-remaining {
    margin-top: 0.3rem;
    font-size: 0.85rem;
    color: #666;
    text-align: right;
  }

  .block-order {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex-shrink: 0;
  }

  .order-btn {
    width: 24px;
    height: 18px;
    padding: 0;
    font-size: 0.55rem;
    background: #e8e8e8;
    color: #555;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    line-height: 1;
  }

  .order-btn:disabled {
    opacity: 0.25;
    cursor: default;
  }

  /* スケジューラー本体 */
  .scheduler {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .type-section {
    background: #fafafa;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 0.5rem 0.6rem;
  }

  .type-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.4rem;
  }

  .type-name {
    font-weight: bold;
    font-size: 1rem;
    width: 1.5rem;
    flex-shrink: 0;
  }

  .add-btn {
    margin-left: auto;
    padding: 0.3rem 0.6rem;
    font-size: 0.85rem;
    background: #4a90d9;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    white-space: nowrap;
  }

  .block-col-labels {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-bottom: 0.15rem;
  }

  .block-order-spacer {
    width: 24px;
    flex-shrink: 0;
  }

  .label-col {
    font-size: 0.7rem;
    color: #999;
    width: 62px;
    text-align: center;
    flex-shrink: 0;
  }

  .block-wrap {
    margin-bottom: 0.35rem;
  }

  .block-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .block-input {
    width: 62px;
    padding: 0.35rem 0.3rem;
    font-size: 0.9rem;
    border: 1px solid #ccc;
    border-radius: 5px;
    text-align: center;
    box-sizing: border-box;
  }

  .del-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    font-size: 1rem;
    background: #e0e0e0;
    color: #555;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    flex-shrink: 0;
    line-height: 1;
  }

  .block-info {
    display: flex;
    gap: 0.5rem;
    padding-left: calc(24px + 0.3rem);
    margin-top: 0.1rem;
  }

  .block-power-val {
    font-size: 0.75rem;
    color: #4a90d9;
  }

  .block-time-val {
    font-size: 0.75rem;
    color: #888;
  }

  .type-subtotal {
    margin-top: 0.3rem;
    font-size: 0.8rem;
    color: #555;
    text-align: right;
    border-top: 1px solid #e8e8e8;
    padding-top: 0.3rem;
  }

  /* 共通: 結果テーブル */
  .text-result {
    margin-top: 0.75rem;
    background: #f5f5f5;
    border-radius: 8px;
    padding: 0.75rem;
  }

  .text-result pre {
    margin: 0 0 0.75rem;
    font-size: 0.85rem;
    line-height: 1.6;
    overflow-x: auto;
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

  .approx {
    color: #999;
    font-size: 0.8rem;
    font-weight: normal;
  }

  .table-wrap {
    position: relative;
  }

  .scroll-hint {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    font-size: 1.5rem;
    color: #4a90d9;
    pointer-events: none;
    animation: nudge 1.2s ease-in-out infinite;
    z-index: 1;
  }

  @keyframes nudge {
    0%, 100% { transform: translateY(-50%) translateX(0); }
    50% { transform: translateY(-50%) translateX(4px); }
  }

  .table-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin-bottom: 0.5rem;
  }

  .too-many {
    color: #c0392b;
    font-weight: bold;
    text-align: center;
  }

  .results {
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .results th,
  .results td {
    width: 64px;
    min-width: 64px;
    padding: 0.4rem 0.2rem;
    text-align: center;
    border: 1px solid #ddd;
    white-space: nowrap;
  }

  .results th:first-child,
  .results td:first-child {
    width: 40px;
    min-width: 40px;
    position: sticky;
    left: 0;
    z-index: 1;
  }

  .results th {
    background: #e8e8e8;
    border-color: #ccc;
    font-size: 0.8rem;
  }

  .results th:first-child {
    background: #e8e8e8;
  }

  .results td:first-child {
    background: #f5f5f5;
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
