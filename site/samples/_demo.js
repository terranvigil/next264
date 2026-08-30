// Shared interactive figure for the style samples: a real 8x8 DCT + quantiser.
// Same code in every sample so the comparison is about style, not features.
(function () {
  const N = 8;
  const C = [];
  for (let u = 0; u < N; u++) {
    C[u] = [];
    for (let x = 0; x < N; x++) {
      C[u][x] = (u === 0 ? Math.SQRT1_2 : 1) * Math.cos(((2 * x + 1) * u * Math.PI) / 16) / 2;
    }
  }

  function dct8x8(block, out) {
    const tmp = new Float32Array(64);
    for (let y = 0; y < N; y++)
      for (let u = 0; u < N; u++) {
        let s = 0;
        for (let x = 0; x < N; x++) s += C[u][x] * block[y * N + x];
        tmp[y * N + u] = s;
      }
    for (let u = 0; u < N; u++)
      for (let v = 0; v < N; v++) {
        let s = 0;
        for (let y = 0; y < N; y++) s += C[v][y] * tmp[y * N + u];
        out[v * N + u] = s;
      }
  }

  function idct8x8(coef, out) {
    const tmp = new Float32Array(64);
    for (let v = 0; v < N; v++)
      for (let y = 0; y < N; y++) {
        let s = 0;
        for (let u = 0; u < N; u++) s += C[u][y] * coef[v * N + u];
        tmp[v * N + y] = s;
      }
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        let s = 0;
        for (let v = 0; v < N; v++) s += C[v][x] * tmp[v * N + y];
        out[x * N + y] = s;
      }
  }

  // Synthetic source frame: gradient, discs, an edge and some grain. Stands in
  // for a real still without dragging a file into the repo.
  function makeSource(w, h) {
    const p = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = 40 + 150 * (x / w) * (1 - 0.4 * (y / h));
        const d1 = Math.hypot(x - w * 0.30, y - h * 0.38);
        const d2 = Math.hypot(x - w * 0.68, y - h * 0.62);
        if (d1 < w * 0.16) v = 225 - 40 * (d1 / (w * 0.16));
        if (d2 < w * 0.11) v = 30 + 30 * (d2 / (w * 0.11));
        if (x > w * 0.80) v = 200;
        if (y > h * 0.84) v = 60 + 90 * Math.abs(Math.sin(x * 0.09));
        v += (Math.sin(x * 2.7) + Math.cos(y * 3.1)) * 4;
        p[y * w + x] = Math.max(0, Math.min(255, v));
      }
    return p;
  }

  function qstep(qp) {
    // Same shape as a real codec: the step doubles every six QP.
    return 0.85 * Math.pow(2, (qp - 4) / 6);
  }

  window.initQuantDemo = function (opts) {
    const cv = document.getElementById(opts.canvas);
    if (!cv) return;
    const slider = document.getElementById(opts.slider);
    const W = 256, H = 192;
    cv.width = W * 2; cv.height = H * 2;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const src = makeSource(W, H);
    const rec = new Float32Array(W * H);
    const blk = new Float32Array(64), coef = new Float32Array(64), out = new Float32Array(64);
    const img = ctx.createImageData(W, H);
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const octx = off.getContext('2d');

    function render(qp) {
      const q = qstep(qp);
      let kept = 0, total = 0, bits = 0;
      for (let by = 0; by < H; by += 8)
        for (let bx = 0; bx < W; bx += 8) {
          for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++) blk[y * 8 + x] = src[(by + y) * W + bx + x] - 128;
          dct8x8(blk, coef);
          for (let i = 0; i < 64; i++) {
            const lvl = Math.round(coef[i] / q);
            total++;
            if (lvl !== 0) { kept++; bits += 2 + 2 * Math.log2(1 + Math.abs(lvl)); }
            coef[i] = lvl * q;
          }
          idct8x8(coef, out);
          for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++)
              rec[(by + y) * W + bx + x] = Math.max(0, Math.min(255, out[y * 8 + x] + 128));
        }
      let se = 0;
      for (let i = 0; i < W * H; i++) { const d = src[i] - rec[i]; se += d * d; }
      const psnr = 10 * Math.log10((255 * 255) / (se / (W * H)));

      const d = img.data;
      for (let i = 0; i < W * H; i++) {
        const v = rec[i] | 0;
        d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(off, 0, 0, cv.width, cv.height);

      const set = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
      set(opts.qpOut, qp);
      set(opts.keptOut, ((kept / total) * 100).toFixed(1) + '%');
      set(opts.bitsOut, (bits / 1024).toFixed(1) + ' kbit');
      set(opts.psnrOut, psnr.toFixed(1) + ' dB');
      const bar = document.getElementById(opts.barOut);
      if (bar) bar.style.width = Math.min(100, (bits / 1024 / 60) * 100) + '%';
    }

    slider.addEventListener('input', () => render(+slider.value));
    render(+slider.value);
  };
})();
