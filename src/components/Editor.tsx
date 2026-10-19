import React, { useEffect, useState } from "react";
import { EditorView } from "@codemirror/view";
import { basicKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { search } from "@codemirror/search";
import { default as language } from "@codemirror/language";

// Wikilink detection - use inline function, no regex import needed
const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g;
const WIKILINK_ALIAS_REGEX = /\[\[([^\]]+)\|([^\]]+)\]\]/g;

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

    setView(
      new EditorView({
        parent: container,
        extensions: [
          basicSetup,
          markdown(),
          search(),
          {
            class: "cm-editor",
            style: {
              height: "100%",
              width: "100%",
              fontFamily: "system-ui, -apple-system, BlinkMacFont, 'Segoe UI', sans-serif",
              fontSize: "14px",
              color: "#c9d1d9",
              backgroundColor: "#1e1e1e",
            },
          },
        ],
        initialState: {
          from: initialContent,
          extensions: [],
          scrollPastEnd: 0.5,
        },
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
    let match;

    // Handle [[Alias|Target]] format first
    const aliasRegex = /\[\[([^\]]+)\|([^\]]+)\]\]/g;
    while ((match = aliasRegex.exec(content)) !== null) {
      links.push({
        text: match[1],
        target: match[2],
        alias: match[2],
      });
    }

    // Handle [[Target]] format - avoid duplicates
    const targetRegex = /\[\[([^\]]+)\]\]/g;
    while ((match = targetRegex.exec(content)) !== null) {
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

    // Add inline marks for wikilinks
    if (links.length > 0) {
      // Mark the link areas in the editor
      const { state } = view;
      let from = 0;

      links.forEach((link) => {
        const regex = new RegExp(`\\[\\${link.target}\\]`, "g");
        let match;
        while ((match = regex.exec(content)) !== null) {
          const start = match.index;
          const end = match.index + match[0].length;
          // Add a mark for this wikilink area
          const mark = view.state.markType.add(start, end);
          // Could add click handler via view.on("click", ...)
        }
      });
    }
  }, [view]);

  // Handle click on wikilinks in the editor
  useEffect(() => {
    if (!view) return;

    const handleClick = (e: MouseEvent) => {
      const { from, to } = view.state.selection;
      const line = view.state.doc.lineAt(from);
      const text = line.text;

      // Check if clicked on a wikilink
      const wikilinkMatch = text.match(WIKILINK_REGEX);
      if (wikilinkMatch) {
        // Find which wikilink was clicked based on position
        const clickX = e.clientX;
        const bbox = view.canvas.getBoundingClientRect();
        const relativeX = clickX - bbox.left;

        // Get the rendered line position
        const lineCoords = view.coordsAtPos(view.state.doc.positionAt(0));
        // Simplified: try to find the link near the click position
        let pos = 0;
        const words = text.split(/\[|\\]/g);
        words.forEach((word, i) => {
          if (word.includes("wikilink") || word.includes("link")) {
            // This is a simplistic approach
          }
        });
      }
    };

    view.on("click", handleClick);

    return () => {
      view.off("click", handleClick);
    };
  }, [view]);

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border border-gray-800">
      <EditorView
        extensions={view.extensions}
        state={view.state}
        onChange={(value) => onChange(value.toString())}
      />
    </div>
  );
};