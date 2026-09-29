const fields = [
  { selector: '.wash-sage', duration: 18000, phase: .4, x: 90, y: 52, angle: -18, sway: 14 },
  { selector: '.wash-sun', duration: 23000, phase: 2.3, x: 110, y: 60, angle: 10, sway: 16 },
  { selector: '.wash-mist', duration: 29000, phase: 4.1, x: 75, y: 68, angle: 22, sway: 12 },
];

export function createSoftlightMotion(root: HTMLElement | null) {
  const animations: Animation[] = [];

  for (const field of fields) {
    const light = root?.querySelector<HTMLElement>(field.selector);
    if (!light) continue;

    // Sample closed, smooth curves once; the browser runs the loops, not a JS frame loop.
    // Integer harmonics match both position and velocity at the repeat boundary.
    const frames: Keyframe[] = Array.from({ length: 121 }, (_, index) => {
      const t = index / 120 * Math.PI * 2;
      const wave = t + field.phase;
      const x = field.x * Math.sin(wave) + 18 * Math.sin(2 * t - field.phase);
      const y = field.y * Math.cos(wave) + 10 * Math.sin(2 * t + field.phase);
      const angle = field.angle + field.sway * Math.sin(wave);
      const scaleX = 1 + .09 * Math.sin(wave + .8);
      const scaleY = 1 + .07 * Math.cos(wave - .6);
      return {
        offset: index / 120,
        transform: `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg) scale(${scaleX}, ${scaleY})`,
      };
    });
    const animation = light.animate(frames, {
      duration: field.duration,
      iterations: Infinity,
      easing: 'linear',
    });
    animation.pause();
    animations.push(animation);
  }

  return {
    sync(running: boolean, reduced: boolean) {
      for (const animation of animations) {
        if (reduced) animation.cancel();
        else if (running) animation.play();
        else if (animation.playState !== 'idle') animation.pause();
      }
    },
  };
}
