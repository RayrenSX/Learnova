const {EditorState, Compartment} = require('@codemirror/state');
const {EditorView, keymap, drawSelection} = require('@codemirror/view');
const {basicSetup} = require('codemirror');
const {indentWithTab, undo, redo, undoDepth, redoDepth} = require('@codemirror/commands');
const {openSearchPanel} = require('@codemirror/search');
const {indentUnit} = require('@codemirror/language');
const {cpp} = require('@codemirror/lang-cpp');
const {python} = require('@codemirror/lang-python');
const {java} = require('@codemirror/lang-java');
const {javascript} = require('@codemirror/lang-javascript');
const {rust} = require('@codemirror/lang-rust');
const {go} = require('@codemirror/lang-go');
const {completeAnyWord, completeFromList} = require('@codemirror/autocomplete');

function createWorkspaceEditor(parent, onEdit, onStatus = () => {}) {
  const language = new Compartment();
  const options = new Compartment();
  const editable = new Compartment();
  const wrapping = new Compartment();
  let applying = false;
  let lastLanguage = '';
  let lastTabSize = 4;
  let lastEditable = false;
  let lastWrapping = false;
  function report(state) {
    const selection = state.selection.main;
    const line = state.doc.lineAt(selection.head);
    const selected = state.selection.ranges.reduce((count, range) => count + range.to - range.from, 0);
    onStatus({line: line.number, column: selection.head - line.from + 1, selected,
      editable: !state.readOnly, canUndo: !state.readOnly && undoDepth(state) > 0, canRedo: !state.readOnly && redoDepth(state) > 0});
  }
  function codeCompletion(context) {
    const words=/python/i.test(lastLanguage)?['def','return','if','elif','else','for','while','in','import','from','print','input','range','len']
      : /java/i.test(lastLanguage)&&!/javascript/i.test(lastLanguage)?['public','static','class','void','int','return','new','if','else','for','while','System']
      : ['int','char','long','double','float','void','return','if','else','for','while','break','continue','const','struct','sizeof','printf','scanf','malloc','free'];
    const keyword=completeFromList(words.map(label=>({label,type:'keyword'})))(context);
    const local=completeAnyWord(context);
    if(!keyword)return local;
    return {...keyword,options:[...keyword.options,...(local?.options||[]).filter(item=>!words.includes(item.label))]};
  }
  const extensions = [
    basicSetup, drawSelection({cursorBlinkRate:700}), keymap.of([indentWithTab]), language.of([]), wrapping.of([]),
    EditorState.languageData.of(()=>[{autocomplete:codeCompletion}]),
    options.of([EditorState.tabSize.of(4),indentUnit.of('    ')]),
    editable.of([EditorState.readOnly.of(true),EditorView.editable.of(false)]),
    EditorView.contentAttributes.of({'aria-label':'助手代码编辑器',spellcheck:'false'}),
    EditorView.updateListener.of(update => {
      report(update.state);
      if (update.docChanged && !applying) onEdit(update.state.doc.toString());
    }),
    EditorView.theme({
      '&':{height:'100%',fontSize:'var(--pintia-code-font-size, 13px)',backgroundColor:'#fff',color:'#223b4c'},
      '.cm-scroller':{fontFamily:'Consolas,"SFMono-Regular",monospace',lineHeight:'1.7',overflow:'auto'},
      '.cm-content':{padding:'10px 0',caretColor:'#1268a4'},
      '.cm-gutters':{backgroundColor:'#f6f9fb',color:'#8299a8',border:'none',minWidth:'42px'},
      '.cm-activeLine':{backgroundColor:'#f0f6fc'},
      '.cm-activeLineGutter':{backgroundColor:'#e1edf8',color:'#225d85',fontWeight:'600'},
      '&.cm-focused':{outline:'none',boxShadow:'inset 0 0 0 1px #b8d6ee'},
      '.cm-selectionBackground':{backgroundColor:'#bad5ed'},
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground':{backgroundColor:'#87bef1'},
      '.cm-content ::selection':{backgroundColor:'#87bef1',color:'#122f46'},
      '.cm-cursor,.cm-dropCursor':{borderLeftColor:'#1268a4',borderLeftWidth:'2px'},
      '.cm-selectionMatch':{backgroundColor:'#dfedf9',outline:'1px solid #c1d7eb'},
      '.cm-searchMatch':{backgroundColor:'#ffe5a0',outline:'1px solid #e3bd5b'},
      '.cm-searchMatch-selected':{backgroundColor:'#ffd06b'},
      '&.cm-focused .cm-matchingBracket':{backgroundColor:'#d3ebdf',outline:'1px solid #99cbb0'},
      '&.cm-focused .cm-nonmatchingBracket':{backgroundColor:'#fbe0db',outline:'1px solid #e4a193'},
      '.cm-panels':{backgroundColor:'#f1f6f9'},
      '.cm-tooltip':{border:'1px solid #d3e1e9',borderRadius:'6px'}
    })
  ];
  const view = new EditorView({parent, state:EditorState.create({doc:'',extensions})});
  report(view.state);
  function replace(text, resetHistory = false) {
    if (view.state.doc.toString() === text && !resetHistory) return;
    applying = true;
    try {
      if (resetHistory) {
        view.setState(EditorState.create({doc:text,extensions}));
        lastLanguage = ''; lastTabSize = 4;lastEditable=false;lastWrapping=false;
      }
      else view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text}});
    } finally {applying = false;report(view.state);}
  }
  function configure(name, tabSize = 4, allow = true) {
    const effects = [];
    if (name !== lastLanguage) {
      const lower = name.toLowerCase();
      const extension = /python/.test(lower) ? python() : /javascript|typescript/.test(lower) ? javascript({typescript:/typescript/.test(lower)})
        : /java/.test(lower) ? java() : /rust/.test(lower) ? rust() : /^go\b/.test(lower) ? go() : /c\+\+|gcc|clang|^c\b/.test(lower) ? cpp() : [];
      effects.push(language.reconfigure(extension)); lastLanguage = name;
    }
    if (!Number.isInteger(tabSize) || tabSize < 1 || tabSize > 8) tabSize = 4;
    if (tabSize !== lastTabSize) {effects.push(options.reconfigure([EditorState.tabSize.of(tabSize),indentUnit.of(' '.repeat(tabSize))]));lastTabSize=tabSize;}
    if (lastEditable !== allow) {effects.push(editable.reconfigure([EditorState.readOnly.of(!allow),EditorView.editable.of(allow)]));lastEditable=allow;}
    if (!effects.length) return;
    applying = true;
    try {view.dispatch({effects});} finally {applying = false;}
  }
  function setWrapping(value) {
    value = value === true;
    if (value === lastWrapping) return;
    lastWrapping = value;
    view.dispatch({effects:wrapping.reconfigure(value ? EditorView.lineWrapping : [])});
  }
  function command(name) {
    const run = {undo, redo, search:openSearchPanel}[name];
    if (!run || (name !== 'search' && view.state.readOnly)) return false;
    if (name !== 'search') view.focus();
    return run(view);
  }
  return {view,read:()=>view.state.doc.toString(),replace,configure,setWrapping,command,focus:()=>view.focus(),destroy:()=>view.destroy()};
}
module.exports = {createWorkspaceEditor};
