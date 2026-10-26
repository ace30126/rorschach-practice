// Exner 종합체계 기호 목록. 기호 이름만 담고 규준표나 해석 기준은 담지 않는다.

export const LOCATIONS = ['W', 'D', 'Dd'];
export const DQ = ['+', 'o', 'v/+', 'v'];
export const FQ = ['+', 'o', 'u', '-', 'none'];

export const DETERMINANTS = [
  'F', 'M', 'FM', 'm', 'a', 'p', 'a-p',
  'FC', 'CF', 'C', 'Cn',
  "FC'", "C'F", "C'",
  'FT', 'TF', 'T',
  'FV', 'VF', 'V',
  'FY', 'YF', 'Y',
  'FD', 'Fr', 'rF',
];

export const CONTENTS = [
  'H', '(H)', 'Hd', '(Hd)', 'Hx',
  'A', '(A)', 'Ad', '(Ad)',
  'An', 'Art', 'Ay', 'Bl', 'Bt', 'Cg', 'Cl',
  'Ex', 'Fd', 'Fi', 'Ge', 'Hh', 'Ls', 'Na', 'Sc', 'Sx', 'Xy', 'Id',
];

export const SPECIAL_SCORES = [
  'DV', 'INCOM', 'DR', 'FABCOM', 'ALOG', 'CONTAM',
  'AB', 'AG', 'COP', 'MOR', 'PER', 'CP', 'GHR', 'PHR',
];

// 결정인 칩에서 a, p, a-p는 앞 기호에 붙이고, 나머지는 '.'(혼합반응)로 잇는다
export const SUFFIXES = new Set(['a', 'p', 'a-p']);

export function emptyCode() {
  return { location: '', space: false, dq: '', determinants: '', fq: '', pair: false, contents: '', popular: false, special: '' };
}

export function formatCode(c) {
  if (!c) return '';
  return [
    `${c.location || '?'}${c.space ? 'S' : ''}${c.dq || ''}`,
    `${c.determinants || '?'}${c.fq && c.fq !== 'none' ? c.fq : ''}`,
    c.pair ? '(2)' : '',
    c.contents || '?',
    c.popular ? 'P' : '',
    c.special || '',
  ].filter(Boolean).join(' ');
}

// 순서와 구분자만 다른 경우는 같은 코딩으로 본다. 대소문자는 구분한다(M과 m은 다른 기호).
export function sameSet(a, b) {
  const norm = s => (s || '').split(/[.,\s]+/).filter(Boolean).sort().join('|');
  return norm(a) === norm(b);
}
