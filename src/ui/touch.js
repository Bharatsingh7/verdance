// On-screen joystick + buttons for touch devices. Buttons map to the same key codes as the keyboard.
export function isTouchDevice() {
  return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

export function setupTouch(input) {
  const root = document.getElementById('touch');
  root.hidden = false;
  document.body.classList.add('touch');
  const stick = document.getElementById('stick'), knob = stick.querySelector('i');
  let pid = null;
  const R = 50;
  const move = (e) => {
    const r = stick.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.axis.x = dx / R; input.axis.y = -dy / R;
  };
  stick.addEventListener('pointerdown', (e) => { pid = e.pointerId; stick.setPointerCapture(pid); move(e); e.stopPropagation(); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === pid) move(e); });
  const end = (e) => { if (e.pointerId !== pid) return; pid = null; knob.style.transform = ''; input.axis.x = input.axis.y = 0; };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);

  for (const b of root.querySelectorAll('#tbuttons button')) {
    const code = b.dataset.key;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      b.setPointerCapture(e.pointerId);
      if ('tap' in b.dataset) input.tap(code);
      else input.touchHeld.add(code);
    });
    const up = () => input.touchHeld.delete(code);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  }
}
