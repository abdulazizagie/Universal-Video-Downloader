import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DownloadRequest {
  url: string;
  format: string;
  quality: string;
  downloadType: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url, format, quality, downloadType }: DownloadRequest = await req.json();

    console.log('Download request:', { url, format, quality, downloadType });

    // Validate input
    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check if URL is from supported platforms
    const supportedPlatforms = [
      'youtube.com', 'youtu.be', 'vimeo.com', 'facebook.com', 
      'instagram.com', 'tiktok.com', 'twitter.com', 'x.com'
    ];
    
    const isSupported = supportedPlatforms.some(platform => 
      url.toLowerCase().includes(platform)
    );

    if (!isSupported) {
      return new Response(
        JSON.stringify({ error: 'Platform not supported' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Simulate video info extraction (in real implementation, use yt-dlp or similar)
    const videoInfo = {
      title: extractTitleFromUrl(url),
      thumbnail: '/placeholder.svg',
      duration: '5:30',
      views: '1.2M views',
      channel: 'Sample Channel',
      description: 'Sample video description',
      formats: ['MP4', 'WEBM', 'MP3'],
      qualities: ['4K', '1080p', '720p', '480p']
    };

    // For demonstration, simulate download process
    if (req.url.includes('/download')) {
      // In a real implementation, this would:
      // 1. Use yt-dlp or similar tool to download the video
      // 2. Stream the file back to the client
      // 3. Handle progress updates via WebSockets or Server-Sent Events
      
      return new Response(
        JSON.stringify({ 
          message: 'Download started',
          downloadId: generateDownloadId(),
          estimatedSize: '45.2 MB'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Return video info for preview
    return new Response(
      JSON.stringify(videoInfo),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

function extractTitleFromUrl(url: string): string {
  // Simple title extraction from URL
  const urlObj = new URL(url);
  if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
    return 'YouTube Video - Sample Title';
  } else if (urlObj.hostname.includes('vimeo.com')) {
    return 'Vimeo Video - Sample Title';
  } else if (urlObj.hostname.includes('facebook.com')) {
    return 'Facebook Video - Sample Title';
  } else if (urlObj.hostname.includes('instagram.com')) {
    return 'Instagram Video - Sample Title';
  } else if (urlObj.hostname.includes('tiktok.com')) {
    return 'TikTok Video - Sample Title';
  }
  return 'Video Title';
}

function generateDownloadId(): string {
  return Math.random().toString(36).substring(2, 15);
}