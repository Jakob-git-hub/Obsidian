import React, { useEffect, useRef } from "react";
import cytoscape from "cytoscape";

interface GraphProps {
  nodes: { id: string; label: string }[];
  edges: { source: string; target: string }[];
  onNodeClick: (nodeId: string) => void;
}

export const Graph: React.FC<GraphProps> = ({ nodes, edges, onNodeClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      boxSelectionEnabled: false,
      autounselectify: true,
      style: [
        {
          selector: "node",
          style: {
            content: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "background-color": "#3b82f6",
            "text-outline-color": "#1e1e1e",
            "text-outline-width": 2,
            color: "#ffffff",
            "font-size": "12px",
            width: "label",
            height: "label",
            padding: "10px",
            shape: "roundrectangle",
          },
        },
        {
          selector: "edge",
          style: {
            "width": 2,
            "line-color": "#4b5563",
            "target-arrow-color": "#4b5563",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
          },
        },
      ],
      elements: {
        nodes: nodes.map((n) => ({ data: { id: n.id, label: n.label } })),
        edges: edges.map((e, idx) => ({ data: { id: `e${idx}`, source: e.source, target: e.target } })),
      },
      layout: {
        name: "cose",
        animate: true,
      },
    });

    cy.on("tap", "node", (evt) => {
      const node = evt.target;
      onNodeClick(node.id());
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [nodes, edges]);

  return <div ref={containerRef} className="w-full h-full bg-[#1e1e1e] rounded-lg shadow-inner" />;
};
