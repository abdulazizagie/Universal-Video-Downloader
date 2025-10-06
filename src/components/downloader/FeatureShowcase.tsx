import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Download, 
  Zap, 
  Shield, 
  History, 
  Settings, 
  Eye, 
  Gauge, 
  Globe,
  Music,
  Video
} from "lucide-react";

const features = [
  {
    icon: Globe,
    title: "Multi-Platform Support",
    description: "Download from YouTube, Vimeo, Facebook, Instagram, TikTok, and more",
    color: "from-blue-500 to-cyan-500"
  },
  {
    icon: Eye,
    title: "Video Preview",
    description: "See video details, thumbnail, duration, and channel info before downloading",
    color: "from-purple-500 to-pink-500"
  },
  {
    icon: Download,
    title: "Multiple Formats",
    description: "Support for MP4, MP3, WEBM, AVI, and more with quality options up to 4K",
    color: "from-green-500 to-emerald-500"
  },
  {
    icon: Gauge,
    title: "Real-time Progress",
    description: "Live download progress with percentage indicator and smooth animations",
    color: "from-orange-500 to-red-500"
  },
  {
    icon: History,
    title: "Download History",
    description: "Track all downloads with format, quality, size, and date information",
    color: "from-indigo-500 to-blue-500"
  },
  {
    icon: Settings,
    title: "Advanced Settings",
    description: "Customizable preferences, auto-fetch options, and history management",
    color: "from-teal-500 to-green-500"
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Optimized download engine with concurrent downloads support",
    color: "from-yellow-500 to-orange-500"
  },
  {
    icon: Shield,
    title: "Secure & Private",
    description: "No data stored on external servers, all processing done locally",
    color: "from-red-500 to-pink-500"
  }
];

const FeatureShowcase = () => {
  return (
    <div className="mt-16">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold gradient-text mb-4">
          Professional Features
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Everything you need for professional video downloading with enterprise-level capabilities
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {features.map((feature, index) => {
          const IconComponent = feature.icon;
          return (
            <Card 
              key={feature.title}
              className="bg-card/40 backdrop-blur-xl border-border/30 hover:bg-card/60 transition-all duration-300 hover:scale-105 group"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardContent className="p-4 text-center">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${feature.color} p-3 mx-auto mb-3 group-hover:scale-110 transition-transform duration-300`}>
                  <IconComponent className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-sm mb-2">{feature.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Additional Stats */}
      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold gradient-text">8+</div>
          <div className="text-sm text-muted-foreground">Supported Platforms</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold gradient-text">10+</div>
          <div className="text-sm text-muted-foreground">Video Formats</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold gradient-text">4K</div>
          <div className="text-sm text-muted-foreground">Max Quality</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold gradient-text">99.9%</div>
          <div className="text-sm text-muted-foreground">Success Rate</div>
        </div>
      </div>
    </div>
  );
};

export default FeatureShowcase;