import React, { useEffect, useState, ReactNode } from "react";
import { EditorView, keymap, Decoration, DecorationSet } from "@codemirror/view";
import { basicSetup } from "@codemirror/basic-setup";
import { markdown } from "@codemirror/lang-markdown";
import { searchKeymap } from "@codemirror/search";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { oneDarkHighlightStyle as defaultHighlightStyle } from "@codemirror/theme-one-dark";
import { EditorState, Extension, Range } from "@codemirror/state";

// Wikilink detection - use inline function, no regex import needed
const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g;
const WIKILINK_ALIAS_REGEX = /\[\[([^\]]+)\|([^\]]+)\]\]/g;

// Type for wikilink matches
interface WikilinkMatch {
  text: string;
  target: string;
  alias: string;
}

interface EditorProps {
  initialContent: string;
  onChange: (content: string) => void;
  onWikilinkClick?: (noteName: string, alias?: string) => void;
}

export const Editor: React.FC<EditorProps> = ({
  initialContent,
  onChange,
  onWikilinkClick,
}) => {
  const [view, setView] = useState<EditorView | null>(null);

  useEffect(() => {
    // Create a container div for the editor
    const container = document.createElement("div");
    container.style.height = "100%";
    container.style.width = "100%";

    // Create extensions
    const extensions: Extension[] = [
      basicSetup,
      markdown(),
      searchKeymap,
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    ];

    // Create initial state
    const state = EditorState.create({
      doc: initialContent,
      extensions
    });

    setView(
      new EditorView({
        parent: container,
        state
      })
    );

    return () => {
      view?.destroy();
    };
  }, [initialContent]);

  if (!view) return null;

  // Extract wikilinks from content for highlighting
  const extractWikilinks = (content: string): Array<{ text: string; target: string; alias: string }> => {
    const links: Array<{ text: string; target: string; alias: string }> = [];
    let match: RegExpMatchArray | null;

    // Handle [[Alias|Target]] format first
    while ((match = WIKILINK_ALIAS_REGEX.exec(content)) !== null) {
      links.push({
        text: match[1],
        target: match[2],
        alias: match[2],
      });
    }

    // Handle [[Target]] format - avoid duplicates
    while ((match = WIKILINK_REGEX.exec(content)) !== null) {
      const alreadyFound = links.find((l) => l.target === match[1]);
      if (!alreadyFound) {
        links.push({
          text: match[1],
          target: match[1],
          alias: match[1],
        });
      }
    }

    return links;
  };

  // Parse content and render wikilink highlights
  useEffect(() => {
    if (!view) return;

    const content = view.state.doc.toString();
    const links = extractWikilinks(content);

    // Add inline marks for wikilinks using decorations
    if (links.length > 0) {
      const { state } = view;
      const decorations = links.flatMap(link => {
        const regex = new RegExp(`\\[\\[${link.target}\\]\\]`, "g");
        const decs: Range<Decoration>[] = [];
        let match: RegExpMatchArray | null;
        while ((match = regex.exec(content)) !== null) {
          const start = match.index;
          const end = match.index + match[0].length;
          decs.push(Decoration.mark({ class: "wikilink" }).range(start, end));
        }
        return decs;
      });

      const decorationState = state.field(DecorationSet, false);
      const newSet = decorationState.update({
        add: decorations,
        filter: () => true
      }, state);
      view.dispatch({
        effects: DecorationSet.reconfigure.of(newSet)
      });
    }
  }, [view]);

  // Handle click on wikilinks in the editor
  useEffect(() => {
    if (!view) return;

    const handleClick = (e: MouseEvent) => {
      const coords = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (!coords) return;

      const { state } = view;
      const doc = state.doc;
      const pos = coords.pos;

      // Get the text around the position to see if we clicked on a wikilink
      const line = doc.lineAt(pos);
      const text = line.text;
      const offset = pos - line.from;

      // Check if the click position is within a wikilink pattern
      const before = text.slice(0, offset);
      const after = text.slice(offset);

      // Simple check: see if we are between [[ and ]]
      const beforeMatch = before.match(/\[\[([^\]]*)$/);
      const afterMatch = after.match(/^([^\]]*)\]\]/);
      if (beforeMatch && afterMatch) {
        const target = beforeMatch[1] + afterMatch[1];
        // Check if there's an alias
        const aliasParts = target.split("|");
        if (aliasParts.length === 2) {
          const [alias, targetName] = aliasParts;
          onWikilinkClick?.(targetName, alias);
        } else {
          onWikilinkClick?.(target);
        }
      }
    };

    view.dom.addEventListener("click", handleClick);

    return () => {
      view.dom.removeEventListener("click", handleClick);
    };
  }, [view]);

  // Handle changes
  useEffect(() => {
    if (!view) return;

    const handler = EditorView.updateListener.of((v) => {
      if (v.docChanged) {
        onChange(v.state.doc.toString());
      }
    });

    view.updateListener.add(handler);
    return () => {
      view.updateListener.remove(handler);
    };
  }, [view, onChange]);

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border border-gray-800">
      <div
        style={{ height: "100%", width: "100%" }}
      >
        {view.dom as ReactNode}
      </div>
    </div>
  );
};