"use client";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, Download, RefreshCcw, Play, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ============================================
// INTERFACES
// ============================================
interface DownloadRecord {
  id: string;
  title: string;
  url?: string;
  thumbnail?: string;
  format?: string;
  quality?: string;
  type?: string;
  timestamp?: number;
  file_size?: string;
  filename?: string;
  // allow other legacy keys
  [key: string]: any;
}

interface ActiveDownload {
  progress: number;
  status: string;
  title: string;
  speed?: string;
  eta?: string;
  total?: string;
}

const CircularProgress = ({ value }: { value: number }) => {
  const circumference = 2 * Math.PI * 20; // radius 20
  const strokeDashoffset = circumference - (value / 100) * circumference;

  return (
    <div className="relative w-12 h-12">
      <svg className="w-full h-full" viewBox="0 0 50 50">
        <circle
          className="text-gray-300"
          strokeWidth="5"
          stroke="currentColor"
          fill="transparent"
          r="20"
          cx="25"
          cy="25"
        />
        <circle
          className="text-blue-600"
          strokeWidth="5"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r="20"
          cx="25"
          cy="25"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs">
        {Math.round(value)}%
      </span>
    </div>
  );
};

const HistoryTab = () => {
  const [history, setHistory] = useState<DownloadRecord[]>([]);
  const [activeDownloads, setActiveDownloads] = useState<Record<string, ActiveDownload>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const wsConnections = useRef<Record<string, WebSocket>>({});
  const { toast } = useToast();

  // === Load history from backend ===
  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("http://localhost:8000/api/history");
      if (!response.ok) {
        throw new Error("Failed to fetch history from server");
      }
      const data = await response.json();
      // Sort by timestamp descending and take the latest 5
      const sortedHistory = (data.history || []).sort((a: DownloadRecord, b: DownloadRecord) => 
        (b.timestamp || 0) - (a.timestamp || 0)
      ).slice(0, 5);
      setHistory(sortedHistory);
      localStorage.setItem("downloadHistory", JSON.stringify(data.history || []));
    } catch (err) {
      console.error("fetchHistory error:", err);
      try {
        const localHistory = JSON.parse(localStorage.getItem("downloadHistory") || "[]");
        // Sort and slice local history
        const sortedLocalHistory = localHistory.sort((a: DownloadRecord, b: DownloadRecord) => 
          (b.timestamp || 0) - (a.timestamp || 0)
        ).slice(0, 5);
        setHistory(sortedLocalHistory);
      } catch (localErr) {
        console.error("localStorage fallback error:", localErr);
        setHistory([]);
      }
      toast({
        title: "Error",
        description: "Failed to fetch download history. Using local cache.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // === Fetch active downloads ===
  const fetchActiveDownloads = async () => {
    try {
      const response = await fetch("http://localhost:8000/api/active-downloads");
      if (!response.ok) {
        throw new Error("Failed to fetch active downloads");
      }
      const data = await response.json();
      data.active_downloads.forEach((dl: any) => {
        const id = dl.download_id;
        if (!wsConnections.current[id] || wsConnections.current[id].readyState !== WebSocket.OPEN) {
          connectWebSocket(id, false, dl);
        } else {
          setActiveDownloads(prev => ({
            ...prev,
            [id]: {
              ...prev[id],
              progress: dl.progress,
              status: dl.status,
            }
          }));
        }
      });

      Object.keys(activeDownloads).forEach(id => {
        if (!data.active_downloads.some((d: any) => d.download_id === id)) {
          if (wsConnections.current[id]) {
            wsConnections.current[id].close();
          }
          delete wsConnections.current[id];
          setActiveDownloads(prev => {
            const newPrev = { ...prev };
            delete newPrev[id];
            return newPrev;
          });
        }
      });
    } catch (err) {
      console.error("fetchActiveDownloads error:", err);
      toast({
        title: "Error",
        description: "Failed to fetch active downloads.",
        variant: "destructive",
      });
    }
  };

  // === Trigger Browser Download ===
  const triggerBrowserDownload = (fileUrl: string, filename: string) => {
    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = filename || "downloaded_file";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // === Connect WebSocket ===
  const connectWebSocket = (downloadId: string, isNew: boolean = false, entry?: any, onStart?: () => void) => {
    const wsUrl = `ws://localhost:8000/ws/download/${downloadId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (isNew) {
        ws.send(JSON.stringify({
          url: entry.url,
          type: entry.type,
          quality: entry.quality,
          format: entry.format || "mp4",
        }));
        if (onStart) {
          onStart();
        }
      }
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setActiveDownloads(prev => ({
        ...prev,
        [downloadId]: {
          ...prev[downloadId],
          progress: data.percent || prev[downloadId]?.progress || 0,
          status: data.status,
          speed: data.speed,
          eta: data.eta,
          total: data.total,
        }
      }));

      if (data.status === "reconnected") {
        toast({
          title: "Reconnected",
          description: data.message,
        });
      }

      if (data.status === "completed" || data.status === "error" || data.status === "cancelled") {
        if (data.status === "completed") {
          toast({
            title: "Download Completed",
            description: `Finished downloading "${entry?.title || data.title || 'video'}"`,
          });
          // Trigger browser download
          if (data.file_url || entry?.filename) {
            const fileUrl = data.file_url || `http://localhost:8000/downloads/${entry?.filename}`;
            triggerBrowserDownload(fileUrl, entry?.title || data.title || "video");
          } else {
            console.warn("No file URL provided for download");
            toast({
              title: "Warning",
              description: "Download completed, but no file URL was provided.",
              variant: "destructive",
            });
          }
        } else if (data.status === "error") {
          toast({
            title: "Download Error",
            description: data.message,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Download Cancelled",
            description: data.message,
            variant: "destructive",
          });
        }
        ws.close();
        fetchHistory(); // Refresh history to include new entry
        setActiveDownloads(prev => {
          const newPrev = { ...prev };
          delete newPrev[downloadId];
          return newPrev;
        });
      }
    };

    ws.onclose = () => {
      console.log(`WebSocket closed for ${downloadId}`);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      toast({
        title: "WebSocket Error",
        description: "Connection error occurred.",
        variant: "destructive",
      });
    };

    wsConnections.current[downloadId] = ws;

    setActiveDownloads(prev => ({
      ...prev,
      [downloadId]: {
        progress: entry?.progress || 0,
        status: entry?.status || "initializing",
        title: entry?.title || "Unknown",
      }
    }));
  };

  // === Cancel Download ===
  const handleCancelDownload = async (downloadId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/cancel/${downloadId}`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to cancel download");
      }
      const data = await response.json();
      toast({
        title: "Download Cancelled",
        description: data.message || "Download has been cancelled.",
        variant: "destructive",
      });

      // Close WebSocket and remove from active downloads
      if (wsConnections.current[downloadId]) {
        wsConnections.current[downloadId].close();
        delete wsConnections.current[downloadId];
      }
      setActiveDownloads(prev => {
        const newPrev = { ...prev };
        delete newPrev[downloadId];
        return newPrev;
      });
    } catch (err) {
      console.error("cancel download error:", err);
      toast({
        title: "Error",
        description: "Failed to cancel download.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchActiveDownloads();
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchActiveDownloads();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "downloadHistory") {
        fetchHistory();
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // === Delete one record ===
  const handleDeleteRecord = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/history/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete from server");
      }
      const updated = history.filter((h) => h.id !== id);
      setHistory(updated);
      localStorage.setItem("downloadHistory", JSON.stringify(updated));
      toast({ title: "Deleted", description: "Download removed from history." });
    } catch (err) {
      console.error("delete error:", err);
      toast({
        title: "Error",
        description: "Failed to delete record.",
        variant: "destructive",
      });
    }
  };

  // === Clear all ===
  const handleClearHistory = async () => {
    try {
      const response = await fetch("http://localhost:8000/api/history", {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to clear from server");
      }
      localStorage.removeItem("downloadHistory");
      setHistory([]);
      toast({ title: "Cleared", description: "All history removed." });
    } catch (err) {
      console.error("clear error:", err);
      toast({
        title: "Error",
        description: "Failed to clear history.",
        variant: "destructive",
      });
    }
  };

  // === Refresh ===
  const handleRefreshHistory = () => {
    fetchHistory();
    fetchActiveDownloads();
    toast({ title: "Refreshed", description: "Download history updated." });
  };

  // === View ===
  const handleView = (entry: DownloadRecord) => {
    try {
      let candidate: string | undefined = entry.url || entry.filename;

      if (!candidate) {
        const vals = Object.values(entry);
        for (const v of vals) {
          if (typeof v !== "string") continue;
          const m = v.match(/https?:\/\/[^\s"']+/i);
          if (m && m[0]) {
            candidate = m[0];
            break;
          }
          if (v.includes("http")) {
            const mm = v.match(/https?:\/\/[^\s"']+/i);
            if (mm && mm[0]) {
              candidate = mm[0];
              break;
            }
          }
        }
      }

      if (candidate && /%[0-9A-F]{2}/i.test(candidate)) {
        try {
          const decoded = decodeURIComponent(candidate);
          const mdec = decoded.match(/https?:\/\/[^\s"']+/i);
          if (mdec && mdec[0]) {
            candidate = mdec[0];
          } else {
            candidate = decoded;
          }
        } catch (err) {
          console.warn("decodeURIComponent failed", err);
        }
      }

      if (candidate && !/^https?:\/\//i.test(candidate) && /^[\w.-]+\.[a-z]{2,}/i.test(candidate)) {
        candidate = "https://" + candidate;
      }

      if (!candidate || candidate.length < 5 || !/https?:\/\//i.test(candidate)) {
        toast({
          title: "URL not available",
          description: "Original video URL is not available for this history item.",
          variant: "destructive",
        });
        console.warn("HistoryTab.handleView: could not find URL in entry", entry);
        return;
      }

      window.open(candidate, "_blank");
    } catch (err) {
      console.error("handleView error:", err);
      toast({
        title: "Error",
        description: "Failed to open URL.",
        variant: "destructive",
      });
    }
  };

  // === Download Again ===
  const handleDownloadAgain = (entry: DownloadRecord) => {
    try {
      setLoadingIds(prev => new Set([...prev, entry.id]));
      const newDownloadId = crypto.randomUUID();
      connectWebSocket(newDownloadId, true, entry, () => {
        setLoadingIds(prev => new Set([...prev].filter(id => id !== entry.id)));
      });
      toast({
        title: "Download Started",
        description: `Started downloading "${entry.title}" again.`,
      });
    } catch (error) {
      setLoadingIds(prev => new Set([...prev].filter(id => id !== entry.id)));
      console.error("Error triggering download:", error);
      toast({
        title: "Error",
        description: "Failed to start download.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCcw className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading history...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.keys(activeDownloads).length > 0 && (
        <div className="mt-10 border-t pt-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">
              Ongoing Downloads 
            </h2>
          </div>
          <div className="space-y-2">
            {Object.entries(activeDownloads).map(([id, dl]) => (
              <div
                key={id}
                className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 hover:bg-muted/40 transition"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex-1">
                    <div className="font-medium">{dl.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {dl.status} • {dl.speed} • ETA: {dl.eta}
                    </div>
                  </div>
                  <CircularProgress value={dl.progress} />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCancelDownload(id)}
                  className="text-destructive hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 ? (
        <div className="mt-10 border-t pt-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">
              Download History 
            </h2>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleRefreshHistory}>
                <RefreshCcw className="w-4 h-4 mr-1" /> Refresh
              </Button>
              <Button size="sm" variant="destructive" onClick={handleClearHistory}>
                <Trash2 className="w-4 h-4 mr-1" /> Clear All
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 hover:bg-muted/40 transition"
              >
                <div className="flex items-center gap-3">
                  {entry.thumbnail && (
                    <img
                      src={entry.thumbnail}
                      alt={entry.title}
                      className="w-12 h-12 object-cover rounded"
                    />
                  )}
                  <div>
                    <div className="font-medium">{entry.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {[
                        entry.format?.toUpperCase(),
                        entry.quality,
                        entry.file_size ? `${entry.file_size}` : null,
                        entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "Unknown date",
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleView(entry)}>
                    <Play className="w-4 h-4 mr-1" /> View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownloadAgain(entry)}
                    disabled={loadingIds.has(entry.id)}
                  >
                    {loadingIds.has(entry.id) ? (
                      <RefreshCcw className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 mr-1" />
                    )}
                    {loadingIds.has(entry.id) ? "Starting..." : "Download Again"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteRecord(entry.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Card className="rounded-lg border text-card-foreground shadow-sm bg-card/60 backdrop-blur-xl border-border/50 p-6 py-12 text-center">
          <CardContent>
            <Download className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No downloads yet</h3>
            <p className="text-muted-foreground">
              Your download history will appear here once you start downloading videos.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default HistoryTab;