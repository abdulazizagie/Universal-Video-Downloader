from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yt_dlp
import requests
import logging
import re
import imageio_ffmpeg
import os
import subprocess
import zipfile
import shutil
import glob
from typing import Optional, List, Dict, Any
from urllib.parse import urlparse

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FFMPEG_PATH = imageio_ffmpeg.get_ffmpeg_exe()
DOWNLOADS_DIR = "./downloads"
COOKIES_FILE = "./cookies.txt"
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

# Enhanced yt-dlp base options with multi-platform support
BASE_YDL_OPTS = {
    'quiet': True,
    'no_warnings': True,
    'ffmpeg_location': FFMPEG_PATH,
    'extract_flat': False,
    'ignoreerrors': False,
}

if os.path.exists(COOKIES_FILE):
    BASE_YDL_OPTS['cookiefile'] = COOKIES_FILE
    logger.info(f"✓ Loaded cookies from {COOKIES_FILE}")
else:
    logger.warning(f"⚠ No cookies file found at {COOKIES_FILE}")

def clean_filename(name: str) -> str:
    """Clean filename for cross-platform compatibility"""
    name = re.sub(r'[\\/*?:"<>|｜]', "_", name)
    return name.strip()[:200]  # Limit length

def cleanup_file(filepath: str):
    """Safely remove file"""
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
            logger.info(f"Cleaned up: {filepath}")
    except Exception as e:
        logger.error(f"Cleanup error for {filepath}: {e}")

def detect_platform(url: str) -> str:
    """Detect platform from URL"""
    domain = urlparse(url).netloc.lower()
    if 'youtube.com' in domain or 'youtu.be' in domain:
        return 'youtube'
    elif 'tiktok.com' in domain:
        return 'tiktok'
    elif 'twitter.com' in domain or 'x.com' in domain:
        return 'twitter'
    elif 'instagram.com' in domain:
        return 'instagram'
    elif 'facebook.com' in domain or 'fb.watch' in domain:
        return 'facebook'
    elif 'reddit.com' in domain:
        return 'reddit'
    elif 'vimeo.com' in domain:
        return 'vimeo'
    elif 'dailymotion.com' in domain:
        return 'dailymotion'
    return 'unknown'

def get_platform_opts(platform: str) -> Dict[str, Any]:
    """Get platform-specific yt-dlp options"""
    opts = {}
    
    if platform == 'tiktok':
        opts['extractor_args'] = {
            'tiktok': {
                'api_hostname': 'api22-normal-c-useast2a.tiktokv.com',
            }
        }
    elif platform == 'twitter':
        # Remove twitter-specific API setting - use default
        pass
    elif platform == 'instagram':
        opts['http_headers'] = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        }
    
    return opts

def parse_quality_request(quality_str: str) -> int:
    """Parse quality string to height value"""
    quality_map = {
        "144p": 144, "240p": 240, "360p": 360, "480p": 480,
        "720p": 720, "1080p": 1080, "1440p": 1440, "2160p": 2160,
        "2K": 1440, "4K": 2160, "8K": 4320
    }
    return quality_map.get(quality_str, int(re.sub(r'\D', '', quality_str)) if re.search(r'\d', quality_str) else 720)

def extract_format_info(fmt: Dict) -> Dict[str, Any]:
    """Extract standardized format information from yt-dlp format dict"""
    height = fmt.get('height')
    width = fmt.get('width')
    
    # Try to extract height from resolution string if not present
    if not height and fmt.get('resolution'):
        res_match = re.search(r'(\d+)x(\d+)', fmt.get('resolution', ''))
        if res_match:
            width, height = int(res_match.group(1)), int(res_match.group(2))
    
    # Use tbr (total bitrate) as quality indicator if no height
    tbr = fmt.get('tbr') or 0
    quality_score = height if height else (tbr / 10 if tbr else 0)
    
    return {
        'format_id': fmt.get('format_id'),
        'ext': fmt.get('ext'),
        'height': height,
        'width': width,
        'resolution': fmt.get('resolution') or (f"{width}x{height}" if width and height else None),
        'vcodec': fmt.get('vcodec'),
        'acodec': fmt.get('acodec'),
        'tbr': fmt.get('tbr'),
        'filesize': fmt.get('filesize') or fmt.get('filesize_approx'),
        'quality_score': quality_score,
    }

def find_best_format(formats: List[Dict], requested_height: int, format_type: str = 'video') -> Optional[Dict]:
    """Find best matching format based on requested quality"""
    if not formats:
        return None
    
    if format_type == 'video':
        candidates = [fmt for fmt in formats if fmt.get('vcodec') != 'none']
    else:
        candidates = [fmt for fmt in formats if fmt.get('acodec') != 'none']
    
    if not candidates:
        return None
    
    # Extract format info
    processed = [extract_format_info(fmt) for fmt in candidates]
    
    # Filter by those with quality_score
    valid = [f for f in processed if f['quality_score'] > 0]
    if not valid:
        return candidates[0]  # Fallback to first available
    
    # Find closest match (prefer equal or lower quality)
    valid_sorted = sorted(valid, key=lambda x: (
        abs(x['quality_score'] - requested_height),  # Closest match
        -x['quality_score']  # Higher quality if tie
    ))
    
    best = valid_sorted[0]
    
    # Find original format dict
    for fmt in candidates:
        if fmt.get('format_id') == best['format_id']:
            logger.info(f"Selected format: {best['format_id']} - {best['resolution']} ({best['ext']}) for requested {requested_height}p")
            return fmt
    
    return candidates[0]

def get_format_details(formats: List[Dict]) -> tuple:
    """Get categorized format details for API response"""
    video_formats = []
    audio_formats = []
    
    for fmt in formats:
        info = extract_format_info(fmt)
        
        if info['vcodec'] and info['vcodec'] != 'none' and info['height']:
            video_formats.append({
                "resolution": f"{info['height']}p" if info['height'] else info['resolution'],
                "format_id": info['format_id'],
                "ext": info['ext'],
                "vcodec": info['vcodec'],
                "filesize": info['filesize'],
                "width": info['width'],
                "height": info['height'],
            })
        elif info['acodec'] and info['acodec'] != 'none':
            audio_formats.append({
                "format": info['ext'],
                "format_id": info['format_id'],
                "acodec": info['acodec'],
                "filesize": info['filesize'],
                "tbr": info['tbr'],
            })
    
    # Remove duplicates based on resolution
    seen = set()
    unique_video = []
    for v in sorted(video_formats, key=lambda x: x.get('height', 0), reverse=True):
        key = (v.get('height'), v.get('ext'))
        if key not in seen:
            seen.add(key)
            unique_video.append(v)
    
    return unique_video, audio_formats

class VideoRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format: str = "mp4"
    quality: str
    type: str = "video"
    playlist: bool = False

@app.post("/api/video-info")
async def get_video_info(req: VideoRequest):
    """Get video information from any supported platform"""
    try:
        platform = detect_platform(req.url)
        logger.info(f"Detected platform: {platform} for URL: {req.url}")
        
        opts = BASE_YDL_OPTS.copy()
        opts.update(get_platform_opts(platform))
        opts['noplaylist'] = True
        
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(req.url, download=False)
        
        if info.get("_type") == "playlist":
            entries = []
            for e in info['entries']:
                if e is None:
                    continue
                video_formats, audio_formats = get_format_details(e.get('formats', []))
                entries.append({
                    "title": e.get("title"),
                    "url": e.get("webpage_url") or e.get("url"),
                    "thumbnail": e.get("thumbnail"),
                    "duration": e.get("duration"),
                    "video_formats": video_formats,
                    "audio_formats": audio_formats
                })
            return {
                "playlist_title": info.get("title"),
                "entries": entries,
                "platform": platform
            }
        
        video_formats, audio_formats = get_format_details(info.get('formats', []))
        
        return {
            "title": info.get("title"),
            "url": info.get("webpage_url") or info.get("url"),
            "thumbnail": info.get("thumbnail"),
            "duration": info.get("duration"),
            "description": info.get("description"),
            "uploader": info.get("uploader") or info.get("creator"),
            "upload_date": info.get("upload_date"),
            "view_count": info.get("view_count"),
            "video_formats": video_formats,
            "audio_formats": audio_formats,
            "platform": platform
        }
    except Exception as e:
        logger.error(f"Video info error for {req.url}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get video info: {str(e)}")
@app.websocket("/ws/download")
async def websocket_download(websocket: WebSocket):
    """WebSocket endpoint for live download progress"""
    await websocket.accept()
    try:
        data = await websocket.receive_json()
        url = data.get("url")
        format_type = data.get("type", "video")
        quality = data.get("quality", "720p")

        platform = detect_platform(url)
        logger.info(f"WebSocket download started for {platform}: {url}")

        ydl_opts = BASE_YDL_OPTS.copy()
        ydl_opts.update(get_platform_opts(platform))
        ydl_opts['noplaylist'] = True

        requested_height = parse_quality_request(quality)

        # Progress hook
        def progress_hook(d):
            if d['status'] == 'downloading':
                percent = d.get('_percent_str', '0.0%')
                total_bytes = d.get('_total_bytes_str', '0MiB')
                speed = d.get('_speed_str', '0MiB/s')
                eta = d.get('_eta_str', '0')
                frag_info = f"(frag {d.get('fragment_index',0)}/{d.get('fragment_count',0)})"
                msg = f"[download] {percent} of ~{total_bytes} at {speed} ETA {eta} {frag_info}"
                asyncio.create_task(websocket.send_text(msg))
            elif d['status'] == 'finished':
                asyncio.create_task(websocket.send_text("DONE"))

        ydl_opts['progress_hooks'] = [progress_hook]

        # Determine format
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            formats = info.get('formats', [])
            best_format = find_best_format(formats, requested_height, format_type)
            if best_format:
                ydl_opts['format'] = f"{best_format['format_id']}+bestaudio/best"
            else:
                ydl_opts['format'] = 'best'

            # Download file
            ydl.download([url])

    except Exception as e:
        await websocket.send_text(f"ERROR: {str(e)}")
        logger.error(f"WebSocket download error: {e}", exc_info=True)
    finally:
        await websocket.close()

@app.post("/api/download")
async def download_video(req: DownloadRequest, background_tasks: BackgroundTasks):
    """Universal download endpoint for all platforms"""
    try:
        platform = detect_platform(req.url)
        logger.info(f"Starting download from {platform}: {req.url}")
        
        ydl_opts = BASE_YDL_OPTS.copy()
        ydl_opts.update(get_platform_opts(platform))
        ydl_opts['noplaylist'] = not req.playlist
        
        # Get video info first
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(req.url, download=False)
        
        # Validate audio format
        if req.type == "audio" and req.quality not in ["mp3", "m4a", "opus", "webm", "aac"]:
            raise HTTPException(status_code=400, detail=f"Invalid audio format: {req.quality}")
        
        # Handle playlist downloads
        if req.playlist and info.get("_type") == "playlist":
            if req.type not in ["video", "audio"]:
                raise HTTPException(status_code=400, detail="Playlist download only supports video/audio")
            
            return await handle_playlist_download(req, info, ydl_opts, background_tasks)
        
        # Single video/audio handling
        if info.get("_type") == "playlist":
            info = next((e for e in info['entries'] if e), None)
            if not info:
                raise ValueError("Playlist is empty")
        
        url = info.get('webpage_url') or info.get('url') or req.url
        
        # Thumbnail download
        if req.type == "thumbnail":
            return await download_thumbnail(info, background_tasks)
        
        # Audio download
        if req.type == "audio":
            return await download_audio(info, url, req.quality, ydl_opts, background_tasks)
        
        # Video download
        return await download_video_file(info, url, req.quality, ydl_opts, background_tasks)
        
    except Exception as e:
        logger.error(f"Download error for {req.url}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")

async def handle_playlist_download(req: DownloadRequest, info: Dict, ydl_opts: Dict, background_tasks: BackgroundTasks):
    """Handle playlist downloads with zipping"""
    playlist_title = info.get("title", "playlist")
    subdir = os.path.join(DOWNLOADS_DIR, clean_filename(playlist_title))
    os.makedirs(subdir, exist_ok=True)
    zip_filename = clean_filename(f"{playlist_title}.zip")
    zip_path = os.path.join(DOWNLOADS_DIR, zip_filename)
    
    ydl_opts["outtmpl"] = os.path.join(subdir, "%(playlist_index)s_%(title)s.%(ext)s")
    
    if req.type == "audio":
        ydl_opts.update({
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': req.quality,
                'preferredquality': '192',
            }],
        })
    else:
        requested_height = parse_quality_request(req.quality)
        ydl_opts.update({
            'format': f'bestvideo[height<={requested_height}]+bestaudio/best[height<={requested_height}]/best',
            'merge_output_format': 'mp4',
        })
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([req.url])
    
    # Zip the playlist
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for root, _, files in os.walk(subdir):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.join(clean_filename(playlist_title), file)
                zipf.write(file_path, arcname=arcname)
    
    background_tasks.add_task(cleanup_file, zip_path)
    # Keep playlist folder for now
    # background_tasks.add_task(shutil.rmtree, subdir, ignore_errors=True)
    
    return FileResponse(path=zip_path, media_type="application/zip", filename=zip_filename)

async def download_thumbnail(info: Dict, background_tasks: BackgroundTasks):
    """Download video thumbnail"""
    thumbnail_url = info.get('thumbnail')
    if not thumbnail_url:
        raise ValueError("No thumbnail available")
    
    filename = clean_filename(f"{info['title']}.jpg")
    full_path = os.path.join(DOWNLOADS_DIR, filename)
    
    response = requests.get(thumbnail_url, stream=True, timeout=30)
    response.raise_for_status()
    
    with open(full_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)
    
    # Don't cleanup - keep downloaded files
    # background_tasks.add_task(cleanup_file, full_path)
    return FileResponse(path=full_path, media_type="image/jpeg", filename=filename)

async def download_audio(info: Dict, url: str, audio_format: str, ydl_opts: Dict, background_tasks: BackgroundTasks):
    """Download audio in requested format"""
    filename = clean_filename(f"{info['title']}.{audio_format}")
    full_path = os.path.join(DOWNLOADS_DIR, filename)
    
    ydl_opts.update({
        'outtmpl': full_path,
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': audio_format,
            'preferredquality': '192',
        }],
    })
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    
    # Handle actual downloaded file
    if not os.path.exists(full_path):
        base = os.path.splitext(full_path)[0]
        for ext in [audio_format, 'opus', 'm4a', 'webm', 'mp3']:
            test_path = f"{base}.{ext}"
            if os.path.exists(test_path):
                full_path = test_path
                filename = os.path.basename(test_path)
                break
        else:
            raise HTTPException(status_code=500, detail="Audio file not found after download")
    
    # Don't cleanup - keep downloaded files
    # background_tasks.add_task(cleanup_file, full_path)
    content_type = f'audio/{audio_format}' if audio_format != 'mp3' else 'audio/mpeg'
    return FileResponse(path=full_path, media_type=content_type, filename=filename)

async def download_video_file(info: Dict, url: str, quality: str, ydl_opts: Dict, background_tasks: BackgroundTasks):
    """Download video with quality matching"""
    requested_height = parse_quality_request(quality)
    formats = info.get('formats', [])
    
    # Find best matching format
    best_format = find_best_format(formats, requested_height, 'video')
    
    if not best_format:
        raise HTTPException(status_code=400, detail="No suitable video format found")
    
    actual_height = best_format.get('height', requested_height)
    logger.info(f"Downloading video: requested={requested_height}p, actual={actual_height}p, format={best_format.get('format_id')}")
    
    base_filename = clean_filename(info['title'])
    outtmpl = os.path.join(DOWNLOADS_DIR, f"{base_filename}.%(ext)s")
    
    ydl_opts.update({
        'outtmpl': outtmpl,
        'format': f"{best_format['format_id']}+bestaudio/best",
        'merge_output_format': 'mp4',
    })
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    
    # Find downloaded file
    possible_files = []
    for ext in ['mp4', 'MP4', 'webm', 'mkv', 'mov', 'avi']:
        possible_files.extend(glob.glob(os.path.join(DOWNLOADS_DIR, f"{base_filename}*.{ext}")))
    
    if not possible_files:
        raise HTTPException(status_code=500, detail="Video file not found after download")
    
    input_file = possible_files[0]
    output_file = os.path.join(DOWNLOADS_DIR, f"{base_filename}_{quality}.mp4")
    
    # Scale if needed
    if actual_height != requested_height:
        logger.info(f"Scaling video from {actual_height}p to {requested_height}p")
        cmd = f'"{FFMPEG_PATH}" -i "{input_file}" -vf "scale=-2:{requested_height}" -c:v libx264 -preset fast -c:a copy "{output_file}"'
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.warning(f"FFmpeg scaling failed, trying without audio: {result.stderr}")
            cmd = f'"{FFMPEG_PATH}" -i "{input_file}" -vf "scale=-2:{requested_height}" -c:v libx264 -preset fast -an "{output_file}"'
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            
            if result.returncode != 0:
                logger.error(f"FFmpeg failed: {result.stderr}")
                output_file = input_file
    else:
        output_file = input_file
    
    # Cleanup
    if os.path.exists(input_file) and input_file != output_file:
        os.remove(input_file)
    
    # Don't schedule cleanup - keep downloaded files
    # background_tasks.add_task(cleanup_file, output_file)
    filename = os.path.basename(output_file)
    
    return FileResponse(path=output_file, media_type="video/mp4", filename=filename)

@app.get("/")
async def root():
    """Health check"""
    return {
        "status": "running",
        "message": "Universal Multi-Platform Video Downloader API",
        "cookies": "✓ Loaded" if os.path.exists(COOKIES_FILE) else "Not loaded",
        "supported_platforms": ["YouTube", "TikTok", "Twitter/X", "Instagram", "Facebook", "Reddit", "Vimeo", "Dailymotion"]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)