import { Badge } from "@/components/ui/badge";
import { Youtube, Video, Facebook, Instagram, Music, Twitter } from "lucide-react";

const platforms = [
  { name: "YouTube", icon: Youtube, color: "from-red-500 to-red-600" },
  { name: "Vimeo", icon: Video, color: "from-blue-500 to-blue-600" },
  { name: "Facebook", icon: Facebook, color: "from-blue-600 to-blue-700" },
  { name: "Instagram", icon: Instagram, color: "from-pink-500 to-purple-600" },
  { name: "TikTok", icon: Music, color: "from-black to-gray-800" },
  { name: "Twitter", icon: Twitter, color: "from-blue-400 to-blue-500" },
];

const PlatformIcons = () => {
  return (
    <div className="flex flex-wrap justify-center gap-4 mb-8">
      {platforms.map((platform, index) => {
        const IconComponent = platform.icon;
        return (
          <Badge 
            key={platform.name}
            variant="secondary" 
            className={`
              px-4 py-2 bg-gradient-to-r ${platform.color} 
              text-white border-0 hover:scale-105 transition-transform duration-200
              animate-fade-in
            `}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <IconComponent className="w-4 h-4 mr-2" />
            {platform.name}
          </Badge>
        );
      })}
    </div>
  );
};

export default PlatformIcons;