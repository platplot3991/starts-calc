<script lang="ts">
  type Player = {
    name: string;
    seconds: string;
  };

  let setName = '';
  let players: Player[] = [
    { name: '', seconds: '' },
    { name: '', seconds: '' },
    { name: '', seconds: '' },
    { name: '', seconds: '' },
  ];
  let delayIndex: number | null = null;
  let urgent = false;
  let defense = false;

  let result = '';
  let copied = false;

  function formatTime(baseMinSec: number, offsetSeconds: number): string {
    const baseMin = Math.floor(baseMinSec / 100);
    const baseSec = baseMinSec % 100;
    let totalSec = baseMin * 60 + baseSec + offsetSeconds;
    const min = Math.floor(totalSec / 60) % 100;
    const sec = totalSec % 60;
    return String(min).padStart(2, '0') + String(sec).padStart(2, '0');
  }

  function calculate() {
    const valid = players
      .map((p, i) => ({ name: p.name || `P${i + 1}`, sec: parseInt(p.seconds), delay: i === delayIndex }))
      .filter((_, i) => String(players[i].seconds).trim() !== '');

    if (valid.length < 2) {
      result = '2人以上入力してね';
      return;
    }
    if (valid.some(p => isNaN(p.sec) || p.sec <= 0)) {
      result = '行軍時間は正の整数で入力してね';
      return;
    }

    const maxSec = Math.max(...valid.map(p => p.sec));

    // 現在時刻+60秒（お急ぎ時は+30秒）を切り上げて次の分を集結時刻にする（UTC）
    const nowMs = Date.now() + (urgent ? 30000 : 60000);
    const targetMs = Math.ceil(nowMs / 60000) * 60000;
    const baseMin = new Date(targetMs).getUTCMinutes();
    const baseTime = baseMin * 100; // MMSS形式（秒は00）

    const lines = [...valid]
      .sort((a, b) => b.sec - a.sec)
      .map(p => {
        const diff = maxSec - p.sec + (p.delay ? 1 : 0);
        return `${p.name}: ${formatTime(baseTime, diff)}`;
      });

    const parts: string[] = [];
    if (setName.trim()) parts.push(setName.trim());
    parts.push(...lines);

    const delayedPlayer = valid.find(p => p.delay);
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

  async function copyResult() {
    await navigator.clipboard.writeText(result);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<div class="calc">
  <div class="field">
    <label>セット名</label>
    <input type="text" bind:value={setName} placeholder="南砲台" autocomplete="off" />
  </div>

  <table class="players">
    <thead>
      <tr>
        <th>名前</th>
        <th>行軍(秒)</th>
        <th>1秒遅れ</th>
      </tr>
    </thead>
    <tbody>
      {#each players as player, i}
        <tr>
          <td><input type="text" bind:value={player.name} placeholder="呼び名" autocomplete="off" /></td>
          <td><input type="number" bind:value={player.seconds} placeholder="秒" min="1" inputmode="numeric" /></td>
          <td class="radio-cell">
            <input
              type="radio"
              name="delay"
              value={i}
              bind:group={delayIndex}
            />
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if delayIndex !== null}
    <button class="clear-btn" on:click={() => (delayIndex = null)}>1秒遅れ解除</button>
  {/if}

  <label class="urgent-label">
    <input type="checkbox" bind:checked={urgent} />
    お急ぎモード（30秒）
  </label>

  {#if delayIndex !== null}
    <label class="urgent-label">
      <input type="checkbox" bind:checked={defense} />
      防衛に移行
    </label>
  {/if}

  <button class="calc-btn" on:click={calculate}>計算する</button>

  {#if result}
    <div class="result">
      <pre>{result}</pre>
      <button class="copy-btn" on:click={copyResult}>
        {copied ? 'コピーした！' : 'コピー'}
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

  .field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
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

  .players td input[type="text"],
  .players td input[type="number"] {
    width: 100%;
    padding: 0.5rem;
    font-size: 1rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-sizing: border-box;
  }

  .radio-cell {
    text-align: center;
  }

  .radio-cell input[type="radio"] {
    width: 1.2rem;
    height: 1.2rem;
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
