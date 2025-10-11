// import { useState } from "react";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import DownloadTab from "./downloader/DownloadTab";
// import HistoryTab from "./downloader/HistoryTab";
// import SettingsTab from "./downloader/SettingsTab";
// import PlatformIcons from "./downloader/PlatformIcons";
// import FeatureShowcase from "./downloader/FeatureShowcase";

// const VideoDownloader = () => {
//   const [activeTab, setActiveTab] = useState("download");

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20 relative overflow-hidden">
//       {/* Background Effects */}
//       <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
//       <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
//       <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
      
//       <div className="container mx-auto px-4 py-8 relative z-10">
//         {/* Header */}
//         <div className="text-center mb-8">
//           <h1 className="text-4xl font-bold gradient-text mb-4">
//             Universal Video Downloader
//           </h1>
//           <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
//             Download videos from YouTube, Vimeo, Facebook, Instagram, TikTok, and more with advanced AI-powered features
//           </p>
//         </div>

//         {/* Platform Icons */}
//         <PlatformIcons />

//         {/* Main Interface */}
//         <div className="max-w-4xl mx-auto">
//           <div className="bg-card/60 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl">
//             <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
//               <TabsList className="grid w-full grid-cols-3 bg-muted/30 backdrop-blur-sm">
//                 <TabsTrigger value="download" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
//                   Download
//                 </TabsTrigger>
//                 <TabsTrigger value="history" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
//                   History
//                 </TabsTrigger>
//                 <TabsTrigger value="settings" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
//                   Settings
//                 </TabsTrigger>
//               </TabsList>
              
//               <TabsContent value="download" className="mt-6">
//                 <DownloadTab />
//               </TabsContent>
              
//               <TabsContent value="history" className="mt-6">
//                 <HistoryTab />
//               </TabsContent>
              
//               <TabsContent value="settings" className="mt-6">
//                 <SettingsTab />
//               </TabsContent>
//             </Tabs>
//           </div>
//         </div>

//         {/* Feature Showcase */}
//         <FeatureShowcase />
//       </div>
//     </div>
//   );
// };

// export default VideoDownloader;



import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DownloadTab from "./downloader/DownloadTab";
import HistoryTab from "./downloader/HistoryTab";
import SettingsTab from "./downloader/SettingsTab";
import PlatformIcons from "./downloader/PlatformIcons";
import FeatureShowcase from "./downloader/FeatureShowcase";
import VideoConverter from "./downloader/VideoConverter"; // Import the new component

const VideoDownloader = () => {
  const [activeTab, setActiveTab] = useState("download");

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
      
      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold gradient-text mb-4">
            Universal Video Downloader & Converter
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Download videos from YouTube, Vimeo, Facebook, Instagram, TikTok, and more. Convert videos to any format with advanced quality control.
          </p>
        </div>

        {/* Platform Icons */}
        <PlatformIcons />

        {/* Main Interface */}
        <div className="max-w-6xl mx-auto"> {/* Increased max-width for more content */}
          <div className="bg-card/60 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4 bg-muted/30 backdrop-blur-sm"> {/* Changed to 4 columns */}
                <TabsTrigger 
                  value="download" 
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  Download
                </TabsTrigger>
                <TabsTrigger 
                  value="convert" 
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  Convert
                </TabsTrigger>
                <TabsTrigger 
                  value="history" 
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  History
                </TabsTrigger>
                <TabsTrigger 
                  value="settings" 
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  Settings
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="download" className="mt-6">
                <DownloadTab />
              </TabsContent>
              
              <TabsContent value="convert" className="mt-6">
                <VideoConverter />
              </TabsContent>
              
              <TabsContent value="history" className="mt-6">
                <HistoryTab />
              </TabsContent>
              
              <TabsContent value="settings" className="mt-6">
                <SettingsTab />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Feature Showcase */}
        <FeatureShowcase />
      </div>
    </div>
  );
};

export default VideoDownloader;