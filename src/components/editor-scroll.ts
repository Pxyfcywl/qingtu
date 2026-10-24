import type {EditorView} from '@tiptap/pm/view';
// Scroll the card first. Only a caret still outside the canvas needs canvas panning.
export function revealEditorCaret(view:EditorView){
  const pane=view.dom.closest<HTMLElement>('.card-body');
  let rect=view.coordsAtPos(view.state.selection.head);
  if(pane){
    const bounds=pane.getBoundingClientRect(),scale=bounds.width/pane.offsetWidth||1;
    const dy=rect.bottom>bounds.bottom-12?rect.bottom-bounds.bottom+12:rect.top<bounds.top+12?rect.top-bounds.top-12:0;
    pane.scrollTop+=dy/scale;
    const dom=view.domAtPos(view.state.selection.head).node;
    const code=(dom instanceof Element?dom:dom.parentElement)?.closest('pre');
    if(code){const edge=code.getBoundingClientRect();const dx=rect.right>edge.right-12?rect.right-edge.right+12:rect.left<edge.left+12?rect.left-edge.left-12:0;code.scrollLeft+=dx/scale;}
    rect=view.coordsAtPos(view.state.selection.head);
  }
  return rect;
}
