const MODEL_URL = 'https://oasoobi.github.io/playground/quickdrawmodoki/model.json';

const CLASSES = ["cat", "dog", "fish", "house", "tree", "car", "airplane", "bicycle", "umbrella", "flower", "bread", "horse", "apple", "bird", "banana", "book", "bridge", "cake", "candle", "leaf", "clock", "star"];

const JA_MAP = {
    cat: '猫', dog: '犬', fish: '魚', house: '家', tree: '木',
    car: '車', airplane: '飛行機', bicycle: '自転車', umbrella: '傘', flower: '花',
    bird: '鳥', apple: 'りんご', banana: 'バナナ', boat: 'ボート', book: '本',
    bridge: '橋', butterfly: '蝶', cake: 'ケーキ', camera: 'カメラ', candle: 'ろうそく',
    chair: '椅子', clock: '時計', cloud: '雲', coffee: 'コーヒー', crown: '王冠',
    cup: 'カップ', diamond: 'ダイヤ', door: 'ドア', elephant: '象', eye: '目',
    face: '顔', fire: '炎', fork: 'フォーク', guitar: 'ギター', hammer: 'ハンマー',
    hand: '手', hat: '帽子', heart: 'ハート', horse: '馬', key: '鍵',
    knife: 'ナイフ', ladder: 'はしご', leaf: '葉', lion: 'ライオン', moon: '月',
    mountain: '山', mouse: 'マウス', mushroom: 'きのこ', pencil: '鉛筆', pizza: 'ピザ',
    rabbit: 'うさぎ', rainbow: '虹', ring: '指輪', rocket: 'ロケット', scissors: 'はさみ',
    shoe: '靴', star: '星', sun: '太陽', sword: '剣', table: 'テーブル',
    telephone: '電話', tiger: '虎', train: '電車', truck: 'トラック', turtle: '亀',
    watch: '時計', whale: 'クジラ', wheel: '車輪', window: '窓', wolf: '狼',
    bread: "パン"
};

function toJa(en) {
    return JA_MAP[en] ?? en;
}

let model = null;
let currentIdx = 0;
let tool = 'pen';
let isDrawing = false;
let timeLeft = 20;
let timerInterval = null;
let classifyInterval = null;
let score = { c: 0, w: 0 };
let answered = false;
const CIRCUMFERENCE = 2 * Math.PI * 26; // ≈163

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.lineCap = 'round';
ctx.lineJoin = 'round';

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy };
}

canvas.addEventListener('mousedown', e => { isDrawing = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); });
canvas.addEventListener('mousemove', e => {
    if (!isDrawing) return;
    applyTool(getPos(e));
});
canvas.addEventListener('mouseup', () => isDrawing = false);
canvas.addEventListener('mouseleave', () => isDrawing = false);
canvas.addEventListener('touchstart', e => { e.preventDefault(); isDrawing = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); }, { passive: false });
canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!isDrawing) return;
    applyTool(getPos(e));
}, { passive: false });
canvas.addEventListener('touchend', () => isDrawing = false);

function applyTool(p) {
    const size = 16
    ctx.lineWidth = tool === 'eraser' ? size * 3 : size;
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : '#111111';
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
}

function setTool(t) {
    tool = t;
    document.getElementById('penBtn').classList.toggle('active', t === 'pen');
    document.getElementById('eraserBtn').classList.toggle('active', t === 'eraser');
}

function clearCanvas() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function getDrawingBounds(imgData, width, height, threshold = 200) {
    const data = imgData.data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let dark = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            if (data[i] < threshold) {
                dark++;
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (maxX < 0 || maxY < 0) return null;
    return { minX, minY, maxX, maxY, dark };
}

async function loadModel() {
    try {
        animateProgress();

        model = await tf.loadGraphModel(MODEL_URL);
        const dummy = tf.zeros([1, 28, 28, 1]);
        model.predict(dummy).dispose();
        dummy.dispose();

        document.getElementById('loadingCard').style.display = 'none';
        newRound();
        startClassify();
    } catch (e) {
        document.getElementById('loadingText').textContent = 'モデル読み込みに失敗しました。再読み込みを試してください';
        console.error(e);
    }
}

function animateProgress() {
    let w = 0;
    const bar = document.getElementById('progressBar');
    const iv = setInterval(() => {
        w = Math.min(w + Math.random() * 8, 88);
        bar.style.width = w + '%';
        if (w >= 88) clearInterval(iv);
    }, 200);
}

function newRound() {
    answered = false;
    currentIdx = Math.floor(Math.random() * CLASSES.length);
    document.getElementById('promptWord').textContent = toJa(CLASSES[currentIdx]);
    clearCanvas();
    resetTimer();
    renderConfBars([]);
}

function nextRound() {
    document.getElementById('resultOverlay').classList.remove('show');
    newRound();
}

function resetTimer() {
    clearInterval(timerInterval);
    timeLeft = 20;
    updateTimerUI();
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerUI();
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            if (!answered) timeUp();
        }
    }, 1000);
}

function updateTimerUI() {
    const pct = timeLeft / 20;
    const offset = CIRCUMFERENCE * (1 - pct);
    document.getElementById('timerArc').style.strokeDashoffset = offset;
    document.getElementById('timerNum').textContent = timeLeft;
    const arc = document.getElementById('timerArc');
    if (pct < 0.3) arc.style.stroke = '#e63946';
    else if (pct < 0.6) arc.style.stroke = '#f4a261';
    else arc.style.stroke = '#2d6a4f';
}

function timeUp() {
    answered = true;
    score.w++;
    document.getElementById('wScore').textContent = score.w;
    showResult(false, '時間切れ！', `お題は「${toJa(CLASSES[currentIdx])}」でした`);
}

function startClassify() {
    classifyInterval = setInterval(async () => {
        if (!model || answered) return;

        try {
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const bounds = getDrawingBounds(imgData, canvas.width, canvas.height);
            if (!bounds || bounds.dark < 20) {
                renderConfBars([]);
                return;
            }

            const preds = await classify(bounds);
            renderConfBars(preds);

            const matchPred = preds.find(p => p.idx === currentIdx);
            if (matchPred && matchPred.prob > 0.4 && !answered) {
                answered = true;
                clearInterval(timerInterval);
                score.c++;
                document.getElementById('cScore').textContent = score.c;
                const pct = (matchPred.prob * 100).toFixed(0);
                showResult(true, '正解！🎉', `「${toJa(CLASSES[currentIdx])}」を ${pct}% の確信で当てた！`);
            }
        } catch (e) {
            console.error('classify loop error', e);
            renderConfBars([]);
        }
    }, 700);
}

async function classify(bounds) {
    const processedTensor = tf.tidy(() => {
        let t = tf.browser.fromPixels(canvas, 1);
        t = tf.scalar(255).sub(t); // 白黒反転

        const h = bounds.maxY - bounds.minY + 1;
        const w = bounds.maxX - bounds.minX + 1;

        // 2. 切り抜く
        let cropped = t.slice([bounds.minY, bounds.minX, 0], [h, w, 1]);

        // 3. 縦横比を保って正方形にする（パディング）
        const size = Math.max(h, w);
        const padY = Math.floor((size - h) / 2);
        const padX = Math.floor((size - w) / 2);

        t = cropped.pad([
            [padY, size - h - padY],
            [padX, size - w - padX],
            [0, 0]
        ]);

        // 4. 28x28にリサイズ（ここでAIに最適な大きさになる）
        return t.resizeNearestNeighbor([28, 28])
            .toFloat()
            .div(255.0)
            .reshape([1, 28, 28, 1]);
    });

    const rawOutput = model.predict(processedTensor);
    const output = Array.isArray(rawOutput) ? rawOutput[0] : rawOutput;
    const probs = await output.data();

    processedTensor.dispose();
    output.dispose();

    return CLASSES.map((cls, i) => ({ idx: i, cls: cls, prob: probs[i] }))
        .sort((a, b) => b.prob - a.prob)
        .slice(0, 5);
}

function renderConfBars(preds) {
    const overlay = document.getElementById('confOverlay');
    if (preds.length === 0) {
        overlay.innerHTML = '';
        return;
    }
    overlay.innerHTML = preds.map((p, i) => {
        const isMatch = p.idx === currentIdx;
        const pct = (p.prob * 100).toFixed(1);
        const barW = Math.min(p.prob * 100 * 1.2, 100);
        return `
      <div class="conf-row visible" style="transition-delay:${i * 0.04}s">
        <div class="conf-label ${isMatch ? 'match' : ''}">${toJa(p.cls)}</div>
        <div class="conf-bar-wrap">
          <div class="conf-bar ${isMatch ? 'match' : ''}" style="width:${barW}%"></div>
        </div>
        <div class="conf-pct ${isMatch ? 'match' : ''}">${pct}%</div>
      </div>`;
    }).join('');
}

function showResult(correct, title, detail) {
    document.getElementById('resEmoji').textContent = correct ? '🎉' : '⏰';
    const t = document.getElementById('resTitle');
    t.textContent = title;
    t.className = 'result-title ' + (correct ? 'correct' : 'wrong');
    document.getElementById('resDetail').textContent = detail;
    document.getElementById('resultOverlay').classList.add('show');
}

loadModel();
showAboutDialog();