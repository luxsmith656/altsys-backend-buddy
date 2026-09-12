import { expect, test, type Locator } from '@playwright/test';
import { attachRuntimeMonitor } from '../support/runtime-monitor';

async function renderedFog(scene: Locator, screenshot: Buffer, edges: number[]) {
  // Decode the browser screenshot, not the source textures: alpha already includes
  // CSS masks, clipping, opacity and blending from the real compositor.
  return scene.evaluate(async (_, { base64, edges }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const columns = new Array<number>(canvas.width).fill(0);
    const rows = new Array<number>(canvas.height).fill(0);
    let peak = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const alpha = data[(y * canvas.width + x) * 4 + 3];
        columns[x] += alpha / canvas.height;
        rows[y] = Math.max(rows[y], alpha);
        peak = Math.max(peak, alpha);
      }
    }
    let seamStep = 0;
    for (const edge of edges) {
      const x = Math.round(edge);
      if (x < 1 || x >= canvas.width) continue;
      let step = 0;
      for (let y = 0; y < canvas.height; y++) {
        step += Math.abs(data[(y * canvas.width + x) * 4 + 3] - data[(y * canvas.width + x - 1) * 4 + 3]);
      }
      seamStep = Math.max(seamStep, step / canvas.height);
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, 160, 100);
    const pixels = Array.from(ctx.getImageData(0, 0, 160, 100).data).filter((_, i) => i % 4 === 3);
    return { coverage: columns.reduce((sum, value) => sum + value, 0) / canvas.width / 255, minColumn: Math.min(...columns), peak, seamStep, rows, pixels };
  }, { base64: screenshot.toString('base64'), edges });
}

for (const viewport of [{ width: 320, height: 640 }, { width: 360, height: 740 }, { width: 768, height: 1024 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
  test(`mountain hero keeps continuous opposite mist at ${viewport.width}px`, async ({ page }, testInfo) => {
    const monitor = attachRuntimeMonitor(page);
    await page.setViewportSize(viewport);
    await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: {
      current: { temperature_2m: 24, wind_speed_10m: 8, relative_humidity_2m: 78, weather_code: 2 },
    } }));
    await page.goto('/');
    const hero = page.getByRole('region', { name: 'Mt. Kalisungan', exact: true });
    await expect(hero.getByRole('heading', { level: 1 })).toHaveText(/Stunning High Treks On Mount Kalisungan/);
    await expect(hero.getByRole('button', { name: /mist animation/ })).toHaveCount(0);
    await expect(hero.locator('img').first()).toHaveJSProperty('naturalWidth', 1920);
    const upperLane = hero.locator('.mountain-mist-far');
    const lowerLane = hero.locator('.mountain-mist-near');
    const mist = upperLane.locator('.mountain-mist-track');
    const lowerMist = lowerLane.locator('.mountain-mist-track');
    const originalGeometry = await upperLane.evaluate((el) => {
      const style = getComputedStyle(el);
      const parent = el.parentElement!.getBoundingClientRect();
      return { height: parseFloat(style.height) / parent.height, width: el.querySelector('img')!.getBoundingClientRect().width / parent.width, top: parseFloat(style.top) / parent.height };
    });
    expect(originalGeometry.height).toBeCloseTo(.65, 2);
    expect(originalGeometry.width).toBeCloseTo(1.6, 2);
    expect(originalGeometry.top).toBeCloseTo(.04, 2);
    expect(await lowerLane.evaluate((el) => parseFloat(getComputedStyle(el).bottom) / el.parentElement!.clientHeight)).toBeCloseTo(-.12, 2);
    expect(await mist.locator('img').first().getAttribute('src')).not.toBe(await lowerMist.locator('img').first().getAttribute('src'));
    await expect(mist).toHaveCSS('animation-play-state', 'running');
    await expect(mist.locator('img').first()).toHaveJSProperty('complete', true);
    expect(await mist.locator('img').first().evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    const startX = await mist.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
    const lowerStartX = await lowerMist.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
    await expect.poll(() => mist.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41).then((x) => x - startX), { timeout: 3000 }).toBeGreaterThan(4);
    await expect.poll(() => lowerMist.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41).then((x) => x - lowerStartX), { timeout: 3000 }).toBeLessThan(-4);
    await expect(mist).toHaveCSS('animation-direction', 'normal');
    await expect(lowerMist).toHaveCSS('animation-direction', 'normal');
    await page.screenshot({ path: testInfo.outputPath(`landing-${viewport.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await expect(hero.getByText('Mt. Kalisungan Conditions')).toBeVisible();
    await hero.getByRole('button', { name: 'Learn More' }).click();
    await expect(page.locator('#learn-more')).toBeInViewport();
    await expect(mist).toHaveCSS('animation-play-state', 'paused');
    await hero.getByRole('button', { name: 'Book Now' }).click();
    await expect(page).toHaveURL(/\/login\?redirect=\/booking$/);
    monitor.assertClean();
  });
}

test('reduced motion keeps the mountain visible without moving mist', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const mist = page.locator('.mountain-mist-track');
  await expect(mist).toHaveCount(2);
  await expect(mist.first()).toHaveCSS('animation-play-state', 'paused');
  await expect(page.getByRole('button', { name: /mist animation/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Stunning High Treks/, level: 1 })).toBeVisible();
});

for (const viewport of [{ width: 320, height: 640 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
  test(`rendered fog has no tile cuts, clearing strips or lane overlap at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const scene = page.locator('.mountain-mist');
    await expect(scene.locator('.mountain-mist-track').first()).toHaveCSS('animation-play-state', 'running');
    await scene.evaluate((el) => Promise.all([...el.querySelectorAll('img')].map((img) => img.decode())));
    await expect(scene).toHaveCSS('pointer-events', 'none');
    // Only hide unrelated paint. Keep the actual fog DOM, geometry, masks and
    // compositing intact, including both the scene mask and each lane mask.
    await page.addStyleTag({ content: `
      html, body { background: transparent !important; }
      body * { visibility: hidden !important; }
      .mountain-mist, .mountain-mist * { visibility: visible !important; }
      [data-fog-probe-hidden], [data-fog-probe-hidden] * { visibility: hidden !important; }
    ` });
    const support: number[][] = [];
    const metrics: object[] = [];
    for (const lane of ['far', 'near']) {
      await scene.evaluate((el, lane) => {
        for (const layer of el.children) layer.toggleAttribute('data-fog-probe-hidden', !layer.classList.contains(`mountain-mist-${lane}`));
      }, lane);
      const samples: Awaited<ReturnType<typeof renderedFog>>[] = [];
      for (const phase of [0, .125, .25, .375, .5, .625, .75, .875, .99999, 1, 1.00001, 2]) {
        const edges = await scene.evaluate((el, phase) => {
          for (const animation of el.getAnimations({ subtree: true })) {
            animation.pause();
            const timing = animation.effect!.getTiming();
            animation.currentTime = Number(timing.duration) * phase + Number(timing.delay);
          }
          const origin = el.getBoundingClientRect().left;
          return [...el.querySelectorAll(':scope > :not([data-fog-probe-hidden]) img')].flatMap((img) => {
            const rect = img.getBoundingClientRect();
            return [rect.left - origin, rect.right - origin];
          });
        }, phase);
        const screenshot = await scene.screenshot({ omitBackground: true });
        const sample = await renderedFog(scene, screenshot, edges);
        samples.push(sample);
        metrics.push({ lane, phase, coverage: sample.coverage, minColumn: sample.minColumn, peak: sample.peak, seamStep: sample.seamStep });
        if ([.25, .5, .75].includes(phase)) await testInfo.attach(`${lane}-${phase}`, { body: screenshot, contentType: 'image/png' });
        const context = `${lane} lane at ${phase} cycles`;
        expect.soft(sample.coverage, `${context}: fog must remain visible after masking`).toBeGreaterThan(.002);
        expect.soft(sample.minColumn, `${context}: no fully cleared vertical strip between tiles`).toBeGreaterThan(.25);
        expect.soft(sample.seamStep, `${context}: no abrupt alpha step at a tile edge`).toBeLessThan(.6);
        expect.soft(sample.peak, `${context}: joining tails must not stack into dense clouds`).toBeLessThanOrEqual(lane === 'far' ? 93 : 58);
      }
      const coverage = samples.map((sample) => sample.coverage);
      expect(Math.min(...coverage) / Math.max(...coverage), `${lane}: no clearing interval`).toBeGreaterThan(.35);
      for (const sample of samples.slice(-4)) {
        const difference = sample.pixels.reduce((sum, alpha, i) => sum + Math.abs(alpha - samples[0].pixels[i]), 0) / sample.pixels.length;
        expect(difference, `${lane}: continuous immediately before, at and after wrap`).toBeLessThan(.1);
      }
      support.push(samples[0].rows.map((_, row) => Math.max(...samples.map((sample) => sample.rows[row]))));
    }
    await testInfo.attach('rendered-fog-metrics', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
    expect(support[0].some((alpha, row) => alpha > 1 && support[1][row] > 1), 'Upper and lower visible fog must never overlap, even at different phases').toBe(false);
  });
}
