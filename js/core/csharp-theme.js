import { HighlightStyle } from "https://esm.sh/@codemirror/language@6";
import { tags } from "https://esm.sh/@lezer/highlight@1";
import { EditorView } from "https://esm.sh/codemirror@6";

export const csharpHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#CC7832" },
  { tag: tags.controlKeyword, color: "#CC7832" },
  { tag: tags.moduleKeyword, color: "#CC7832" },
  { tag: tags.operatorKeyword, color: "#CC7832" },
  { tag: tags.definitionKeyword, color: "#CC7832" },
  { tag: tags.modifier, color: "#CC7832" },
  { tag: tags.self, color: "#94558D" },
  { tag: tags.string, color: "#6A8759" },
  { tag: tags.special(tags.string), color: "#6A8759" },
  { tag: tags.comment, color: "#808080", fontStyle: "italic" },
  { tag: tags.lineComment, color: "#808080", fontStyle: "italic" },
  { tag: tags.blockComment, color: "#808080", fontStyle: "italic" },
  { tag: tags.number, color: "#6897BB" },
  { tag: tags.bool, color: "#CC7832" },
  { tag: tags.null, color: "#CC7832" },
  { tag: tags.typeName, color: "#A9B7C6" },
  { tag: tags.className, color: "#A9B7C6" },
  { tag: tags.namespace, color: "#A9B7C6" },
  { tag: tags.definition(tags.typeName), color: "#A9B7C6" },
  { tag: tags.definition(tags.function(tags.variableName)), color: "#FFC66D" },
  { tag: tags.function(tags.variableName), color: "#A9B7C6" },
  { tag: tags.function(tags.propertyName), color: "#A9B7C6" },
  { tag: tags.definition(tags.variableName), color: "#A9B7C6" },
  { tag: tags.variableName, color: "#A9B7C6" },
  { tag: tags.propertyName, color: "#A9B7C6" },
  { tag: tags.operator, color: "#A9B7C6" },
  { tag: tags.punctuation, color: "#A9B7C6" },
  { tag: tags.bracket, color: "#A9B7C6" },
  { tag: tags.meta, color: "#BBB529" },
  { tag: tags.annotation, color: "#BBB529" },
]);

export const csharpEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "#2B2B2B",
    color: "#A9B7C6",
    height: "100%",
    fontSize: "14px",
  },
  ".cm-scroller": {
    fontFamily: "ui-monospace, Menlo, Consolas, monospace",
    lineHeight: "1.55",
  },
  ".cm-content": {
    caretColor: "#A9B7C6",
    padding: "12px 0",
  },
  ".cm-gutters": {
    backgroundColor: "#313335",
    color: "#606366",
    border: "none",
    borderRight: "1px solid #333",
  },
  ".cm-activeLine": { backgroundColor: "#323232" },
  ".cm-activeLineGutter": { backgroundColor: "#3C3F41" },
  ".cm-selectionBackground, ::selection": { backgroundColor: "#214283" },
  ".cm-cursor": { borderLeftColor: "#A9B7C6" },
}, { dark: true });
