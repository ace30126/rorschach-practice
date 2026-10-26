// 연습용 잉크반점 생성기. 원본 로르샤흐 카드를 쓰지 않기 위해 시드 기반으로 좌우 대칭 반점을 그린다.
// 같은 시드면 항상 같은 그림이 나오므로 세션 저장 시 이미지 대신 시드만 보관한다.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(rnd) {
  const table = new Float32Array(1024);
  for (let i = 0; i < table.length; i++) table[i] = rnd();
  const h = (i, j) => table[((i * 73856093) ^ (j * 19349663)) & 1023];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

export function drawInkblot(canvas, seed) {
  const W = canvas.width, H = canvas.height, half = W / 2;
  const rnd = mulberry32(seed);
  const noise = makeNoise(rnd);

  // 반점 중심들: dx는 대칭축에서의 거리
  const blobs = [];
  for (let k = 0; k < 5; k++) {
    blobs.push({ dx: rnd() * 10, y: H * (0.14 + k * 0.17 + rnd() * 0.05), r: 28 + rnd() * 28, w: 1 });
  }
  const n = 12 + Math.floor(rnd() * 7);
  for (let i = 0; i < n; i++) {
    const dx = 20 + Math.pow(rnd(), 1.2) * half * 0.72;
    blobs.push({ dx, y: H * (0.1 + rnd() * 0.8), r: 22 + rnd() * 52, w: 0.8 + rnd() * 0.5 });
  }
  const splats = 8 + Math.floor(rnd() * 10);
  for (let i = 0; i < splats; i++) {
    blobs.push({ dx: half * (0.35 + rnd() * 0.58), y: H * (0.06 + rnd() * 0.88), r: 5 + rnd() * 8, w: 1 });
  }
  const T = 0.35; // 잉크로 칠할 농도 문턱값

  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const px = img.data;
  const put = (x, y, r, g, b) => {
    const i = (y * W + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < half; x++) {
      const dx = half - x - 0.5;
      // 반경 밖에서는 0이 되는 커널이라 반점들이 서로 다 붙지 않고 빈 공간(S)이 생긴다
      let f = 0;
      for (const b of blobs) {
        const ddx = dx - b.dx, ddy = y - b.y;
        const q = 1 - (ddx * ddx + ddy * ddy) / (b.r * b.r);
        if (q > 0) f += b.w * q * q;
      }
      f += (noise(x / 40, y / 40) - 0.5) * 0.3 + (noise(x / 9 + 50, y / 9 + 50) - 0.5) * 0.14;

      let r = 248, g = 246, bl = 240;
      if (f > T) {
        // 농도 차이를 줘서 음영(Y, V) 반응이 나올 여지를 만든다. 가장자리는 옅고 중심은 진하다.
        const shade = noise(x / 70 + 10, y / 70 + 10);
        const thin = Math.max(0, 1 - (f - T) / 0.9);
        const v = Math.max(18, Math.min(150, Math.round(22 + 70 * thin + 60 * shade * thin)));
        r = v; g = v; bl = v + 3;
      }
      put(x, y, r, g, bl);
      put(W - 1 - x, y, r, g, bl);
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function canvasToBase64(canvas) {
  return canvas.toDataURL('image/png').split(',')[1];
}
