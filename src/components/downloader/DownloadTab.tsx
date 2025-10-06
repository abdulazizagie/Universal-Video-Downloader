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
import { Eye, Loader2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import VideoPreview from "./VideoPreview";
import axios, { CancelTokenSource } from "axios";

// Video information interface
interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: string;
  views: string;
  channel: string;
  description: string;
}

// Download history interface
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

// Download state interface for progress and loading
interface DownloadState {
  progress: number;
  status: string;
  isLoading: boolean;
}

const DownloadTab = () => {
  // =======================
  // Step 1: State & refs
  // =======================
  const [url, setUrl] = useState(""); // video URL input
  const [format, setFormat] = useState("mp4"); // selected format
  const [quality, setQuality] = useState("720p"); // selected quality
  const [downloadType, setDownloadType] = useState("video"); // video/audio/thumbnail
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null); // preview info
  const [showPreview, setShowPreview] = useState(false); // toggle preview display
  const [history, setHistory] = useState<DownloadHistory[]>([]); // download history
  const [renderTrigger, setRenderTrigger] = useState(0); // force UI re-render
  const { toast } = useToast(); // toast notifications

  // Ref for download state to persist across renders/tab switches
  const downloadStateRef = useRef<DownloadState>({
    progress: 0,
    status: "",
    isLoading: false,
  });

  // Ref for cancelling download requests
  const cancelTokenRef = useRef<CancelTokenSource | null>(null);

  // Available formats and qualities
  const formats = { video: ["MP4", "WEBM", "AVI", "MOV"], audio: ["MP3", "M4A", "WAV", "FLAC"] };
  const qualities = ["4K","2K","1080p","720p","480p","360p","240p","144p"];

  // Force UI re-render
  const forceRender = () => setRenderTrigger(prev => prev + 1);

  // =======================
  // Step 3: Save current download state
  const saveDownloadState = () => {
    // Also save current URL so it can be restored after tab switch
    const stateToSave = { ...downloadStateRef.current, url };
    localStorage.setItem("downloadState", JSON.stringify(stateToSave));
    forceRender();
  };

  // Step 2: Load previous state
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem("downloadHistory");
      if (savedHistory) setHistory(JSON.parse(savedHistory));

      const savedDownload = localStorage.getItem("downloadState");
      if (savedDownload) {
        const parsed = JSON.parse(savedDownload);
        downloadStateRef.current = parsed;
        if (parsed.url) setUrl(parsed.url); // restore URL input
        forceRender();
      }

      const savedPreview = localStorage.getItem("videoPreviewState");
      if (savedPreview) {
        const parsed = JSON.parse(savedPreview);
        setVideoInfo(parsed.videoInfo);
        setShowPreview(true);
      }
    } catch {
      localStorage.removeItem("downloadHistory"); // clear invalid storage
    }
  }, []);

  // =======================
  // Step 4: Save new download entry to history
  // =======================
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

  // =======================
  // Step 5: Fetch video info (preview)
  // =======================
  const fetchVideoInfo = async (videoUrl: string) => {
    downloadStateRef.current.isLoading = true; // show loading spinner
    saveDownloadState();

    try {
      const response = await axios.post("http://127.0.0.1:8000/api/video-info", { url: videoUrl });
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
      setShowPreview(true); // display preview component
      localStorage.setItem("videoPreviewState", JSON.stringify({ url: videoUrl, videoInfo: info }));
      toast({ title: "Video Info Retrieved", description: "Video details loaded successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.detail || "Failed to fetch video info", variant: "destructive" });
    } finally {
      downloadStateRef.current.isLoading = false;
      saveDownloadState();
    }
  };

  // =======================
  // Step 6: Handle download with live progress & cancel
  // =======================
  const handleDownload = async () => {
    if (!url) return toast({ title: "Error", description: "Please enter a video URL", variant: "destructive" });

    downloadStateRef.current.isLoading = true;
    downloadStateRef.current.progress = 0;
    downloadStateRef.current.status = "";
    saveDownloadState();

    cancelTokenRef.current = axios.CancelToken.source();

    let lastTime = Date.now();
    let lastLoaded = 0;

    try {
      const response = await axios.post(
        "http://127.0.0.1:8000/api/download",
        { url, format, quality, type: downloadType },
        {
          responseType: "blob",
          cancelToken: cancelTokenRef.current.token,
          onDownloadProgress: (e) => {
            if (e.total) {
              // Update percentage
              const percent = (e.loaded / e.total) * 100;
              downloadStateRef.current.progress = percent;

              // Calculate speed & ETA
              const now = Date.now();
              const deltaTime = (now - lastTime)/1000;
              const deltaLoaded = e.loaded - lastLoaded;
              const speed = deltaLoaded / (1024*1024) / deltaTime;
              const remainingMiB = e.total - e.loaded;
              const etaSec = remainingMiB / (speed*1024*1024);
              const etaMin = Math.floor(etaSec / 60);
              const etaSeconds = Math.floor(etaSec % 60);

              // Update status
              downloadStateRef.current.status = `[download] ${percent.toFixed(1)}% ~${(e.total/(1024*1024)).toFixed(2)}MiB at ${speed.toFixed(2)}MiB/s ETA ${etaMin.toString().padStart(2,"0")}:${etaSeconds.toString().padStart(2,"0")}`;

              saveDownloadState(); // persist progress
              lastTime = now;
              lastLoaded = e.loaded;
            }
          },
        }
      );

      // Create download blob
      const blob = new Blob([response.data], { type: response.headers["content-type"] || "application/octet-stream" });
      const downloadUrl = window.URL.createObjectURL(blob);

      // Determine filename
      let filename = "video.mp4";
      const contentDisposition = response.headers["content-disposition"];
      if (contentDisposition) {
        const match = contentDisposition.match(/filename\*?=([^;]+)/);
        if (match && match[1]) filename = decodeURIComponent(match[1].replace("utf-8''",""));
      }

      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      saveToHistory(filename); // save completed download
      downloadStateRef.current.progress = 100;
      downloadStateRef.current.status = "Download Complete";
      saveDownloadState();
      toast({ title: "Download Complete", description: `Downloaded ${filename} successfully` });
    } catch (err: any) {
      if (axios.isCancel(err)) toast({ title: "Download Cancelled", description: "Download stopped by user" });
      else toast({ title: "Download Failed", description: err.response?.data?.detail || "Error during download", variant: "destructive" });
      downloadStateRef.current.status = "";
      saveDownloadState();
    } finally {
      downloadStateRef.current.isLoading = false;
      saveDownloadState();
      cancelTokenRef.current = null;
    }
  };

  // =======================
  // Step 7: Preview handler
  // =======================
  const handlePreview = () => {
    if(url) fetchVideoInfo(url);
    else toast({title:"Error", description:"Enter video URL", variant:"destructive"});
  };

  // =======================
  // Step 8: Clear form / cancel download
  // =======================
  const clearForm = () => {
    if (cancelTokenRef.current) cancelTokenRef.current.cancel(); // cancel ongoing download
    setUrl("");
    setVideoInfo(null);
    setShowPreview(false);
    downloadStateRef.current.progress = 0;
    downloadStateRef.current.status = "";
    downloadStateRef.current.isLoading = false;
    saveDownloadState();
    localStorage.removeItem("videoPreviewState");
  };

  // =======================
  // Step 9: Render UI
  // =======================
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="url">Video URL</Label>
        <div className="flex gap-2">
          <Input id="url" placeholder="Paste video URL" value={url} onChange={(e)=>setUrl(e.target.value)} />
          <Button onClick={handlePreview} disabled={downloadStateRef.current.isLoading || !url} variant="outline">
            {downloadStateRef.current.isLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Eye className="w-4 h-4"/>} Preview
          </Button>
        </div>
      </div>

      {showPreview && videoInfo && <VideoPreview videoInfo={videoInfo}/>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Download Type</Label>
          <Select value={downloadType} onValueChange={setDownloadType}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="video">Video</SelectItem>
              <SelectItem value="audio">Audio</SelectItem>
              <SelectItem value="thumbnail">Thumbnail</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Format</Label>
          <Select value={format} onValueChange={setFormat}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              {formats[downloadType as keyof typeof formats].map(fmt => <SelectItem key={fmt} value={fmt.toLowerCase()}>{fmt}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Quality</Label>
          <Select value={quality} onValueChange={setQuality}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              {qualities.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {downloadStateRef.current.progress > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Download Progress</span>
            <span>{Math.round(downloadStateRef.current.progress)}%</span>
          </div>
          <Progress value={downloadStateRef.current.progress} className="h-2"/>
          {downloadStateRef.current.status && <div className="text-sm font-mono text-gray-700">{downloadStateRef.current.status}</div>}
        </div>
      )}

      <div className="flex gap-3">
        <Button onClick={handleDownload} disabled={downloadStateRef.current.isLoading || !url} className="flex-1">
          {downloadStateRef.current.isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Download className="w-4 h-4 mr-2"/>}
          {downloadStateRef.current.isLoading ? "Downloading..." : "Download"}
        </Button>
        <Button onClick={clearForm} variant="outline">Clear</Button>
      </div>
    </div>
  );
};

export default DownloadTab;
