import React, { useEffect, useRef, useState } from "react";
import pdfjsDist from "pdfjs-dist";
import { db } from "../services/db";
import { OnedriveService } from "../services/onedrive";

// Suppress default worker and use bundled one
pdfjsDist.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

interface PDFViewerProps {
  pdfName: string;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ pdfName }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    const loadPDF = async () => {
      try {
        container.replaceChildren();
        let data = await db.getPDFCache(pdfName);
        if (!data) {
          const service = new OnedriveService();
          service.setVaultPath("ObsidianVault");
          const blob = await service.streamPDF(`Goodnotes/${pdfName}`);
          data = await blob.arrayBuffer();
          await db.savePDFCache(pdfName, data);
        }

        if (cancelled) return;
        const loadingTask = pdfjsDist.getDocument({ data });
        const pdf = await loadingTask.promise;
        for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
          const page = await pdf.getPage(i);
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx || cancelled) return;

          const viewport = page.getViewport({ scale: 1.5 });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "block w-full h-auto mb-3";
          await page.render({ canvasContext: ctx, viewport }).promise;
          container.appendChild(canvas);
        }
        if (!cancelled) setLoading(false);
      } catch (err) {
        console.error("PDF loading error:", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PDF");
          setLoading(false);
        }
      }
    };

    loadPDF();

    return () => {
      cancelled = true;
      container.replaceChildren();
    };
  }, [pdfName]);

  if (loading) {
    return (
      <div className="h-64 bg-gray-800 rounded-lg p-8 flex items-center justify-center text-gray-400">
        <span>Loading PDF...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-64 bg-gray-800 rounded-lg p-8 flex items-center justify-center text-red-400">
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-800 rounded-lg overflow-y-auto p-4">
      <div ref={containerRef} aria-label={`Preview of ${pdfName}`} />
    </div>
  );
};