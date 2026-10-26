// 데모 모드: API 키 없이 화면 흐름을 체험하도록 미리 써 둔 수검자 응답과 피드백을 돌려준다.
// 검사자 질문을 이해하지 않는다. 낱말 몇 개만 보고 정해진 대답 중 하나를 고른다.

const RESPONSES = [
  {
    text: '박쥐... 날개가 찢어진 박쥐 같아요.',
    keys: ['박쥐', '날개', '첫'],
    hidden: { area: '반점 전체', location: 'W', determinants: "FC'", contents: 'A', reason: '양쪽으로 펼친 모양이 날개 같고, 검은색이라 박쥐로 봤다. 가장자리가 들쭉날쭉해서 찢어졌다고 느꼈다.' },
    where: '전체요... 여기 양쪽이 날개고, 가운데가 몸통이요.',
    why: '모양이 날개 편 것 같고... 색이 까매서요. 끝이 뜯어진 것처럼 삐죽삐죽하고요.',
    reference: { location: 'W', space: false, dq: 'o', determinants: "FC'", fq: 'o', pair: false, contents: 'A', popular: false, special: 'MOR' },
    comment: '검은색을 근거로 말했으므로 무채색 결정인(C\')이 들어갑니다. "찢어진"은 손상된 대상이라 MOR입니다.',
  },
  {
    text: '가운데... 뭔가 뚝뚝 떨어지는 것 같아요. 그림자처럼요.',
    keys: ['가운데', '떨어', '그림자', '두'],
    hidden: { area: '가운데 진한 세로 줄기', location: 'D', determinants: 'mp.YF', contents: 'Id', reason: '진한 부분에서 옅은 부분으로 번진 모양이 물방울이 떨어지는 것 같았다. 진하고 옅은 차이를 그림자로 느꼈다.' },
    where: '여기 가운데 진한 줄이요. 위에서 아래로요.',
    why: '진한 데서 연해지는 게... 물이 흘러내리는 것 같았어요. 그늘진 것처럼 보이기도 하고.',
    reference: { location: 'D', space: false, dq: 'o', determinants: 'mp.YF', fq: 'u', pair: false, contents: 'Id', popular: false, special: '' },
    comment: '무생물이 떨어지는 움직임(mp)과 음영(Y)이 함께 나옵니다. 형태보다 음영을 먼저 말했으므로 YF입니다.',
  },
  {
    text: '아래쪽 양옆에... 시든 나뭇잎이요. 두 개.',
    keys: ['아래', '나뭇잎', '잎', '세'],
    hidden: { area: '아래쪽 좌우 작은 반점', location: 'D', determinants: "FC'", contents: 'Bt', reason: '끝이 말린 잎 모양이고 색이 거무스름해서 시든 잎으로 봤다. 양쪽에 하나씩 있다.' },
    where: '여기 아래 양쪽이요. 하나씩.',
    why: '끝이 동그랗게 말려 있고... 색이 거뭇해서 말라 죽은 잎 같았어요.',
    reference: { location: 'D', space: false, dq: 'o', determinants: "FC'", fq: 'u', pair: true, contents: 'Bt', popular: false, special: 'MOR' },
    comment: '좌우 같은 대상을 둘로 봤으므로 쌍반응(2)입니다. "시든"은 MOR에 해당합니다.',
  },
];

// 결정인을 넌지시 제시하는 질문. 수검자는 근거와 달라도 동의한다.
const LEADING = /(색깔|색|움직|그림자|입체|질감|맞나요|인가요\?)/;
const OPEN = /(무엇|뭐|어떤|어디|어느)/;
const ASK_WHERE = /(어디|위치|어느 부분|보여\s?주)/;
const ASK_WHY = /(무엇 때문|뭐 때문|무엇이|어떤 점|어떻게|왜|그렇게 보)/;
const ASK_MORE = /(또|더|다른)/;

const isLeading = text => LEADING.test(text) && !OPEN.test(text);

const wait = ms => new Promise(r => setTimeout(r, ms));
const reply = (say, newOnes = []) => ({
  say,
  new_responses: newOnes.map(r => ({ text: r.text, hidden_basis: r.hidden })),
});

function targetIndex(session, text) {
  const m = text.match(/반응\s*(\d+)/);
  if (m) return Math.min(Number(m[1]) - 1, session.responses.length - 1);
  const shown = RESPONSES.slice(0, session.responses.length);
  const hit = shown.findIndex(r => r.keys.some(k => text.includes(k)));
  if (hit >= 0) return hit;
  // 지목이 없으면 질문 단계에서 몇 번째로 묻는지에 따라 차례로 돌린다
  const asked = session.turns.filter(t => t.role === 'examiner' && t.phase === 'inquiry').length;
  return Math.max(0, Math.floor((asked - 1) / 2)) % session.responses.length;
}

export async function mockPersonaReply(session, text) {
  await wait(700 + Math.random() * 600);
  const given = session.responses.length;

  if (session.phase === 'response') {
    if (given === 0) return reply('음... 박쥐... 날개가 찢어진 박쥐 같아요. 그리고 가운데는... 뭔가 뚝뚝 떨어지는 것 같아요.', RESPONSES.slice(0, 2));
    if (given === 2 && ASK_MORE.test(text)) return reply('아래쪽 양옆에... 시든 나뭇잎이요. 두 개.', [RESPONSES[2]]);
    return reply('이게 다인 것 같아요...');
  }

  // 질문 단계
  const asked = session.turns.filter(t => t.role === 'examiner' && t.phase === 'inquiry').length;
  if (given === 0 || (asked === 1 && !ASK_WHERE.test(text) && !ASK_WHY.test(text))) return reply('네...');
  const r = RESPONSES[targetIndex(session, text)];
  if (isLeading(text)) return reply('아... 그런 것 같기도 해요.');
  if (ASK_WHERE.test(text)) return reply(r.where);
  if (ASK_WHY.test(text)) return reply(r.why);
  return reply('네... 그냥 그렇게 보였어요.');
}

export async function mockFeedback(session) {
  await wait(1500);
  const examinerTurns = session.turns
    .map((t, i) => ({ ...t, turn: i + 1 }))
    .filter(t => t.role === 'examiner' && t.phase === 'inquiry');

  const inquiry = examinerTurns.map(t => {
    if (isLeading(t.text)) {
      return { turn: t.turn, quote: t.text, kind: '유도 질문', comment: '결정인을 먼저 제시했습니다. 이 수검자는 근거와 달라도 동의하는 경향이 있어 채점이 오염될 수 있습니다. "어떤 점이 그렇게 보이게 했나요?"처럼 열어서 물어보세요.' };
    }
    if (ASK_WHERE.test(t.text) || ASK_WHY.test(t.text)) {
      return { turn: t.turn, quote: t.text, kind: '좋은 질문', comment: '위치나 근거를 열린 질문으로 확인했습니다.' };
    }
    return { turn: t.turn, quote: t.text, kind: '기타', comment: '채점에 필요한 정보(위치, 결정인)를 직접 묻지 않는 발화입니다.' };
  });
  if (!examinerTurns.some(t => ASK_WHERE.test(t.text))) {
    inquiry.push({ turn: session.turns.length, quote: '(위치 질문 없음)', kind: '놓친 질문', comment: '반응마다 어디에서 보였는지 확인해야 위치(W/D/Dd)를 채점할 수 있습니다.' });
  }

  const leading = inquiry.filter(q => q.kind === '유도 질문').length;
  return {
    per_response: session.responses.map((r, i) => {
      const src = RESPONSES.find(x => x.text === r.text) || RESPONSES[i] || RESPONSES[0];
      return { index: i + 1, reference: src.reference, comment: src.comment };
    }),
    inquiry,
    summary: `[데모 피드백] 반응 ${session.responses.length}개를 채점했습니다. 질문 단계 발화 ${examinerTurns.length}개 중 유도 질문 ${leading}개. 이 피드백은 미리 써 둔 예시이며 실제 AI 평가가 아닙니다.`,
    persona_note: '반응 수가 적고, 검은색과 음영에 주목하며, 손상된 대상(MOR)을 보는 것은 우울 경향 수검자를 흉내 낸 설정입니다. 유도 질문에 쉽게 동의하는 성격도 설정에 들어 있습니다.',
  };
}
