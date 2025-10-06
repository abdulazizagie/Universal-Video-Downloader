import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Clock, Eye, ThumbsUp, User } from "lucide-react";

interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: string;
  views: string;
  channel: string;
  description: string;
}

interface VideoPreviewProps {
  videoInfo: VideoInfo;
}

const VideoPreview = ({ videoInfo }: VideoPreviewProps) => {
  return (
    <Card className="bg-card/60 backdrop-blur-xl border-border/50 overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Play className="w-5 h-5 text-primary" />
          Video Preview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Thumbnail */}
          <div className="relative group cursor-pointer">
            <img
              src={videoInfo.thumbnail}
              alt={videoInfo.title}
              className="w-full h-32 object-cover rounded-lg bg-muted"
            />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors rounded-lg flex items-center justify-center">
              <Play className="w-8 h-8 text-white opacity-80 group-hover:opacity-100 transition-opacity" />
            </div>
            <Badge className="absolute bottom-2 right-2 bg-black/80 text-white">
              <Clock className="w-3 h-3 mr-1" />
              {videoInfo.duration}
            </Badge>
          </div>
          
          {/* Video Info */}
          <div className="md:col-span-2 space-y-3">
            <div>
              <h3 className="font-medium text-foreground line-clamp-2 mb-2">
                {videoInfo.title}
              </h3>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {videoInfo.channel}
                </div>
                <div className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  {videoInfo.views}
                </div>
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground line-clamp-2">
              {videoInfo.description}
            </p>
            
            <div className="flex gap-2">
              <Badge variant="secondary" className="text-xs">
                HD Quality
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Available
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default VideoPreview;