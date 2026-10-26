import { drawInkblot, canvasToBase64 } from './inkblot.js';
import { personaById, personaSystem, PERSONA_SCHEMA, feedbackSystem, FEEDBACK_SCHEMA } from './persona.js';
import { callClaude, MODELS } from './llm.js';
import { mockPersonaReply, mockFeedback } from './mock.js';
import { LOCATIONS, DQ, FQ, DETERMINANTS, CONTENTS, SPECIAL_SCORES, SUFFIXES, emptyCode, formatCode, sameSet } from './scoring.js';

const LS_SETTINGS = 'rp.settings';
const LS_SESSION = 'rp.session';
const PHASES = ['response', 'inquiry', 'scoring', 'feedback'];
const PHASE_LABEL = { response: '반응 단계', inquiry: '질문 단계' };

const HINTS = {
  response: '지시문 예: "이게 무엇으로 보이나요?" 수검자가 말을 마칠 때까지 기다리고, 더 묻고 싶으면 "또 보이는 게 있나요?"처럼 중립적으로 물어보세요.',
  inquiry: '먼저 안내하세요: "보신 것을 저도 똑같이 볼 수 있도록 어디서, 무엇 때문에 그렇게 보였는지 여쭤볼게요." 그다음 반응을 그대로 읽어주고 열린 질문으로 물어보세요. "색깔 때문인가요?" 같은 유도 질문은 피하세요.',
};

// ---------- 저장소 (실패해도 앱은 동작) ----------
function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 불가 환경 */ }
}

function newSession() {
  return {
    seed: Math.floor(Math.random() * 1e9),
    personaId: 'depressed-student',
    phase: 'response',
    turns: [],       // { role: 'examiner'|'client', phase, text, raw? }
    responses: [],   // { text, hidden }
    codes: [],       // 학생 채점, responses와 같은 순서
    feedback: null,
  };
}

let settings = { apiKey: '', model: MODELS[0].id, tts: true, autoSend: true, demo: false, ...load(LS_SETTINGS, {}) };
let session = load(LS_SESSION, null) || newSession();
let busy = false;

const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
};

const persona = () => personaById(session.personaId);
const persist = () => save(LS_SESSION, session);

// ---------- 카드 ----------
const canvas = $('card');
function drawCard() { drawInkblot(canvas, session.seed); }

// ---------- 음성 출력 ----------
function speak(text) {
  if (!settings.tts || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  const voice = speechSynthesis.getVoices().find(v => v.lang && v.lang.startsWith('ko'));
  if (voice) u.voice = voice;
  u.rate = persona().voice.rate;
  u.pitch = persona().voice.pitch;
  speechSynthesis.speak(u);
}

// ---------- 음성 입력 (브라우저 Web Speech API) ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
function toggleMic() {
  if (recognizer) { recognizer.stop(); return; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const input = $('examinerInput');
  const rec = new SR();
  rec.lang = 'ko-KR';
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = e => {
    input.value = Array.from(e.results).map(r => r[0].transcript).join('');
  };
  rec.onerror = e => {
    if (e.error === 'not-allowed') showError('마이크 권한이 필요합니다. 브라우저 주소창에서 마이크를 허용해 주세요.');
  };
  rec.onend = () => {
    recognizer = null;
    $('micBtn').classList.remove('listening');
    if (settings.autoSend && input.value.trim()) sendExaminer(input.value.trim());
  };
  recognizer = rec;
  $('micBtn').classList.add('listening');
  rec.start();
}

// ---------- LLM 메시지 구성 ----------
function cardImageBlock() {
  return { type: 'image', source: { type: 'base64', media_type: 'image/png', data: canvasToBase64(canvas) } };
}

function buildPersonaMessages() {
  const messages = [];
  session.turns.forEach((t, i) => {
    if (t.role === 'examiner') {
      const text = `[${PHASE_LABEL[t.phase]}] 검사자: ${t.text}`;
      messages.push({ role: 'user', content: i === 0 ? [cardImageBlock(), { type: 'text', text }] : text });
    } else {
      messages.push({ role: 'assistant', content: t.raw });
    }
  });
  return messages;
}

// 키가 없거나 데모를 켜면 미리 써 둔 응답으로 동작한다
const isDemo = () => settings.demo || !settings.apiKey;

function ensureKey() {
  if (isDemo() || settings.apiKey) return true;
  openSettings();
  showError('먼저 설정에서 Anthropic API 키를 입력해 주세요.');
  return false;
}

async function sendExaminer(text) {
  if (busy || !text || !ensureKey()) return;
  hideError();
  const phase = session.phase;
  session.turns.push({ role: 'examiner', phase, text });
  $('examinerInput').value = '';
  busy = true;
  render();
  try {
    const reply = isDemo() ? await mockPersonaReply(session, text) : await callClaude({
      apiKey: settings.apiKey,
      model: settings.model,
      system: personaSystem(persona()),
      messages: buildPersonaMessages(),
      schema: PERSONA_SCHEMA,
      effort: 'low',
    });
    session.turns.push({ role: 'client', phase, text: reply.say, raw: JSON.stringify(reply) });
    if (phase === 'response') {
      for (const r of reply.new_responses || []) {
        session.responses.push({ text: r.text, hidden: r.hidden_basis });
        session.codes.push(emptyCode());
      }
    }
    speak(reply.say);
  } catch (err) {
    session.turns.pop();
    $('examinerInput').value = text;
    showError(err.message);
  } finally {
    busy = false;
    persist();
    render();
  }
}

async function requestFeedback() {
  if (busy || !ensureKey()) return;
  hideError();
  busy = true;
  session.phase = 'feedback';
  session.feedback = null;
  render();

  const transcript = session.turns
    .map((t, i) => `#${i + 1} [${PHASE_LABEL[t.phase]}] ${t.role === 'examiner' ? '검사자' : '수검자'}: ${t.text}`)
    .join('\n');
  const responses = session.responses
    .map((r, i) => `반응 ${i + 1}: ${r.text}\n  hidden_basis: ${JSON.stringify(r.hidden)}`)
    .join('\n');
  const codes = session.codes
    .map((c, i) => `반응 ${i + 1}: ${formatCode(c)}\n  필드: ${JSON.stringify(c)}`)
    .join('\n');

  try {
    session.feedback = isDemo() ? await mockFeedback(session) : await callClaude({
      apiKey: settings.apiKey,
      model: settings.model,
      system: feedbackSystem(persona()),
      messages: [{
        role: 'user',
        content: [
          cardImageBlock(),
          { type: 'text', text: `## 녹취\n${transcript}\n\n## 반응 목록\n${responses}\n\n## 학생 채점\n${codes}` },
        ],
      }],
      schema: FEEDBACK_SCHEMA,
      effort: 'high',
    });
  } catch (err) {
    session.phase = 'scoring';
    showError(err.message);
  } finally {
    busy = false;
    persist();
    render();
  }
}

// ---------- 렌더링 ----------
function render() {
  const current = PHASES.indexOf(session.phase);
  document.querySelectorAll('#stepper li').forEach(li => {
    const idx = PHASES.indexOf(li.dataset.phase);
    li.className = idx === current ? 'current' : idx < current ? 'done' : '';
  });

  $('demoBanner').hidden = !isDemo();
  $('referral').textContent = persona().referral;
  renderResponseSheet();

  const practicing = session.phase === 'response' || session.phase === 'inquiry';
  $('practicePane').hidden = !practicing;
  $('scoringPane').hidden = session.phase !== 'scoring';
  $('feedbackPane').hidden = session.phase !== 'feedback';

  if (practicing) renderPractice();
  if (session.phase === 'scoring') renderScoring();
  if (session.phase === 'feedback') renderFeedback();
}

function renderResponseSheet() {
  const list = $('responseSheet');
  list.replaceChildren(...session.responses.map(r => el('li', {}, r.text)));
  $('responseEmpty').hidden = session.responses.length > 0;
}

function renderPractice() {
  $('hint').textContent = HINTS[session.phase];
  const log = $('chatLog');
  const items = [];
  let lastPhase = null;
  for (const t of session.turns) {
    if (t.phase !== lastPhase) {
      items.push(el('div', { class: 'phase-divider' }, `- ${PHASE_LABEL[t.phase]} -`));
      lastPhase = t.phase;
    }
    items.push(el('div', { class: `msg ${t.role}` },
      el('span', { class: 'who' }, t.role === 'examiner' ? '검사자(나)' : '수검자'),
      t.text));
  }
  if (busy) items.push(el('div', { class: 'typing' }, '수검자가 생각하는 중...'));
  log.replaceChildren(...items);
  log.scrollTop = log.scrollHeight;

  $('sendBtn').disabled = busy;
  $('micBtn').disabled = busy;
  $('micBtn').hidden = !SR;
  $('toInquiryBtn').hidden = session.phase !== 'response';
  $('toInquiryBtn').disabled = busy || session.responses.length === 0;
  $('toScoringBtn').hidden = session.phase !== 'inquiry';
  $('toScoringBtn').disabled = busy;
}

function chipRow(options, onPick) {
  return el('div', { class: 'chips' }, options.map(o => el('button', { type: 'button', class: 'chip', onclick: () => onPick(o) }, o)));
}

function renderScoring() {
  const list = $('scoringList');
  if (session.responses.length === 0) {
    list.replaceChildren(el('p', { class: 'muted' }, '채점할 반응이 없습니다.'));
    return;
  }
  list.replaceChildren(...session.responses.map((r, i) => scoreCard(r, i)));
  $('feedbackBtn').disabled = busy;
}

function scoreCard(r, i) {
  const c = session.codes[i];
  const preview = el('div', { class: 'code-preview' }, formatCode(c));
  const update = () => { preview.textContent = formatCode(c); persist(); };

  const select = (field, options) => el('select', { onchange: e => { c[field] = e.target.value; update(); } },
    el('option', { value: '' }, '선택'),
    options.map(o => el('option', { value: o, selected: c[field] === o }, o)));
  const check = (field, label) => el('label', { class: 'small' },
    el('input', { type: 'checkbox', checked: c[field], onchange: e => { c[field] = e.target.checked; update(); } }), ` ${label}`);
  const text = (field, placeholder) => el('input', {
    type: 'text', value: c[field], placeholder,
    oninput: e => { c[field] = e.target.value; update(); },
  });

  const detInput = text('determinants', '예: FC\'.FMp');
  const contentInput = text('contents', '예: A, Na');
  const specialInput = text('special', '예: MOR');
  const append = (input, field, token, sep) => {
    const cur = c[field].trim();
    c[field] = cur ? `${cur}${sep}${token}` : token;
    input.value = c[field];
    update();
  };

  return el('div', { class: 'score-card' },
    el('h3', {}, `반응 ${i + 1}. ${r.text}`),
    el('div', { class: 'score-row' }, el('label', {}, '위치'), select('location', LOCATIONS), check('space', '공백(S)')),
    el('div', { class: 'score-row' }, el('label', {}, '발달질'), select('dq', DQ)),
    el('div', { class: 'score-row' }, el('label', {}, '결정인'), detInput),
    chipRow(DETERMINANTS, t => append(detInput, 'determinants', t, SUFFIXES.has(t) ? '' : '.')),
    el('div', { class: 'score-row' }, el('label', {}, '형태질'), select('fq', FQ), check('pair', '쌍반응(2)')),
    el('div', { class: 'score-row' }, el('label', {}, '내용'), contentInput),
    chipRow(CONTENTS, t => append(contentInput, 'contents', t, ', ')),
    el('div', { class: 'score-row' }, el('label', {}, '평범'), check('popular', '평범반응(P)')),
    el('div', { class: 'score-row' }, el('label', {}, '특수점수'), specialInput),
    chipRow(SPECIAL_SCORES, t => append(specialInput, 'special', t, ', ')),
    preview);
}

function compareRow(label, mine, ref, same) {
  return el('tr', {},
    el('th', {}, label),
    el('td', { class: same ? 'ok' : 'diff' }, mine || '-'),
    el('td', {}, ref || '-'));
}

const yesNo = b => (b ? '예' : '아니오');
const KIND_CLASS = { '유도 질문': 'lead', '놓친 질문': 'miss', '좋은 질문': 'good', '기타': 'etc' };

function renderFeedback() {
  const pane = $('feedbackPane');
  const fb = session.feedback;
  if (!fb) {
    pane.replaceChildren(el('p', { class: 'hint' }, busy ? '감독자가 기록을 검토하는 중입니다. 30초~1분 정도 걸릴 수 있습니다.' : '피드백이 없습니다.'));
    return;
  }

  const perResponse = session.responses.map((r, i) => {
    const item = fb.per_response.find(p => p.index === i + 1) || fb.per_response[i];
    const mine = session.codes[i];
    const ref = item?.reference;
    const rows = ref ? [
      compareRow('위치', `${mine.location}${mine.space ? 'S' : ''}`, `${ref.location}${ref.space ? 'S' : ''}`,
        mine.location === ref.location && mine.space === ref.space),
      compareRow('발달질', mine.dq, ref.dq, mine.dq === ref.dq),
      compareRow('결정인', mine.determinants, ref.determinants, sameSet(mine.determinants, ref.determinants)),
      compareRow('형태질', mine.fq, ref.fq, mine.fq === ref.fq),
      compareRow('쌍반응', yesNo(mine.pair), yesNo(ref.pair), mine.pair === ref.pair),
      compareRow('내용', mine.contents, ref.contents, sameSet(mine.contents, ref.contents)),
      compareRow('평범', yesNo(mine.popular), yesNo(ref.popular), mine.popular === ref.popular),
      compareRow('특수점수', mine.special, ref.special, sameSet(mine.special, ref.special)),
    ] : [];
    return el('div', { class: 'score-card' },
      el('h3', {}, `반응 ${i + 1}. ${r.text}`),
      el('table', { class: 'compare' },
        el('thead', {}, el('tr', {}, el('th', {}, '항목'), el('th', {}, '내 채점'), el('th', {}, '참고 채점'))),
        el('tbody', {}, rows)),
      el('p', {}, item?.comment || ''),
      el('div', { class: 'basis' },
        el('strong', {}, '수검자가 실제로 본 근거: '),
        `${r.hidden.area} / ${r.hidden.location} ${r.hidden.determinants} ${r.hidden.contents} - ${r.hidden.reason}`));
  });

  const inquiry = fb.inquiry.map(q => el('div', { class: 'inquiry-item' },
    el('span', { class: `badge ${KIND_CLASS[q.kind] || 'etc'}` }, q.kind),
    el('span', { class: 'muted small' }, `#${q.turn} `),
    el('q', {}, q.quote),
    el('p', {}, q.comment)));

  pane.replaceChildren(
    el('div', { class: 'fb-section box' }, el('h2', {}, '총평'), el('p', {}, fb.summary)),
    el('div', { class: 'fb-section' }, el('h2', {}, '채점 비교'),
      el('p', { class: 'muted small' }, '참고 채점은 AI의 의견이며 정답이 아닙니다. 자체 제작 카드라 형태질은 추정이고 평범반응은 판정하지 않습니다.'),
      perResponse),
    el('div', { class: 'fb-section box' }, el('h2', {}, '질문 기법'), inquiry),
    el('div', { class: 'fb-section box' }, el('h2', {}, '수검자 설정 공개'),
      el('p', {}, persona().referral), el('p', {}, fb.persona_note)),
    el('div', { class: 'phase-actions' },
      el('button', { type: 'button', class: 'ghost', onclick: () => { session.phase = 'scoring'; persist(); render(); } }, '채점 수정하기'),
      el('button', { type: 'button', onclick: startNewSession }, '새 세션 시작')));
}

// ---------- 오류 표시 ----------
function showError(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; }
function hideError() { $('toast').hidden = true; }

// ---------- 설정 ----------
function openSettings() {
  $('apiKeyInput').value = settings.apiKey;
  $('modelSelect').replaceChildren(...MODELS.map(m => el('option', { value: m.id, selected: m.id === settings.model }, m.label)));
  $('ttsCheck').checked = settings.tts;
  $('autoSendCheck').checked = settings.autoSend;
  $('demoCheck').checked = settings.demo;
  $('settingsDialog').showModal();
}

$('settingsDialog').addEventListener('close', () => {
  if ($('settingsDialog').returnValue !== 'save') return;
  settings = {
    apiKey: $('apiKeyInput').value.trim(),
    model: $('modelSelect').value,
    tts: $('ttsCheck').checked,
    autoSend: $('autoSendCheck').checked,
    demo: $('demoCheck').checked,
  };
  save(LS_SETTINGS, settings);
  hideError();
  render();
});

function startNewSession() {
  if (session.turns.length && session.phase !== 'feedback' && !confirm('진행 중인 연습을 지우고 새로 시작할까요?')) return;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  session = newSession();
  persist();
  drawCard();
  hideError();
  render();
}

// ---------- 이벤트 ----------
$('settingsBtn').addEventListener('click', openSettings);
$('newSessionBtn').addEventListener('click', startNewSession);
$('micBtn').addEventListener('click', toggleMic);
$('inputForm').addEventListener('submit', e => {
  e.preventDefault();
  sendExaminer($('examinerInput').value.trim());
});
$('toInquiryBtn').addEventListener('click', () => { session.phase = 'inquiry'; persist(); render(); });
$('toScoringBtn').addEventListener('click', () => { session.phase = 'scoring'; persist(); render(); });
$('backToInquiryBtn').addEventListener('click', () => { session.phase = 'inquiry'; persist(); render(); });
$('feedbackBtn').addEventListener('click', requestFeedback);

// 피드백 요청 중에 창을 닫았다면 채점 단계로 되돌린다
if (session.phase === 'feedback' && !session.feedback) session.phase = 'scoring';

drawCard();
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* 오프라인 캐시 없이도 동작 */ });
}
