type SelectBody = (codeBlock: HTMLElement | null) => void;
const editors = new Map<HTMLElement, SelectBody>();

export function registerMarkdownSelection(body: HTMLElement, select: SelectBody) {
  editors.set(body, select);
  return () => { editors.delete(body); };
}

// Resolve the element at keydown time: scrolling, layout and overlays can move
// content under a stationary pointer without another pointer event.
export function installMarkdownSelection(unavailable: () => boolean) {
  let pointer: { x: number; y: number } | null = null;
  const track = (event: PointerEvent) => { pointer = { x: event.clientX, y: event.clientY }; };
  const clear = () => { pointer = null; };
  const leave = (event: PointerEvent) => { if (!event.relatedTarget) clear(); };
  const select = (event: KeyboardEvent) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.key.toLowerCase() !== 'a' || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    if (!pointer || unavailable() || document.querySelector('dialog[open],.modal-backdrop')) return;
    const target = document.elementFromPoint(pointer.x, pointer.y);
    if (!target || target.closest('button,input,textarea,select,video,audio,[role="button"],.math-source')) return;
    const body = target.closest<HTMLElement>('.card-body .rich-doc');
    if (!body || body.closest('[inert]')) return;
    const code = target.closest<HTMLElement>('pre');
    const selectEditor = editors.get(body);
    if (selectEditor) {
      selectEditor(code);
    } else if (!body.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(code?.querySelector('code') ?? code ?? body);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  };
  window.addEventListener('pointermove', track, true);
  window.addEventListener('pointerover', track, true);
  window.addEventListener('pointerdown', track, true);
  window.addEventListener('pointerout', leave, true);
  window.addEventListener('blur', clear);
  window.addEventListener('keydown', select, true);
  return () => {
    window.removeEventListener('pointermove', track, true);
    window.removeEventListener('pointerover', track, true);
    window.removeEventListener('pointerdown', track, true);
    window.removeEventListener('pointerout', leave, true);
    window.removeEventListener('blur', clear);
    window.removeEventListener('keydown', select, true);
  };
}
