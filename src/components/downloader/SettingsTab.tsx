// import { useState, useEffect } from "react";
// import { Button } from "@/components/ui/button";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import { Label } from "@/components/ui/label";
// import { Switch } from "@/components/ui/switch";
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// import { Separator } from "@/components/ui/separator";
// import { Badge } from "@/components/ui/badge";
// import { Settings, Save, Info, Zap, Shield, Palette } from "lucide-react";
// import { useToast } from "@/hooks/use-toast";
// import { supabase } from "@/integrations/supabase/client";

// interface UserSettings {
//   auto_fetch_info: boolean;
//   default_quality: string;
//   default_format: string;
//   download_location: string;
//   notifications_enabled: boolean;
//   dark_mode: boolean;
//   auto_clear_history: boolean;
//   max_concurrent_downloads: number;
// }

// const SettingsTab = () => {
//   const [settings, setSettings] = useState<UserSettings>({
//     auto_fetch_info: true,
//     default_quality: "720p",
//     default_format: "mp4",
//     download_location: "Downloads",
//     notifications_enabled: true,
//     dark_mode: true,
//     auto_clear_history: false,
//     max_concurrent_downloads: 3,
//   });
//   const [isLoading, setIsLoading] = useState(false);
//   const { toast } = useToast();

//   // Load settings from localStorage on component mount
//   useEffect(() => {
//     try {
//       const savedSettings = localStorage.getItem('userSettings');
//       if (savedSettings) {
//         setSettings(JSON.parse(savedSettings));
//       }
//     } catch (error) {
//       console.log('Failed to load settings:', error);
//     }
//   }, []);

//   const saveSettings = async () => {
//     setIsLoading(true);
//     try {
//       // Mock implementation using localStorage until database is ready
//       localStorage.setItem('userSettings', JSON.stringify(settings));
      
//       toast({
//         title: "Settings Saved",
//         description: "Your preferences have been updated successfully",
//       });
//     } catch (error) {
//       toast({
//         title: "Error",
//         description: "Failed to save settings",
//         variant: "destructive",
//       });
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const updateSetting = (key: keyof UserSettings, value: any) => {
//     setSettings(prev => ({
//       ...prev,
//       [key]: value
//     }));
//   };

//   return (
//     <div className="space-y-6">
//       {/* Header */}
//       <div className="flex items-center gap-2">
//         <Settings className="w-5 h-5 text-primary" />
//         <h2 className="text-xl font-semibold">Settings</h2>
//       </div>

//       {/* Download Preferences */}
//       <Card className="bg-card/60 backdrop-blur-xl border-border/50">
//         <CardHeader>
//           <CardTitle className="flex items-center gap-2 text-lg">
//             <Zap className="w-5 h-5 text-primary" />
//             Download Preferences
//           </CardTitle>
//         </CardHeader>
//         <CardContent className="space-y-6">
//           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
//             <div className="space-y-2">
//               <Label htmlFor="defaultQuality">Default Quality</Label>
//               <Select 
//                 value={settings.default_quality} 
//                 onValueChange={(value) => updateSetting('default_quality', value)}
//               >
//                 <SelectTrigger>
//                   <SelectValue />
//                 </SelectTrigger>
//                 <SelectContent>
//                   <SelectItem value="4K">4K Ultra HD</SelectItem>
//                   <SelectItem value="2K">2K</SelectItem>
//                   <SelectItem value="1080p">1080p Full HD</SelectItem>
//                   <SelectItem value="720p">720p HD</SelectItem>
//                   <SelectItem value="480p">480p</SelectItem>
//                   <SelectItem value="360p">360p</SelectItem>
//                 </SelectContent>
//               </Select>
//             </div>

//             <div className="space-y-2">
//               <Label htmlFor="defaultFormat">Default Format</Label>
//               <Select 
//                 value={settings.default_format} 
//                 onValueChange={(value) => updateSetting('default_format', value)}
//               >
//                 <SelectTrigger>
//                   <SelectValue />
//                 </SelectTrigger>
//                 <SelectContent>
//                   <SelectItem value="mp4">MP4</SelectItem>
//                   <SelectItem value="webm">WEBM</SelectItem>
//                   <SelectItem value="avi">AVI</SelectItem>
//                   <SelectItem value="mov">MOV</SelectItem>
//                 </SelectContent>
//               </Select>
//             </div>
//           </div>

//           <div className="space-y-2">
//             <Label htmlFor="maxDownloads">Maximum Concurrent Downloads</Label>
//             <Select 
//               value={settings.max_concurrent_downloads.toString()} 
//               onValueChange={(value) => updateSetting('max_concurrent_downloads', parseInt(value))}
//             >
//               <SelectTrigger>
//                 <SelectValue />
//               </SelectTrigger>
//               <SelectContent>
//                 <SelectItem value="1">1 Download</SelectItem>
//                 <SelectItem value="2">2 Downloads</SelectItem>
//                 <SelectItem value="3">3 Downloads</SelectItem>
//                 <SelectItem value="5">5 Downloads</SelectItem>
//               </SelectContent>
//             </Select>
//           </div>

//           <div className="flex items-center justify-between">
//             <div className="space-y-1">
//               <Label htmlFor="autoFetch">Auto-fetch video information</Label>
//               <p className="text-sm text-muted-foreground">
//                 Automatically fetch video details when URL is entered
//               </p>
//             </div>
//             <Switch
//               id="autoFetch"
//               checked={settings.auto_fetch_info}
//               onCheckedChange={(checked) => updateSetting('auto_fetch_info', checked)}
//             />
//           </div>
//         </CardContent>
//       </Card>

//       {/* App Preferences */}
//       <Card className="bg-card/60 backdrop-blur-xl border-border/50">
//         <CardHeader>
//           <CardTitle className="flex items-center gap-2 text-lg">
//             <Palette className="w-5 h-5 text-primary" />
//             App Preferences
//           </CardTitle>
//         </CardHeader>
//         <CardContent className="space-y-6">
//           <div className="flex items-center justify-between">
//             <div className="space-y-1">
//               <Label htmlFor="notifications">Push Notifications</Label>
//               <p className="text-sm text-muted-foreground">
//                 Get notified when downloads complete
//               </p>
//             </div>
//             <Switch
//               id="notifications"
//               checked={settings.notifications_enabled}
//               onCheckedChange={(checked) => updateSetting('notifications_enabled', checked)}
//             />
//           </div>

//           <div className="flex items-center justify-between">
//             <div className="space-y-1">
//               <Label htmlFor="darkMode">Dark Mode</Label>
//               <p className="text-sm text-muted-foreground">
//                 Use dark theme throughout the app
//               </p>
//             </div>
//             <Switch
//               id="darkMode"
//               checked={settings.dark_mode}
//               onCheckedChange={(checked) => updateSetting('dark_mode', checked)}
//             />
//           </div>

//           <div className="flex items-center justify-between">
//             <div className="space-y-1">
//               <Label htmlFor="autoClear">Auto-clear History</Label>
//               <p className="text-sm text-muted-foreground">
//                 Automatically clear download history after 30 days
//               </p>
//             </div>
//             <Switch
//               id="autoClear"
//               checked={settings.auto_clear_history}
//               onCheckedChange={(checked) => updateSetting('auto_clear_history', checked)}
//             />
//           </div>
//         </CardContent>
//       </Card>

//       {/* About */}
//       <Card className="bg-card/60 backdrop-blur-xl border-border/50">
//         <CardHeader>
//           <CardTitle className="flex items-center gap-2 text-lg">
//             <Info className="w-5 h-5 text-primary" />
//             About
//           </CardTitle>
//         </CardHeader>
//         <CardContent className="space-y-4">
//           <div className="grid grid-cols-2 gap-4 text-sm">
//             <div>
//               <Label className="text-muted-foreground">Version</Label>
//               <p className="font-medium">2.0.0</p>
//             </div>
//             <div>
//               <Label className="text-muted-foreground">Build</Label>
//               <p className="font-medium">2024.01.15</p>
//             </div>
//             <div>
//               <Label className="text-muted-foreground">Platform</Label>
//               <p className="font-medium">Web App</p>
//             </div>
//             <div>
//               <Label className="text-muted-foreground">API Status</Label>
//               <Badge className="bg-green-500 text-white">Online</Badge>
//             </div>
//           </div>
          
//           <Separator />
          
//           <div className="text-center text-sm text-muted-foreground">
//             <p>Built with ❤️ by AA.AGI TECH</p>
//             <p>Universal Video Downloader - Professional Edition</p>
//           </div>
//         </CardContent>
//       </Card>

//       {/* Save Button */}
//       <div className="flex justify-end">
//         <Button 
//           onClick={saveSettings} 
//           disabled={isLoading}
//           className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
//         >
//           <Save className="w-4 h-4 mr-2" />
//           {isLoading ? "Saving..." : "Save Settings"}
//         </Button>
//       </div>
//     </div>
//   );
// };

// export default SettingsTab;

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Settings, Save, Info, Zap, Palette } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface UserSettings {
  auto_fetch_info: boolean;
  default_quality: string;
  default_format: string;
  download_location: string;
  notifications_enabled: boolean;
  dark_mode: boolean;
  auto_clear_history: boolean;
  auto_clear_days?: number; // 👈 new optional field
  max_concurrent_downloads: number;
}

const SettingsTab = () => {
  const [settings, setSettings] = useState<UserSettings>({
    auto_fetch_info: true,
    default_quality: "720p",
    default_format: "mp4",
    download_location: "Downloads",
    notifications_enabled: true,
    dark_mode: true,
    auto_clear_history: false,
    auto_clear_days: 30, // 👈 default 30 days
    max_concurrent_downloads: 3,
  });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem("userSettings");
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        // ensure we keep the new field if old data doesn't have it
        setSettings((prev) => ({
          ...prev,
          ...parsed,
          auto_clear_days: parsed.auto_clear_days || 30,
        }));
      }
    } catch (error) {
      console.log("Failed to load settings:", error);
    }
  }, []);

  const saveSettings = async () => {
    setIsLoading(true);
    try {
      localStorage.setItem("userSettings", JSON.stringify(settings));
      toast({
        title: "Settings Saved",
        description: "Your preferences have been updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateSetting = (key: keyof UserSettings, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold">Settings</h2>
      </div>

      {/* Download Preferences */}
      <Card className="bg-card/60 backdrop-blur-xl border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="w-5 h-5 text-primary" />
            Download Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="defaultQuality">Default Quality</Label>
              <Select
                value={settings.default_quality}
                onValueChange={(value) => updateSetting("default_quality", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4K">4K Ultra HD</SelectItem>
                  <SelectItem value="2K">2K</SelectItem>
                  <SelectItem value="1080p">1080p Full HD</SelectItem>
                  <SelectItem value="720p">720p HD</SelectItem>
                  <SelectItem value="480p">480p</SelectItem>
                  <SelectItem value="360p">360p</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="defaultFormat">Default Format</Label>
              <Select
                value={settings.default_format}
                onValueChange={(value) => updateSetting("default_format", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp4">MP4</SelectItem>
                  <SelectItem value="webm">WEBM</SelectItem>
                  <SelectItem value="avi">AVI</SelectItem>
                  <SelectItem value="mov">MOV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxDownloads">Maximum Concurrent Downloads</Label>
            <Select
              value={settings.max_concurrent_downloads.toString()}
              onValueChange={(value) =>
                updateSetting("max_concurrent_downloads", parseInt(value))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Download</SelectItem>
                <SelectItem value="2">2 Downloads</SelectItem>
                <SelectItem value="3">3 Downloads</SelectItem>
                <SelectItem value="5">5 Downloads</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="autoFetch">Auto-fetch video information</Label>
              <p className="text-sm text-muted-foreground">
                Automatically fetch video details when URL is entered
              </p>
            </div>
            <Switch
              id="autoFetch"
              checked={settings.auto_fetch_info}
              onCheckedChange={(checked) =>
                updateSetting("auto_fetch_info", checked)
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* App Preferences */}
      <Card className="bg-card/60 backdrop-blur-xl border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palette className="w-5 h-5 text-primary" />
            App Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="notifications">Push Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Get notified when downloads complete
              </p>
            </div>
            <Switch
              id="notifications"
              checked={settings.notifications_enabled}
              onCheckedChange={(checked) =>
                updateSetting("notifications_enabled", checked)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="darkMode">Dark Mode</Label>
              <p className="text-sm text-muted-foreground">
                Use dark theme throughout the app
              </p>
            </div>
            <Switch
              id="darkMode"
              checked={settings.dark_mode}
              onCheckedChange={(checked) => updateSetting("dark_mode", checked)}
            />
          </div>

          {/* === Auto Clear History === */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="autoClear">Auto-clear History</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically clear download history after selected days
                </p>
              </div>
              <Switch
                id="autoClear"
                checked={settings.auto_clear_history}
                onCheckedChange={(checked) =>
                  updateSetting("auto_clear_history", checked)
                }
              />
            </div>

            {/* 👇 Dropdown appears only when enabled */}
            {settings.auto_clear_history && (
              <div className="pl-1">
                <Label htmlFor="autoClearDays">Clear after</Label>
                <Select
                  value={settings.auto_clear_days?.toString() || "30"}
                  onValueChange={(value) =>
                    updateSetting("auto_clear_days", parseInt(value))
                  }
                >
                  <SelectTrigger className="w-40 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="15">15 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card className="bg-card/60 backdrop-blur-xl border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Info className="w-5 h-5 text-primary" />
            About
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <Label className="text-muted-foreground">Version</Label>
              <p className="font-medium">2.0.0</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Build</Label>
              <p className="font-medium">2024.01.15</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Platform</Label>
              <p className="font-medium">Web App</p>
            </div>
            <div>
              <Label className="text-muted-foreground">API Status</Label>
              <Badge className="bg-green-500 text-white">Online</Badge>
            </div>
          </div>

          <Separator />

          <div className="text-center text-sm text-muted-foreground">
            <p>Built with ❤️ by AA.AGI TECH</p>
            <p>Universal Video Downloader - Professional Edition</p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={saveSettings}
          disabled={isLoading}
          className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
        >
          <Save className="w-4 h-4 mr-2" />
          {isLoading ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
};

export default SettingsTab;
