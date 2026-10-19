import React, { useEffect, useRef, useState } from "react";
import pdfjsDist from "pdfjs-dist";

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
    const loadPDF = async () => {
      try {
        // Read from IndexedDB or local path - for now, use relative path
        // In production, this would fetch from OneDrive or local storage
        const pdfPath = `/Goodnotes/${pdfName}`;

        // Try to fetch the PDF
        const loadingTask = pdfjsDist.getDocument(pdfPath);
        const pdf = await loadingTask.promise;

        const pageCount = pdf.numPages;
        const renderedPages: HTMLCanvasElement[] = [];

        for (let i = 1; i <= Math.min(pageCount, 5); i++) { // Render first 5 pages
          const page = await pdf.getPage(i);
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          
          const viewport = page.getViewport({ scale: 1.5 });
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          if (ctx) {
            await page.render({
              canvasContext: ctx,
              viewport,
            }).promise;
          }

          renderedPages.push(canvas);
        }

        setLoading(false);
        // Render pages to screen
        // In a real app, we'd map these to UI elements
      } catch (err) {
        console.error("PDF loading error:", err);
        setError("Failed to load PDF");
        setLoading(false);
      }
    };

    loadPDF();

    return () => {
      // Cleanup
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
    <div className="h-full bg-gray-800 rounded-lg overflow-hidden">
      { /* PDF pages would be rendered here */ }
      <div className="h-full p-4 text-gray-400 text-center">
        <span className="text-sm">PDF: {pdfName}</span>
        <div className="mt-2 text-xs text-gray-500">PDF rendering area</div>
      </div>
    </div>
  );
};