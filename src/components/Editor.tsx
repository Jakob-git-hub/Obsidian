import React, { useEffect, useRef } from "react";
import { basicSetup } from "@codemirror/basic-setup";
import { markdown } from "@codemirror/lang-markdown";
import { searchKeymap } from "@codemirror/search";
import { EditorState, Extension } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  keymap,
  MatchDecorator,
} from "@codemirror/view";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
import { syntaxHighlighting } from "@codemirror/language";

interface EditorProps {
  initialContent: string;
  onChange: (content: string) => void;
  onWikilinkClick?: (noteName: string, alias?: string) => void;
}

const wikilinkDecoration = Decoration.mark({ class: "wikilink" });
const wikilinkMatcher = new MatchDecorator({
  regexp: /\[\[[^\]]+\]\]/g,
  decoration: wikilinkDecoration,
});

const wikilinkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = wikilinkMatcher.createDeco(view);
    }

    update(update: ViewUpdate) {
      this.decorations = wikilinkMatcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (value) => value.decorations },
);

export const Editor: React.FC<EditorProps> = ({
  initialContent,
  onChange,
  onWikilinkClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onWikilinkClickRef = useRef(onWikilinkClick);

  useEffect(() => {
    onChangeRef.current = onChange;
    onWikilinkClickRef.current = onWikilinkClick;
  }, [onChange, onWikilinkClick]);

  useEffect(() => {
    if (!containerRef.current) return;

    const extensions: Extension[] = [
      basicSetup,
      markdown(),
      keymap.of(searchKeymap),
      syntaxHighlighting(oneDarkHighlightStyle, { fallback: true }),
      wikilinkPlugin,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
      EditorView.domEventHandlers({
        click: (event, view) => {
          const position = view.posAtCoords({
            x: event.clientX,
            y: event.clientY,
          });
          if (position === null) return false;

          const line = view.state.doc.lineAt(position);
          const offset = position - line.from;
          const before = line.text.slice(0, offset);
          const after = line.text.slice(offset);
          const beforeMatch = before.match(/\[\[([^\]]*)$/);
          const afterMatch = after.match(/^([^\]]*)\]\]/);
          if (!beforeMatch || !afterMatch) return false;

          const link = `${beforeMatch[1]}${afterMatch[1]}`;
          const [first, second] = link.split("|");
          if (second !== undefined) {
            onWikilinkClickRef.current?.(second.trim(), first.trim());
          } else {
            onWikilinkClickRef.current?.(link.trim());
          }
          return true;
        },
      }),
    ];

    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({ doc: initialContent, extensions }),
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === initialContent) return;

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: initialContent },
    });
  }, [initialContent]);

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border border-gray-800">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};
