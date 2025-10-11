"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Eye, Loader2, Download, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import VideoPreview from "./VideoPreview";
import axios from "axios";

// ============================================
// INTERFACES & TYPES
// ============================================
interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: string;
  views: string;
  channel: string;
  description: string;
}

interface DownloadHistory {
  id: string;
  title: string;
  url: string;
  quality: string;
  format: string;
  type: string;
  timestamp: number;
  thumbnail?: string;
}

interface DownloadState {
  isDownloading: boolean;
  progress: number;
  statusMessage: string;
  downloadId: string;
  url: string;
  quality: string;
  format: string;
  downloadType: string;
}

interface UserSelections {
  quality: string;
  format: string;
  downloadType: string;
}

// ============================================
// MAIN COMPONENT
// ============================================
const DownloadTab = () => {
  // ============================================
  // STATE DECLARATIONS
  // ============================================
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState("mp4");
  const [quality, setQuality] = useState("720p");
  const [downloadType, setDownloadType] = useState("video");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [history, setHistory] = useState<DownloadHistory[]>([]);
  
  // Download state
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadId, setDownloadId] = useState<string>("");
  
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const isInitialMount = useRef(true);

  // ============================================
  // CONSTANTS
  // ============================================
  const formats = {
    video: ["mp4", "mp3","webm", "avi", "mov"],
    audio: ["mp3", "m4a", "wav", "flac"]
  };
  const qualities = ["4K", "2K", "1080p", "720p", "480p", "360p", "240p", "144p"];

  // ============================================
  // HELPER FUNCTIONS
  // ============================================
  const getFileExtensionFromMimeType = (mimeType: string): string => {
    const mimeMap: { [key: string]: string } = {
      'video/mp4': 'mp4',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'video/webm': 'webm',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'application/zip': 'zip'
    };
    return mimeMap[mimeType] || '';
  };

  const validateUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      const supportedDomains = [
        'youtube.com', 'youtu.be',
        'tiktok.com',
        'instagram.com',
        'facebook.com', 'fb.watch',
        'twitter.com', 'x.com',
        'reddit.com',
        'vimeo.com',
        'dailymotion.com'
      ];
      
      return supportedDomains.some(domain => parsed.hostname.includes(domain));
    } catch {
      return false;
    }
  };

  const checkServerConnection = async (): Promise<boolean> => {
    try {
      const response = await axios.get('http://127.0.0.1:8000/', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  };

  const sanitizeFilename = (name: string) => {
    return name.replace(/[^a-z0-9_\-\.]/gi, "_");
  };

  // ============================================
  // FIX 1: LOAD INITIAL STATE ONLY ONCE
  // ============================================
  useEffect(() => {
    try {
      // Load history
      const savedHistory = localStorage.getItem("downloadHistory");
      if (savedHistory) setHistory(JSON.parse(savedHistory));

      // Load preview state
      const savedPreview = localStorage.getItem("videoPreviewState");
      if (savedPreview) {
        const parsed = JSON.parse(savedPreview);
        setVideoInfo(parsed.videoInfo);
        setShowPreview(true);
        setUrl(parsed.url);
      }

      // ✅ FIX: Load user selections FIRST (before settings defaults)
      const savedSelections = localStorage.getItem("userSelections");
      if (savedSelections) {
        const selections: UserSelections = JSON.parse(savedSelections);
        setQuality(selections.quality);
        setFormat(selections.format);
        setDownloadType(selections.downloadType);
      } else {
        // Only load settings defaults if no user selections exist
        const savedSettings = localStorage.getItem("userSettings");
        if (savedSettings) {
          const parsed = JSON.parse(savedSettings);
          if (parsed.default_quality) setQuality(parsed.default_quality);
          if (parsed.default_format) setFormat(parsed.default_format);
          if (parsed.default_type) setDownloadType(parsed.default_type);
        }
      }

      // Load active download state
      const savedDownloadState = localStorage.getItem("activeDownloadState");
      if (savedDownloadState) {
        const downloadState: DownloadState = JSON.parse(savedDownloadState);
        
        setIsDownloading(downloadState.isDownloading);
        setProgress(downloadState.progress);
        setStatusMessage(downloadState.statusMessage);
        setDownloadId(downloadState.downloadId);
        setUrl(downloadState.url);
        setQuality(downloadState.quality);
        setFormat(downloadState.format);
        setDownloadType(downloadState.downloadType);

        // ✅ FIX 2: Reconnect WebSocket if download was active
        if (downloadState.isDownloading && downloadState.downloadId) {
          reconnectWebSocket(downloadState.downloadId);
          toast({
            title: "Download Resumed",
            description: "Reconnected to your active download"
          });
        }
      }

      isInitialMount.current = false;
    } catch (err) {
      console.error("Error loading saved state:", err);
      localStorage.removeItem("downloadHistory");
      localStorage.removeItem("activeDownloadState");
      localStorage.removeItem("userSelections");
    }
  }, []);

  // ============================================
  // FIX 1: PERSIST USER SELECTIONS ON CHANGE
  // ============================================
  useEffect(() => {
    if (!isInitialMount.current) {
      const selections: UserSelections = {
        quality,
        format,
        downloadType
      };
      localStorage.setItem("userSelections", JSON.stringify(selections));
    }
  }, [quality, format, downloadType]);

  // ============================================
  // SAVE DOWNLOAD STATE ON CHANGE
  // ============================================
  useEffect(() => {
    if (isDownloading) {
      const downloadState: DownloadState = {
        isDownloading,
        progress,
        statusMessage,
        downloadId,
        url,
        quality,
        format,
        downloadType
      };
      localStorage.setItem("activeDownloadState", JSON.stringify(downloadState));
    } else {
      localStorage.removeItem("activeDownloadState");
    }
  }, [isDownloading, progress, statusMessage, downloadId, url, quality, format, downloadType]);

  // ============================================
  // FIX 2: RECONNECT WEBSOCKET FUNCTION
  // ============================================
  const reconnectWebSocket = (existingDownloadId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    const ws = new WebSocket(`ws://127.0.0.1:8000/ws/download/${existingDownloadId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket reconnected for download:", existingDownloadId);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("WS DATA (reconnected):", data);

      handleWebSocketMessage(data);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      toast({
        title: "Connection Error",
        description: "Failed to connect to download server. Make sure the backend is running on port 8000.",
        variant: "destructive"
      });
      resetDownloadState();
    };

    ws.onclose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason);
      wsRef.current = null;
      
      // Only show message if it wasn't a normal closure
      if (event.code !== 1000 && isDownloading) {
        toast({
          title: "Connection Lost",
          description: "Download connection was interrupted",
          variant: "destructive"
        });
        resetDownloadState();
      }
    };
  };

  // ============================================
  // WEB SOCKET MESSAGE HANDLER
  // ============================================
  const handleWebSocketMessage = (data: any) => {
    if (data.status === "reconnected") {
      setProgress(data.percent);
      setStatusMessage(`Reconnected! ${data.message}`);
    }
    else if (data.status === "downloading") {
      const percentNum = typeof data.percent === "number" ? data.percent : parseFloat(data.percent);
      setProgress(percentNum);

      const fragInfo = data.fragment_count > 0 
        ? ` (frag ${data.fragment_index}/${data.fragment_count})`
        : "";

      setStatusMessage(
        `[download] ${percentNum.toFixed(1)}% of ~${data.total} at ${data.speed} ETA ${data.eta}${fragInfo}`
      );
    } 
    else if (data.status === "processing") {
      setProgress(95);
      setStatusMessage(data.message);
    } 
    else if (data.status === "completed") {
      setProgress(100);
      setStatusMessage("Download Complete!");
      
      // ✅ FIX: Add proper file download with error handling
      if (data.filename && data.file_url) {
        setTimeout(() => downloadFile(data.filename, data.file_url), 500);
      } else {
        toast({
          title: "Download Error",
          description: "No filename received from server",
          variant: "destructive"
        });
        resetDownloadState();
      }
    } 
    else if (data.status === "cancelled") {
      setStatusMessage("Download cancelled");
      toast({
        title: "Download Cancelled",
        description: "Download stopped by user"
      });
      resetDownloadState();
    } 
    else if (data.status === "error") {
      toast({
        title: "Download Failed",
        description: data.message,
        variant: "destructive"
      });
      resetDownloadState();
    }
  };

  // ============================================
  // SAVE TO HISTORY
  // ============================================
  const saveToHistory = (filename: string) => {
    const newEntry: DownloadHistory = {
      id: Date.now().toString(),
      title: videoInfo?.title || filename,
      url,
      quality,
      format,
      type: downloadType,
      timestamp: Date.now(),
      thumbnail: videoInfo?.thumbnail,
    };
    const updated = [newEntry, ...history].slice(0, 50);
    setHistory(updated);
    localStorage.setItem("downloadHistory", JSON.stringify(updated));
  };

  // ============================================
  // FETCH VIDEO INFO
  // ============================================
  const fetchVideoInfo = async (videoUrl: string) => {
    setIsLoading(true);
    try {
      const response = await axios.post("http://127.0.0.1:8000/api/video-info", {
        url: videoUrl
      });
      const data = response.data;

      const info: VideoInfo = {
        title: data.title || "Unknown Title",
        thumbnail: data.thumbnail || "",
        duration: data.duration || "Unknown",
        views: data.view_count || "0",
        channel: data.channel || data.uploader || "Unknown",
        description: data.description || "Description not provided",
      };

      setVideoInfo(info);
      setShowPreview(true);
      localStorage.setItem("videoPreviewState", JSON.stringify({
        url: videoUrl,
        videoInfo: info
      }));
      toast({
        title: "Video Info Retrieved",
        description: "Video details loaded successfully"
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.response?.data?.detail || "Failed to fetch video info",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // HANDLE DOWNLOAD
  // ============================================
  const handleDownload = async () => {
    if (!url) {
      return toast({
        title: "Error",
        description: "Please enter a video URL",
        variant: "destructive"
      });
    }

    // Validate URL
    if (!validateUrl(url)) {
      return toast({
        title: "Invalid URL",
        description: "Please enter a valid video URL from supported platforms",
        variant: "destructive"
      });
    }

    // Check server connection
    const isServerRunning = await checkServerConnection();
    if (!isServerRunning) {
      return toast({
        title: "Server Not Running",
        description: "Please make sure the download server is running on port 8000",
        variant: "destructive"
      });
    }

    const newDownloadId = `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setDownloadId(newDownloadId);
    setIsDownloading(true);
    setProgress(0);
    setStatusMessage("Initializing download...");

    const ws = new WebSocket(`ws://127.0.0.1:8000/ws/download/${newDownloadId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        url,
        type: downloadType,
        quality: downloadType === "audio" ? format : quality,
        format: format
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("WS DATA:", data);
      handleWebSocketMessage(data);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      toast({
        title: "Connection Error",
        description: "Failed to connect to download server. Make sure the backend is running on port 8000.",
        variant: "destructive"
      });
      resetDownloadState();
    };

    ws.onclose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason);
      wsRef.current = null;
      
      // Only show message if it wasn't a normal closure
      if (event.code !== 1000 && isDownloading) {
        toast({
          title: "Connection Lost",
          description: "Download connection was interrupted",
          variant: "destructive"
        });
        resetDownloadState();
      }
    };
  };

  // ============================================
  // DOWNLOAD FILE FROM SERVER
  // ============================================
  const downloadFile = async (filename: string, fileUrl?: string) => {
    try {
      setStatusMessage("Preparing download...");
      
      // Use provided file URL or construct it
      const downloadUrl = fileUrl || `http://127.0.0.1:8000/downloads/${encodeURIComponent(filename)}`;
      
      const response = await axios.get(downloadUrl, {
        responseType: 'blob',
        timeout: 30000,
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = (progressEvent.loaded / progressEvent.total) * 100;
            setStatusMessage(`Saving file... ${percent.toFixed(1)}%`);
          }
        }
      });

      // Check if we got a valid blob
      if (!response.data || response.data.size === 0) {
        throw new Error("Empty file received");
      }

      const blob = new Blob([response.data]);
      
      // Detect file type and set proper extension
      let finalFilename = sanitizeFilename(filename);
      const contentType = response.headers['content-type'];
      
      if (contentType) {
        const ext = getFileExtensionFromMimeType(contentType);
        if (ext && !finalFilename.toLowerCase().endsWith(ext.toLowerCase())) {
          finalFilename += `.${ext}`;
        }
      }

      const downloadUrlObject = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrlObject;
      a.download = finalFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrlObject);

      saveToHistory(filename);
      toast({
        title: "Download Complete",
        description: `Downloaded ${finalFilename} successfully`
      });

      setTimeout(resetDownloadState, 2000);
    } catch (err: any) {
      console.error("Download file error:", err);
      toast({
        title: "Download Failed",
        description: err.response?.data?.detail || err.message || "Failed to save file to device",
        variant: "destructive"
      });
      resetDownloadState();
    }
  };

  // ============================================
  // RESET DOWNLOAD STATE
  // ============================================
  const resetDownloadState = () => {
    setIsDownloading(false);
    setProgress(0);
    setStatusMessage("");
    setDownloadId("");
    localStorage.removeItem("activeDownloadState");
  };

  // ============================================
  // CANCEL DOWNLOAD
  // ============================================
  const handleCancel = async () => {
    if (!downloadId) {
      resetDownloadState();
      return;
    }

    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
        wsRef.current = null;
      }

      await axios.post(`http://127.0.0.1:8000/api/cancel/${downloadId}`);
      
      toast({
        title: "Cancelled",
        description: "Download cancelled successfully"
      });
    } catch (err) {
      console.error("Error cancelling download:", err);
      toast({
        title: "Cancelled",
        description: "Download stopped locally"
      });
    } finally {
      resetDownloadState();
    }
  };

  // ============================================
  // PREVIEW HANDLER
  // ============================================
  const handlePreview = () => {
    if (url) {
      fetchVideoInfo(url);
    } else {
      toast({
        title: "Error",
        description: "Enter video URL",
        variant: "destructive"
      });
    }
  };

  // ============================================
  // CLEAR FORM
  // ============================================
  const clearForm = () => {
    setUrl("");
    setVideoInfo(null);
    setShowPreview(false);
    localStorage.removeItem("videoPreviewState");
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="space-y-6">
      {/* URL INPUT SECTION */}
      <div className="space-y-2">
        <Label htmlFor="url">Video URL</Label>
        <div className="flex gap-2">
          <Input
            id="url"
            placeholder="Paste video URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isDownloading}
          />
          <Button
            onClick={handlePreview}
            disabled={isLoading || !url || isDownloading}
            variant="outline"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
            Preview
          </Button>
        </div>
      </div>

      {/* VIDEO PREVIEW SECTION */}
      {showPreview && videoInfo && <VideoPreview videoInfo={videoInfo} />}

      {/* DOWNLOAD OPTIONS SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Download Type</Label>
          <Select value={downloadType} onValueChange={setDownloadType} disabled={isDownloading}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="video">Video</SelectItem>
              <SelectItem value="audio">Audio</SelectItem>
              <SelectItem value="thumbnail">Thumbnail</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Format</Label>
          <Select value={format} onValueChange={setFormat} disabled={isDownloading}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {formats[downloadType as keyof typeof formats]?.map((fmt) => (
                <SelectItem key={fmt} value={fmt.toLowerCase()}>
                  {fmt.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Quality</Label>
          <Select value={quality} onValueChange={setQuality} disabled={isDownloading || downloadType === "audio"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {downloadType === "audio" ? (
                <SelectItem value="best">Best Quality</SelectItem>
              ) : (
                qualities.map((q) => (
                  <SelectItem key={q} value={q}>
                    {q}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* PROGRESS SECTION */}
      {isDownloading && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Download Progress</span>
            <span>{progress.toFixed(1)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          {statusMessage && (
            <div className="text-xs font-mono text-gray-600 bg-gray-50 p-2 rounded overflow-x-auto">
              {statusMessage}
            </div>
          )}
        </div>
      )}

      {/* ACTION BUTTONS SECTION */}
      <div className="flex gap-3">
        {!isDownloading ? (
          <Button
            onClick={handleDownload}
            disabled={isLoading || !url}
            className="flex-1"
          >
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
        ) : (
          <Button 
            onClick={handleCancel} 
            variant="destructive" 
            className="flex-1"
          >
            <X className="w-4 h-4 mr-2" />
            Cancel Download
          </Button>
        )}

        <Button 
          onClick={clearForm} 
          variant="outline"
          disabled={isDownloading}
        >
          Clear
        </Button>
      </div>
    </div>
  );
};

export default DownloadTab;