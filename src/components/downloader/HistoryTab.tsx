// import { useState, useEffect } from "react";
// import { Button } from "@/components/ui/button";
// import { Card, CardContent } from "@/components/ui/card";
// import { Trash2, Download, RefreshCcw, Play } from "lucide-react";
// import { useToast } from "@/hooks/use-toast";

// interface DownloadRecord {
//   id: string;
//   title: string;
//   video_url?: string;
//   url?: string;
//   downloadUrl?: string;
//   thumbnail?: string;
//   format: string;
//   quality: string;
//   file_size?: string;
//   created_at: string;
// }

// const HistoryTab = () => {
//   const [history, setHistory] = useState<DownloadRecord[]>([]);
//   const [isLoading, setIsLoading] = useState(true);
//   const { toast } = useToast();

//   // === Load history from localStorage ===
//   const fetchHistory = async () => {
//     setIsLoading(true);
//     try {
//       const localHistory = JSON.parse(localStorage.getItem("downloadHistory") || "[]");
//       setHistory(localHistory);
//     } catch {
//       toast({
//         title: "Error",
//         description: "Failed to fetch download history.",
//         variant: "destructive",
//       });
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   useEffect(() => {
//     fetchHistory();
//   }, []);

//   // === Delete one record ===
//   const handleDeleteRecord = (id: string) => {
//     try {
//       const updated = history.filter((h) => h.id !== id);
//       localStorage.setItem("downloadHistory", JSON.stringify(updated));
//       setHistory(updated);
//       toast({ title: "Deleted", description: "Download removed from history." });
//     } catch {
//       toast({
//         title: "Error",
//         description: "Failed to delete record.",
//         variant: "destructive",
//       });
//     }
//   };

//   // === Clear all ===
//   const handleClearHistory = () => {
//     localStorage.removeItem("downloadHistory");
//     setHistory([]);
//     toast({ title: "Cleared", description: "All history removed." });
//   };

//   // === Refresh ===
//   const handleRefreshHistory = () => {
//     fetchHistory();
//     toast({ title: "Refreshed", description: "Download history updated." });
//   };

//   // === View ===
//   const handleView = (entry: DownloadRecord) => {
//     const url = entry.video_url || entry.url || entry.downloadUrl;
//     if (url) {
//       window.open(url, "_blank");
//     } else {
//       toast({
//         title: "Error",
//         description: "Video URL not found in this record.",
//         variant: "destructive",
//       });
//     }
//   };

//   if (isLoading) {
//     return (
//       <div className="flex items-center justify-center py-12">
//         <RefreshCcw className="w-6 h-6 animate-spin text-primary" />
//         <span className="ml-2 text-muted-foreground">Loading history...</span>
//       </div>
//     );
//   }

//   // === Main UI ===
//   return (
//     <div className="space-y-6">
//       {history.length > 0 ? (
//         <div className="mt-10 border-t pt-6 space-y-4">
//           <div className="flex justify-between items-center">
//             <h2 className="text-lg font-semibold">
//               Download History ({history.length})
//             </h2>
//             <div className="flex gap-2">
//               <Button size="sm" variant="outline" onClick={handleRefreshHistory}>
//                 <RefreshCcw className="w-4 h-4 mr-1" /> Refresh
//               </Button>
//               <Button size="sm" variant="destructive" onClick={handleClearHistory}>
//                 <Trash2 className="w-4 h-4 mr-1" /> Clear All
//               </Button>
//             </div>
//           </div>

//           <div className="space-y-2">
//             {history.map((entry) => (
//               <div
//                 key={entry.id}
//                 className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 hover:bg-muted/40 transition"
//               >
//                 <div className="flex items-center gap-3">
//                   {entry.thumbnail && (
//                     <img
//                       src={entry.thumbnail}
//                       alt={entry.title}
//                       className="w-12 h-12 object-cover rounded"
//                     />
//                   )}
//                   <div>
//                     <div className="font-medium">{entry.title}</div>
//                     <div className="text-sm text-muted-foreground">
//                       {entry.format?.toUpperCase()} • {entry.quality}
//                     </div>
//                   </div>
//                 </div>

//                 <div className="flex gap-2">
//                   <Button size="sm" variant="outline" onClick={() => handleView(entry)}>
//                     <Play className="w-4 h-4 mr-1" /> View
//                   </Button>
//                   <Button
//                     size="sm"
//                     variant="ghost"
//                     onClick={() => handleDeleteRecord(entry.id)}
//                     className="text-destructive hover:text-destructive"
//                   >
//                     <Trash2 className="w-4 h-4" />
//                   </Button>
//                 </div>
//               </div>
//             ))}
//           </div>
//         </div>
//       ) : (
//         <Card className="rounded-lg border text-card-foreground shadow-sm bg-card/60 backdrop-blur-xl border-border/50 p-6 py-12 text-center">
//           <CardContent>
//             <Download className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
//             <h3 className="text-lg font-medium mb-2">No downloads yet</h3>
//             <p className="text-muted-foreground">
//               Your download history will appear here once you start downloading videos.
//             </p>
//           </CardContent>
//         </Card>
//       )}
//     </div>
//   );
// };

// export default HistoryTab;


import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, Download, RefreshCcw, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DownloadRecord {
  id: string;
  title: string;
  video_url?: string;
  url?: string;
  downloadUrl?: string;
  thumbnail?: string;
  format: string;
  quality: string;
  file_size?: string;
  created_at: string;
}

const HistoryTab = () => {
  const [history, setHistory] = useState<DownloadRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // === Load history from localStorage (latest 5 only) ===
  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const localHistory = JSON.parse(localStorage.getItem("downloadHistory") || "[]");
      // Only show latest 5 entries
      const latest5 = localHistory.slice(0, 5);
      setHistory(latest5);
    } catch {
      toast({
        title: "Error",
        description: "Failed to fetch download history.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // === Delete one record ===
  const handleDeleteRecord = (id: string) => {
    try {
      // Get full history from localStorage
      const fullHistory = JSON.parse(localStorage.getItem("downloadHistory") || "[]");
      const updated = fullHistory.filter((h: DownloadRecord) => h.id !== id);
      localStorage.setItem("downloadHistory", JSON.stringify(updated));
      
      // Update displayed history (latest 5)
      setHistory(updated.slice(0, 5));
      toast({ title: "Deleted", description: "Download removed from history." });
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete record.",
        variant: "destructive",
      });
    }
  };

  // === Clear all ===
  const handleClearHistory = () => {
    localStorage.removeItem("downloadHistory");
    setHistory([]);
    toast({ title: "Cleared", description: "All history removed." });
  };

  // === Refresh ===
  const handleRefreshHistory = () => {
    fetchHistory();
    toast({ title: "Refreshed", description: "Download history updated." });
  };

  // === View ===
  const handleView = (entry: DownloadRecord) => {
    const url = entry.video_url || entry.url || entry.downloadUrl;
    if (url) {
      window.open(url, "_blank");
    } else {
      toast({
        title: "Error",
        description: "Video URL not found in this record.",
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

  // === Main UI ===
  return (
    <div className="space-y-6">
      {history.length > 0 ? (
        <div className="mt-10 border-t pt-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">
              Recent Downloads (Latest 5)
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
                      {entry.format?.toUpperCase()} • {entry.quality}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleView(entry)}>
                    <Play className="w-4 h-4 mr-1" /> View
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