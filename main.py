from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yt_dlp
import requests
import logging
import re
import imageio_ffmpeg
from fastapi import UploadFile, File, Form
import aiofiles
import os
import subprocess
import zipfile
import shutil
import glob
from typing import Optional, List, Dict, Any
from urllib.parse import urlparse
import asyncio
import uuid
import json
from datetime import datetime
import time

# ============================================
# Step 1: Server Setup & Configuration
# ============================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Universal Video Downloader API")

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# FFmpeg path detection
FFMPEG_PATH = imageio_ffmpeg.get_ffmpeg_exe()

# Downloads directory creation
DOWNLOADS_DIR = "./downloads"
SESSION_FILE = "./sessions.json"
COOKIES_FILE = "./cookies.txt"
HISTORY_FILE = "./download_history.json"
SETTINGS_FILE = "./user_settings.json"
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

# Enhanced yt-dlp base options with multi-platform support
BASE_YDL_OPTS = {
    'quiet': True,
    'no_warnings': True,
    'ffmpeg_location': FFMPEG_PATH,
    'extract_flat': False,
    'ignoreerrors': False,
    'no_color': True,
}

# Cookies file loading
if os.path.exists(COOKIES_FILE):
    BASE_YDL_OPTS['cookiefile'] = COOKIES_FILE
    logger.info(f"✓ Loaded cookies from {COOKIES_FILE}")
else:
    logger.warning(f"⚠ No cookies file found at {COOKIES_FILE}")

# Active downloads tracking
active_downloads: Dict[str, Dict[str, Any]] = {}
download_history: List[Dict[str, Any]] = []
user_settings: Dict[str, Any] = {
    "default_quality": "720p",
    "default_format": "mp4",
    "default_type": "video",
    "max_concurrent_downloads": 3,
}
download_sessions: Dict[str, Dict[str, Any]] = {}

# Load settings from file
def load_sessions():
    global download_sessions
    try:
        if os.path.exists(SESSION_FILE):
            with open(SESSION_FILE, "r") as f:
                download_sessions = json.load(f)
            logger.info(f"✓ Loaded {len(download_sessions)} sessions from {SESSION_FILE}")
        else:
            download_sessions = {}
    except Exception as e:
        logger.error(f"Failed to load sessions: {e}")
        download_sessions = {}

def save_sessions():
    try:
        with open(SESSION_FILE, "w") as f:
            json.dump(download_sessions, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save sessions: {e}")

def load_settings():
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_settings():
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(user_settings, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save settings: {e}")

def save_history_entry(entry: dict):
    try:
        history = []
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                history = json.load(f)
        history.insert(0, entry)
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Failed to save history: {e}")

def load_history():
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

# ============================================
# Step 2: Enhanced Utility Functions
# ============================================
def clean_filename(name: str) -> str:
    name = re.sub(r'[\\/*?:"<>|｜]', "_", name)
    return name.strip()[:200]

def cleanup_file(filepath: str):
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
            logger.info(f"Cleaned up: {filepath}")
    except Exception as e:
        logger.error(f"Cleanup error for {filepath}: {e}")

def detect_platform(url: str) -> str:
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
    opts = {}
    
    if platform == 'tiktok':
        opts['extractor_args'] = {
            'tiktok': {
                'api_hostname': 'api22-normal-c-useast2a.tiktokv.com',
            }
        }
    elif platform == 'instagram':
        opts.update({
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Mobile Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            },
        })
    elif platform == 'facebook':
        opts['http_headers'] = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.facebook.com/'
        }
    elif platform == 'twitter':
        opts['http_headers'] = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
            'Referer': 'https://twitter.com/'
        }
    elif platform == 'vimeo':
        opts['http_headers'] = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://vimeo.com/'
        }
    
    return opts

def parse_quality_request(quality_str: str) -> int:
    quality_map = {
        "144p": 144, "240p": 240, "360p": 360, "480p": 480,
        "720p": 720, "1080p": 1080, "1440p": 1440, "2160p": 2160,
        "2K": 1440, "4K": 2160, "8K": 4320
    }
    return quality_map.get(quality_str, int(re.sub(r'\D', '', quality_str)) if re.search(r'\d', quality_str) else 720)

def extract_format_info(fmt: Dict) -> Dict[str, Any]:
    height = fmt.get('height')
    width = fmt.get('width')
    
    if not height and fmt.get('resolution'):
        res_match = re.search(r'(\d+)x(\d+)', fmt.get('resolution', ''))
        if res_match:
            width, height = int(res_match.group(1)), int(res_match.group(2))
    
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

def find_best_format(formats: List[Dict], requested_height: int, format_type: str = 'video', platform: str = 'unknown') -> Optional[Dict]:
    if not formats:
        return None
    
    # ✅ FIX: Filter out HEVC/h265 formats for TikTok to avoid codec issues
    filtered_formats = formats.copy()
    if platform == 'tiktok':
        filtered_formats = [fmt for fmt in formats if 'hevc' not in (fmt.get('vcodec') or '').lower() and 'h265' not in (fmt.get('vcodec') or '').lower()]
        if not filtered_formats:
            filtered_formats = formats  # Fallback to all formats if no non-HEVC found
        logger.info(f"🔧 Filtered out HEVC formats for TikTok. Remaining: {len(filtered_formats)} formats")
    
    if format_type == 'video':
        # For video: prioritize formats with both video+audio, fallback to video-only
        combined_formats = [fmt for fmt in filtered_formats 
                          if fmt.get('vcodec') != 'none' and fmt.get('acodec') != 'none'
                          and fmt.get('vcodec') is not None]
        
        video_only_formats = [fmt for fmt in filtered_formats 
                            if fmt.get('vcodec') != 'none' and fmt.get('acodec') == 'none'
                            and fmt.get('vcodec') is not None]
        
        # Prefer combined formats, but include video-only as fallback
        candidates = combined_formats if combined_formats else video_only_formats
        
    else:  # audio
        candidates = [fmt for fmt in filtered_formats 
                     if fmt.get('acodec') != 'none' and fmt.get('acodec') is not None]
    
    if not candidates:
        return None
    
    processed = [extract_format_info(fmt) for fmt in candidates]
    
    if format_type == 'video':
        valid = [f for f in processed if f['height'] is not None or f['tbr'] is not None]
        if not valid:
            return candidates[0]
        
        # Prioritize exact height matches
        exact_matches = [f for f in valid if f['height'] == requested_height]
        if exact_matches:
            exact_matches.sort(key=lambda x: x.get('tbr', 0), reverse=True)
            best = exact_matches[0]
            logger.info(f"🎯 Exact quality match found: {best['height']}p")
        else:
            valid.sort(key=lambda x: (
                abs(x['height'] - requested_height) if x['height'] is not None else float('inf'),
                x.get('tbr', 0)
            ))
            best = valid[0]
            logger.info(f"🔄 Closest quality: {best['height'] or 'N/A'}p (requested: {requested_height}p)")
        
    else:
        valid = [f for f in processed if f['tbr'] is not None]
        if not valid:
            return candidates[0]
        valid.sort(key=lambda x: -x['tbr'])
        best = valid[0]
    
    for fmt in candidates:
        if fmt.get('format_id') == best['format_id']:
            vcodec = fmt.get('vcodec', 'N/A')
            has_audio = fmt.get('acodec') != 'none'
            logger.info(f"✅ Selected format: {best['format_id']} - {best.get('height', 'N/A')}p - {vcodec} - Has Audio: {has_audio}")
            return fmt
    
    return candidates[0]

def get_format_details(formats: List[Dict]) -> tuple:
    video_formats = []
    audio_formats = []
    
    for fmt in formats:
        info = extract_format_info(fmt)
        
        if info['vcodec'] and info['vcodec'] != 'none' and (info['height'] or info['tbr']):
            video_formats.append({
                "resolution": f"{info['height']}p" if info['height'] else info['resolution'],
                "format_id": info['format_id'],
                "ext": info['ext'],
                "vcodec": info['vcodec'],
                "filesize": info['filesize'],
                "width": info['width'],
                "height": info['height'],
                "tbr": info['tbr'],
            })
        elif info['acodec'] and info['acodec'] != 'none':
            audio_formats.append({
                "format": info['ext'],
                "format_id": info['format_id'],
                "acodec": info['acodec'],
                "filesize": info['filesize'],
                "tbr": info['tbr'],
            })
    
    seen = set()
    unique_video = []
    for v in sorted(video_formats, key=lambda x: (x.get('height', 0) or float('inf'), x.get('tbr', 0)), reverse=True):
        key = (v.get('height'), v.get('ext'))
        if key not in seen:
            seen.add(key)
            unique_video.append(v)
    
    return unique_video, audio_formats

def get_available_qualities(video_formats: List[Dict]) -> List[str]:
    heights = set()
    for fmt in video_formats:
        if fmt.get('height'):
            heights.add(fmt['height'])
    
    sorted_heights = sorted(heights, reverse=True)
    quality_map = {
        144: "144p", 240: "240p", 360: "360p", 480: "480p",
        720: "720p", 1080: "1080p", 1440: "2K", 2160: "4K", 4320: "8K"
    }
    return [quality_map.get(h, f"{h}p") for h in sorted_heights]

# ============================================
# Step 3: Data Models
# ============================================
class VideoRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format: str = "mp4"
    quality: str
    type: str = "video"
    playlist: bool = False

class SettingsRequest(BaseModel):
    default_quality: str = "720p"
    default_format: str = "mp4"
    default_type: str = "video"
    max_concurrent_downloads: int = 3
    


# ============================================
# Step 4: Enhanced Video Information Endpoint
# ============================================
@app.post("/api/video-info")
async def get_video_info(req: VideoRequest):
    try:
        platform = detect_platform(req.url)
        logger.info(f"Detected platform: {platform} for URL: {req.url}")
        
        opts = BASE_YDL_OPTS.copy()
        opts.update(get_platform_opts(platform))
        opts['noplaylist'] = True
        
        # ✅ FIX: Special handling for Instagram and Twitter
        if platform == 'instagram':
            opts['format'] = 'bestvideo+bestaudio/best'
        elif platform == 'twitter':
            opts['format'] = 'bestvideo+bestaudio/best'
        
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(req.url, download=False)
        
        video_formats, audio_formats = get_format_details(info.get('formats', []))
        available_qualities = get_available_qualities(video_formats)
        recommended_quality = available_qualities[0] if available_qualities else "720p"
        
        response_data = {
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
            "platform": platform,
            "available_qualities": available_qualities,
            "recommended_quality": recommended_quality,
        }
        
        return response_data
        
    except Exception as e:
        logger.error(f"Video info error for {req.url}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get video info: {str(e)}")

# ============================================
# Step 5: FIXED WebSocket Download System with TikTok & Twitter Support
# ============================================
@app.websocket("/ws/download/{download_id}")
async def websocket_download(websocket: WebSocket, download_id: str):
    await websocket.accept()
    
    loop = asyncio.get_event_loop()
    
    try:
        existing_session = download_sessions.get(download_id)
        is_reconnect = existing_session and existing_session.get("status") in ["initializing", "downloading", "processing"]
        
        if is_reconnect:
            logger.info(f"🔄 RECONNECTION: Client reconnected to existing download: {download_id}")
            
            active_downloads[download_id] = {
                "websocket": websocket,
                "active": True,
                "cancelled": False,
                "reconnected_at": datetime.now().isoformat()
            }
            
            current_progress = existing_session.get("progress", 0)
            await websocket.send_json({
                "status": "reconnected",
                "percent": current_progress,
                "message": f"Reconnected! Download is {current_progress:.1f}% complete",
                "total": existing_session.get("total", "Calculating..."),
                "speed": existing_session.get("speed", "Unknown"),
                "eta": existing_session.get("eta", "Unknown")
            })
            
            logger.info(f"✅ Successfully reconnected client to download {download_id} at {current_progress}%")
            
            while (download_id in active_downloads and 
                   active_downloads[download_id].get("active", False) and
                   not active_downloads[download_id].get("cancelled", False)):
                await asyncio.sleep(1)
            
            return
        
        # NEW DOWNLOAD
        data = await websocket.receive_json()
        url = data.get("url")
        format_type = data.get("type", "video")
        quality = data.get("quality", user_settings.get("default_quality", "720p"))
        audio_format = data.get("format", user_settings.get("default_format", "mp4"))

        platform = detect_platform(url)
        logger.info(f"🎬 Starting NEW download: {platform} | Quality: {quality} | Type: {format_type}")

        active_downloads[download_id] = {
            "websocket": websocket,
            "active": True,
            "cancelled": False
        }
        download_sessions[download_id] = {
            "url": url,
            "type": format_type,
            "quality": quality,
            "format": audio_format,
            "status": "initializing",
            "progress": 0,
            "started_at": datetime.now().isoformat(),
            "title": "Unknown",
            "speed": "Unknown",
            "eta": "Unknown"
        }
        save_sessions()

        ydl_opts = BASE_YDL_OPTS.copy()
        ydl_opts.update(get_platform_opts(platform))
        ydl_opts['noplaylist'] = True

        # ✅ FIX: Enhanced platform-specific configuration
        if platform == 'instagram':
            ydl_opts.update({
                'format': 'bestvideo+bestaudio/best',
                'merge_output_format': 'mp4',
            })
            logger.info("🔧 Applied Instagram-specific download settings")
        elif platform == 'twitter':
            ydl_opts.update({
                'format': 'bestvideo+bestaudio/best',
                'merge_output_format': 'mp4',
            })
            logger.info("🔧 Applied Twitter-specific download settings")

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        download_sessions[download_id]["title"] = info.get('title', 'Unknown')
        save_sessions()

        base_filename = clean_filename(info.get('title', 'video'))
        requested_height = parse_quality_request(quality)

        if format_type == "audio":
            ydl_opts['outtmpl'] = os.path.join(DOWNLOADS_DIR, f"{base_filename}.%(ext)s")
            ydl_opts['format'] = 'bestaudio/best'
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': audio_format,
                'preferredquality': '192',
            }]
            final_ext = audio_format
            logger.info(f"🎵 Audio download: format={audio_format}")

        elif format_type == "video":
            # Get all available formats
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
            
            # ✅ FIX: Special handling for different platforms
            if platform in ['instagram', 'twitter']:
                # Instagram & Twitter: Use combined format approach
                ydl_opts['outtmpl'] = os.path.join(DOWNLOADS_DIR, f"{base_filename}_{quality}.%(ext)s")
                ydl_opts['format'] = 'bestvideo+bestaudio/best'
                ydl_opts['merge_output_format'] = 'mp4'
                final_ext = 'mp4'
                logger.info(f"🎥 {platform.capitalize()} video download: Using bestvideo+bestaudio format")
            elif platform == 'tiktok':
                # ✅ FIX: TikTok - Avoid HEVC codec and ensure audio merging
                ydl_opts['outtmpl'] = os.path.join(DOWNLOADS_DIR, f"{base_filename}_{quality}.%(ext)s")
                
                # Find best non-HEVC format
                best_format = find_best_format(info.get('formats', []), requested_height, format_type, platform)
                
                if not best_format:
                    raise ValueError("No suitable video format found")
                
                format_id = best_format.get('format_id')
                
                # Check if selected format has audio
                has_audio = best_format.get('acodec') != 'none'
                
                if not has_audio:
                    logger.warning("⚠️ Selected TikTok video format has no audio, will attempt to merge with best audio stream")
                    
                    # Find best audio format
                    audio_format_obj = find_best_format(info.get('formats', []), 0, 'audio', platform)
                    if audio_format_obj:
                        audio_format_id = audio_format_obj.get('format_id')
                        # Use format combination: video+audio
                        format_id = f"{format_id}+{audio_format_id}"
                        logger.info(f"🔊 Will merge TikTok video {format_id} with audio {audio_format_id}")
                    else:
                        logger.warning("⚠️ No audio stream found for TikTok - video will be silent")
                
                ydl_opts['format'] = format_id
                ydl_opts['merge_output_format'] = 'mp4'
                final_ext = 'mp4'
                logger.info(f"🎥 TikTok video download: {quality} -> format_id={format_id} (has_audio: {has_audio})")
            else:
                # Other platforms: Standard approach
                best_format = find_best_format(info.get('formats', []), requested_height, format_type, platform)
                
                if not best_format:
                    raise ValueError("No suitable video format found")
                
                format_id = best_format.get('format_id')
                
                # Check if selected format has audio
                has_audio = best_format.get('acodec') != 'none'
                
                if not has_audio:
                    logger.warning("⚠️ Selected video format has no audio, will attempt to merge with best audio stream")
                    
                    # Find best audio format
                    audio_format_obj = find_best_format(info.get('formats', []), 0, 'audio', platform)
                    if audio_format_obj:
                        audio_format_id = audio_format_obj.get('format_id')
                        # Use format combination: video+audio
                        format_id = f"{format_id}+{audio_format_id}"
                        logger.info(f"🔊 Will merge video {format_id} with audio {audio_format_id}")
                    else:
                        logger.warning("⚠️ No audio stream found - video will be silent")
                
                ydl_opts['outtmpl'] = os.path.join(DOWNLOADS_DIR, f"{base_filename}_{quality}.%(ext)s")
                ydl_opts['format'] = format_id
                ydl_opts['merge_output_format'] = 'mp4'
                final_ext = 'mp4'
                logger.info(f"🎥 Video download: {quality} -> format_id={format_id} (has_audio: {has_audio})")           

        else:  # thumbnail
            ydl_opts['outtmpl'] = os.path.join(DOWNLOADS_DIR, f"{base_filename}_thumbnail.%(ext)s")
            ydl_opts['writethumbnail'] = True
            ydl_opts['skip_download'] = True
            final_ext = 'jpg'
            logger.info(f"🖼️ Thumbnail download")

        def progress_hook(d):
            if not active_downloads.get(download_id, {}).get("active", False):
                raise yt_dlp.utils.DownloadCancelled("Download cancelled")

            if d['status'] == 'downloading':
                if d.get('_percent_str') and d['_percent_str'] != 'NA':
                    percent_str = re.sub(r'[^\d.]', '', d['_percent_str'])
                    try:
                        percent = float(percent_str)
                    except ValueError:
                        percent = 0.0
                else:
                    downloaded = d.get('downloaded_bytes', 0)
                    total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
                    percent = (downloaded / total * 100) if total > 0 else 0.0
                
                def clean_ansi(text):
                    return re.sub(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])', '', text) if text else "Unknown"

                msg = {
                    "status": "downloading",
                    "percent": round(percent, 2),
                    "total": clean_ansi(d.get('_total_bytes_str', 'Unknown')),
                    "speed": clean_ansi(d.get('_speed_str', 'Unknown')),
                    "eta": clean_ansi(d.get('_eta_str', 'Unknown')),
                    "fragment_index": d.get('fragment_index', 0),
                    "fragment_count": d.get('fragment_count', 0)
                }
                
                download_sessions[download_id].update({
                    "progress": percent,
                    "status": "downloading",
                    "speed": msg["speed"],
                    "eta": msg["eta"]
                })
                save_sessions()
                
                ws = active_downloads.get(download_id, {}).get("websocket")
                if ws:
                    try:
                        asyncio.run_coroutine_threadsafe(ws.send_json(msg), loop)
                    except Exception as e:
                        logger.warning(f"⚠️ Failed to send progress (client may have switched tabs): {e}")
                
            elif d['status'] == 'finished':
                download_sessions[download_id].update({
                    "status": "processing",
                    "progress": 95
                })
                save_sessions()
                
                ws = active_downloads.get(download_id, {}).get("websocket")
                if ws:
                    try:
                        asyncio.run_coroutine_threadsafe(
                            ws.send_json({"status": "processing", "message": "Finalizing download..."}),
                            loop
                        )
                    except Exception as e:
                        logger.warning(f"⚠️ Failed to send processing status: {e}")

        ydl_opts['progress_hooks'] = [progress_hook]

        await asyncio.to_thread(lambda: yt_dlp.YoutubeDL(ydl_opts).download([url]))

        pattern = os.path.join(DOWNLOADS_DIR, f"{base_filename}*")
        possible_files = glob.glob(pattern)
        
        if not possible_files:
            raise Exception("Downloaded file not found")

        downloaded_file = max(possible_files, key=os.path.getctime)
        filename = os.path.basename(downloaded_file)
        file_size = os.path.getsize(downloaded_file)

        actual_quality = quality
        if format_type == "video":
            try:
                ffprobe_cmd = [
                    FFMPEG_PATH.replace('ffmpeg', 'ffprobe'),
                    '-v', 'error',
                    '-select_streams', 'v:0',
                    '-show_entries', 'stream=height,codec_name',
                    '-of', 'csv=p=0',
                    downloaded_file
                ]
                result = subprocess.run(ffprobe_cmd, capture_output=True, text=True)
                if result.returncode == 0:
                    lines = result.stdout.strip().split('\n')
                    if lines:
                        actual_height = int(lines[0].split(',')[0])
                        codec_name = lines[0].split(',')[1] if len(lines[0].split(',')) > 1 else 'unknown'
                        quality_map = {144: "144p", 240: "240p", 360: "360p", 480: "480p", 720: "720p", 1080: "1080p", 1440: "2K", 2160: "4K", 4320: "8K"}
                        actual_quality = quality_map.get(actual_height, f"{actual_height}p")
                        logger.info(f"📊 Actual quality: {actual_quality} ({actual_height}p) - Codec: {codec_name}")
            except Exception as e:
                logger.warning(f"Could not verify video quality: {e}")

        entry = {
            "id": str(uuid.uuid4()),
            "title": info.get("title"),
            "url": url,
            "thumbnail": info.get("thumbnail"),
            "format": audio_format if format_type == "audio" else final_ext,
            "quality": quality if format_type != "video" else actual_quality,
            "type": format_type,
            "timestamp": int(time.time() * 1000),
            "file_size": f"{round(file_size / (1024 * 1024), 2)} MB",
            "filename": filename
        }
        save_history_entry(entry)

        completion_msg = {
            "status": "completed",
            "message": "Download completed successfully",
            "filename": filename,
            "file_size": file_size,
            "selected_quality": actual_quality,
            "file_url": f"http://localhost:8000/downloads/{filename}"
        }
        
        download_sessions[download_id].update({
            "status": "completed",
            "progress": 100,
            "filename": filename
        })
        save_sessions()
        
        ws = active_downloads.get(download_id, {}).get("websocket")
        if ws:
            try:
                await ws.send_json(completion_msg)
            except Exception as e:
                logger.warning(f"⚠️ Failed to send completion message: {e}")

    except yt_dlp.utils.DownloadCancelled:
        logger.info(f"❌ Download cancelled: {download_id}")
        ws = active_downloads.get(download_id, {}).get("websocket")
        if ws:
            try:
                await ws.send_json({"status": "cancelled", "message": "Download cancelled"})
            except:
                pass
        
        if download_id in download_sessions:
            download_sessions[download_id]["status"] = "cancelled"
            save_sessions()
            
    except WebSocketDisconnect:
        logger.info(f"🔌 WebSocket disconnected for download {download_id} (client may have switched tabs)")
        if download_id in active_downloads:
            active_downloads[download_id]["active"] = False
            active_downloads[download_id]["websocket"] = None
            
    except Exception as e:
        logger.error(f"❌ WebSocket download error: {e}", exc_info=True)
        ws = active_downloads.get(download_id, {}).get("websocket")
        if ws:
            try:
                await ws.send_json({"status": "error", "message": str(e)})
            except:
                pass
        
        if download_id in download_sessions:
            download_sessions[download_id]["status"] = "error"
            save_sessions()
            
    finally:
        session = download_sessions.get(download_id)
        if session and session.get("status") in ["completed", "cancelled", "error"]:
            logger.info(f"🗑️ Cleaning up finished download: {download_id}")
            active_downloads.pop(download_id, None)
            download_sessions.pop(download_id, None)
            save_sessions()
        else:
            if download_id in active_downloads:
                active_downloads[download_id]["active"] = False
            logger.info(f"💾 Keeping session for possible reconnection: {download_id}")
        
        try:
            await websocket.close()
        except:
            pass

# ============================================
# Step 6: Enhanced HTTP Download Endpoint
# ============================================
@app.post("/api/download")
async def download_video(req: DownloadRequest, background_tasks: BackgroundTasks):
    try:
        platform = detect_platform(req.url)
        logger.info(f"Starting download from {platform}: {req.url} | Quality: {req.quality}")
        
        ydl_opts = BASE_YDL_OPTS.copy()
        ydl_opts.update(get_platform_opts(platform))
        ydl_opts['noplaylist'] = not req.playlist
        
        # ✅ FIX: Platform-specific configuration
        if platform == 'instagram':
            ydl_opts['format'] = 'bestvideo+bestaudio/best'
            ydl_opts['merge_output_format'] = 'mp4'
        elif platform == 'twitter':
            ydl_opts['format'] = 'bestvideo+bestaudio/best'
            ydl_opts['merge_output_format'] = 'mp4'
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(req.url, download=False)
        
        if req.playlist and info.get("_type") == "playlist":
            return await handle_playlist_download(req, info, ydl_opts, background_tasks)
        
        if info.get("_type") == "playlist":
            info = next((e for e in info['entries'] if e), None)
            if not info:
                raise ValueError("Playlist is empty")
        
        url = info.get('webpage_url') or info.get('url') or req.url
        base_filename = clean_filename(info['title'])
        requested_height = parse_quality_request(req.quality)

        if req.type == "audio":
            filename = clean_filename(f"{info['title']}.{req.quality}")
            full_path = os.path.join(DOWNLOADS_DIR, filename)
            ydl_opts.update({
                'outtmpl': full_path,
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': req.quality,
                    'preferredquality': '192',
                }],
            })
            
        elif req.type == "video":
            # ✅ FIX: Special handling for different platforms
            if platform in ['instagram', 'twitter']:
                filename = clean_filename(f"{info['title']}_{req.quality}.mp4")
                full_path = os.path.join(DOWNLOADS_DIR, filename)
                ydl_opts.update({
                    'outtmpl': full_path.replace('.mp4', '.%(ext)s'),
                    'format': 'bestvideo+bestaudio/best',
                    'merge_output_format': 'mp4',
                })
            elif platform == 'tiktok':
                # ✅ FIX: TikTok - Avoid HEVC and ensure audio
                filename = clean_filename(f"{info['title']}_{req.quality}.mp4")
                full_path = os.path.join(DOWNLOADS_DIR, filename)
                
                # Find best non-HEVC format
                best_format = find_best_format(info.get('formats', []), requested_height, req.type, platform)
                
                if not best_format:
                    raise ValueError("No suitable video format found")
                
                format_id = best_format.get('format_id')
                
                # Check if selected format has audio
                has_audio = best_format.get('acodec') != 'none'
                
                if not has_audio:
                    # Find best audio format
                    audio_format_obj = find_best_format(info.get('formats', []), 0, 'audio', platform)
                    if audio_format_obj:
                        audio_format_id = audio_format_obj.get('format_id')
                        format_id = f"{format_id}+{audio_format_id}"
                
                ydl_opts.update({
                    'outtmpl': full_path.replace('.mp4', '.%(ext)s'),
                    'format': format_id,
                    'merge_output_format': 'mp4',
                })
            else:
                # Standard approach for other platforms
                best_format = find_best_format(info.get('formats', []), requested_height, req.type, platform)
                
                if not best_format:
                    raise ValueError("No suitable video format found")
                
                format_id = best_format.get('format_id')
                
                # Check if selected format has audio
                has_audio = best_format.get('acodec') != 'none'
                
                if not has_audio:
                    # Find best audio format
                    audio_format_obj = find_best_format(info.get('formats', []), 0, 'audio', platform)
                    if audio_format_obj:
                        audio_format_id = audio_format_obj.get('format_id')
                        format_id = f"{format_id}+{audio_format_id}"
                
                filename = clean_filename(f"{info['title']}_{req.quality}.mp4")
                full_path = os.path.join(DOWNLOADS_DIR, filename)
                ydl_opts.update({
                    'outtmpl': full_path.replace('.mp4', '.%(ext)s'),
                    'format': format_id,
                    'merge_output_format': 'mp4',
                })
            
        else:  # thumbnail
            filename = clean_filename(f"{info['title']}.jpg")
            full_path = os.path.join(DOWNLOADS_DIR, filename)
            thumbnail_url = info.get('thumbnail')
            if not thumbnail_url:
                raise ValueError("No thumbnail available")
            response = requests.get(thumbnail_url, stream=True, timeout=30)
            response.raise_for_status()
            with open(full_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
            return FileResponse(path=full_path, media_type="image/jpeg", filename=filename)

        if req.type != "thumbnail":
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            if not os.path.exists(full_path):
                base = os.path.splitext(full_path)[0]
                for ext in ['mp4', 'webm', 'mkv', 'mp3', 'm4a']:
                    test_path = f"{base}.{ext}"
                    if os.path.exists(test_path):
                        full_path = test_path
                        filename = os.path.basename(test_path)
                        break
                else:
                    raise HTTPException(status_code=500, detail="File not found after download")

        ext = os.path.splitext(filename)[1].lower()
        media_types = {
            '.mp4': 'video/mp4',
            '.mp3': 'audio/mpeg',
            '.m4a': 'audio/mp4',
            '.webm': 'video/webm',
            '.jpg': 'image/jpeg',
            '.png': 'image/png',
        }
        media_type = media_types.get(ext, 'application/octet-stream')

        try:
            total_size = os.path.getsize(full_path) if os.path.exists(full_path) else None
            entry = {
                "id": str(int(time.time() * 1000)),
                "title": info.get("title"),
                "url": info.get("webpage_url") or req.url,  
                "thumbnail": info.get("thumbnail"),
                "format": req.format,
                "quality": req.quality,
                "type": req.type,
                "timestamp": int(time.time() * 1000),
                "file_size": f"{round(total_size / (1024*1024), 2)} MB" if total_size else None,
                "filename": filename
            }
            save_history_entry(entry)
        except Exception as e:
            logger.error(f"Failed to save history entry: {e}")

        return FileResponse(
            path=full_path,
            media_type=media_type,
            filename=filename
        )
        
    except Exception as e:
        logger.error(f"Download error for {req.url}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")

async def handle_playlist_download(req: DownloadRequest, info: Dict, ydl_opts: Dict, background_tasks: BackgroundTasks):
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
        # Select best format for each video in the playlist with audio merging
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(req.url, download=False)
            format_ids = []
            for entry in info.get('entries', []):
                best_format = find_best_format(entry.get('formats', []), requested_height, req.type, detect_platform(req.url))
                if best_format:
                    format_id = best_format.get('format_id')
                    # Check if format has audio
                    has_audio = best_format.get('acodec') != 'none'
                    
                    if not has_audio:
                        # Find best audio format for this entry
                        audio_format = find_best_format(entry.get('formats', []), 0, 'audio', detect_platform(req.url))
                        if audio_format:
                            audio_format_id = audio_format.get('format_id')
                            format_id = f"{format_id}+{audio_format_id}"
                    
                    format_ids.append(format_id)
                else:
                    format_ids.append('bestvideo[height<={requested_height}]+bestaudio/best')
        
        ydl_opts.update({
            'format': '+'.join(format_ids) if format_ids else 'bestvideo+bestaudio/best',
            'merge_output_format': 'mp4',
        })
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([req.url])
    
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for root, _, files in os.walk(subdir):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.join(clean_filename(playlist_title), file)
                zipf.write(file_path, arcname=arcname)
    
    background_tasks.add_task(cleanup_file, zip_path)
    background_tasks.add_task(shutil.rmtree, subdir, ignore_errors=True)
    
    return FileResponse(path=zip_path, media_type="application/zip", filename=zip_filename)

# ============================================
# Step 7: File Serving & Other Endpoints
# ============================================
@app.get("/downloads/{filename}")
async def serve_download(filename: str):
    file_path = os.path.join(DOWNLOADS_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    ext = os.path.splitext(filename)[1].lower()
    media_types = {
        '.mp4': 'video/mp4',
        '.mp3': 'audio/mpeg',
        '.m4a': 'audio/mp4',
        '.webm': 'video/webm',
        '.jpg': 'image/jpeg',
        '.png': 'image/png',
    }
    media_type = media_types.get(ext, 'application/octet-stream')
    
    return FileResponse(path=file_path, media_type=media_type, filename=filename)

@app.get("/api/history")
async def get_history():
    return {"history": load_history()}

@app.delete("/api/history/{record_id}")
async def delete_history_record(record_id: str):
    try:
        history = load_history()
        updated = [h for h in history if h.get("id") != record_id]
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(updated, f, indent=2, ensure_ascii=False)
        return {"message": "Record deleted"}
    except Exception as e:
        logger.error(f"Failed to delete history record: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete record")

@app.delete("/api/history")
async def clear_all_history():
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump([], f, indent=2, ensure_ascii=False)
        return {"message": "History cleared"}
    except Exception as e:
        logger.error(f"Failed to clear history: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear history")

@app.get("/api/active-downloads")
async def get_active_downloads():
    active = []
    for download_id, session in download_sessions.items():
        if session.get("status") in ["initializing", "downloading", "processing"]:
            active.append({
                "download_id": download_id,
                "status": session.get("status", "unknown"),
                "url": session.get("url"),
                "title": session.get("title", "Unknown"),
                "progress": session.get("progress", 0),
                "quality": session.get("quality"),
                "type": session.get("type"),
                "started_at": session.get("started_at")
            })
    return {"active_downloads": active}

@app.post("/api/cancel/{download_id}")
async def cancel_download(download_id: str):
    if download_id not in active_downloads:
        raise HTTPException(status_code=404, detail="Download not found")
    
    active_downloads[download_id]["active"] = False
    active_downloads[download_id]["cancelled"] = True
    save_sessions()
    return {"status": "cancelled", "message": f"Download {download_id} cancelled"}

@app.get("/api/settings")
async def get_settings():
    return user_settings

@app.post("/api/settings")
async def update_settings(settings: SettingsRequest):
    global user_settings
    user_settings = {
        "default_quality": settings.default_quality,
        "default_format": settings.default_format,
        "default_type": settings.default_type,
        "max_concurrent_downloads": settings.max_concurrent_downloads
    }
    save_settings()
    return user_settings

@app.get("/")
async def root():
    return {
        "status": "running",
        "message": "Universal Multi-Platform Video Downloader API",
        "cookies": "✓ Loaded" if os.path.exists(COOKIES_FILE) else "Not loaded",
        "supported_platforms": ["YouTube", "TikTok", "Twitter/X", "Instagram", "Facebook", "Reddit", "Vimeo", "Dailymotion"]
    }

@app.post("/api/debug-formats")
async def debug_formats(req: VideoRequest):
    try:
        platform = detect_platform(req.url)
        opts = BASE_YDL_OPTS.copy()
        opts.update(get_platform_opts(platform))
        
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(req.url, download=False)
        
        format_details = []
        for fmt in info.get('formats', []):
            format_details.append({
                'format_id': fmt.get('format_id'),
                'ext': fmt.get('ext'),
                'resolution': fmt.get('resolution'),
                'vcodec': fmt.get('vcodec'),
                'acodec': fmt.get('acodec'),
                'filesize': fmt.get('filesize'),
                'note': fmt.get('format_note'),
                'has_audio': fmt.get('acodec') != 'none',
                'has_video': fmt.get('vcodec') != 'none',
            })
        
        return {
            "platform": platform,
            "title": info.get('title'),
            "formats": format_details
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
# ============================================
# NEW: Video Conversion Models & Functions
# ============================================

class ConvertRequest(BaseModel):
    filename: str
    output_format: str = "mp4"
    quality: str = "auto"
    resolution: str = "original"

class UploadRequest(BaseModel):
    filename: str
    original_format: str

# NEW: Video conversion utility functions
def get_video_info(file_path: str) -> Dict[str, Any]:
    """Get video information using ffprobe"""
    try:
        ffprobe_cmd = [
            FFMPEG_PATH.replace('ffmpeg', 'ffprobe'),
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            file_path
        ]
        result = subprocess.run(ffprobe_cmd, capture_output=True, text=True)
        if result.returncode == 0:
            return json.loads(result.stdout)
        return {}
    except Exception as e:
        logger.error(f"Error getting video info: {e}")
        return {}

def convert_video(input_path: str, output_path: str, output_format: str, quality: str, resolution: str):
    """Convert video to different format/quality"""
    try:
        ffmpeg_cmd = [FFMPEG_PATH, '-i', input_path]
        
        # Set video quality
        if quality != "auto" and quality != "original":
            if quality == "high":
                ffmpeg_cmd.extend(['-crf', '18'])  # High quality
            elif quality == "medium":
                ffmpeg_cmd.extend(['-crf', '23'])  # Medium quality
            elif quality == "low":
                ffmpeg_cmd.extend(['-crf', '28'])  # Low quality
            elif quality == "smallest":
                ffmpeg_cmd.extend(['-crf', '32'])  # Smallest size
        
        # Set resolution
        if resolution != "original":
            ffmpeg_cmd.extend(['-vf', f'scale={resolution}'])
        
        # Set output format options
        if output_format == "mp4":
            ffmpeg_cmd.extend([
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-movflags', '+faststart',
                '-preset', 'medium'
            ])
        elif output_format == "webm":
            ffmpeg_cmd.extend([
                '-c:v', 'libvpx-vp9',
                '-c:a', 'libopus',
                '-b:v', '1M',
                '-crf', '30'
            ])
        elif output_format == "avi":
            ffmpeg_cmd.extend([
                '-c:v', 'mpeg4',
                '-c:a', 'mp3',
                '-q:v', '5'
            ])
        elif output_format == "mov":
            ffmpeg_cmd.extend([
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-preset', 'medium'
            ])
        
        ffmpeg_cmd.append('-y')  # Overwrite output file
        ffmpeg_cmd.append(output_path)
        
        logger.info(f"Conversion command: {' '.join(ffmpeg_cmd)}")
        
        result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise Exception(f"FFmpeg error: {result.stderr}")
        
        return True
    except Exception as e:
        logger.error(f"Video conversion error: {e}")
        raise

# ============================================
# NEW: Video Upload & Conversion Endpoints
# ============================================

@app.post("/api/upload-video")
async def upload_video(file: UploadFile, background_tasks: BackgroundTasks):
    """Upload video file for conversion"""
    try:
        # Validate file type
        allowed_extensions = ['.mp4', '.avi', '.mov', '.webm', '.mkv', '.flv', '.wmv']
        file_extension = os.path.splitext(file.filename)[1].lower()
        
        if file_extension not in allowed_extensions:
            raise HTTPException(status_code=400, detail="Unsupported file format")
        
        # Generate unique filename
        file_id = str(uuid.uuid4())
        original_filename = f"{file_id}_original{file_extension}"
        original_path = os.path.join(DOWNLOADS_DIR, original_filename)
        
        # Save uploaded file
        with open(original_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Get video info
        video_info = get_video_info(original_path)
        
        # Save upload record
        upload_entry = {
            "id": file_id,
            "original_filename": file.filename,
            "stored_filename": original_filename,
            "file_size": len(content),
            "upload_time": datetime.now().isoformat(),
            "video_info": video_info
        }
        
        return {
            "file_id": file_id,
            "original_filename": file.filename,
            "stored_filename": original_filename,
            "file_size": len(content),
            "video_info": video_info,
            "message": "Video uploaded successfully"
        }
        
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.post("/api/convert-video")
async def convert_video_endpoint(req: ConvertRequest, background_tasks: BackgroundTasks):
    """Convert uploaded video to different format/quality"""
    try:
        # Find original file
        original_pattern = os.path.join(DOWNLOADS_DIR, f"{req.filename}_original.*")
        original_files = glob.glob(original_pattern)
        
        if not original_files:
            raise HTTPException(status_code=404, detail="Original video not found")
        
        original_path = original_files[0]
        original_extension = os.path.splitext(original_path)[1]
        
        # Generate output filename
        output_filename = f"{req.filename}_converted.{req.output_format}"
        output_path = os.path.join(DOWNLOADS_DIR, output_filename)
        
        # Convert video
        await asyncio.to_thread(
            convert_video, 
            original_path, 
            output_path, 
            req.output_format, 
            req.quality, 
            req.resolution
        )
        
        # Get converted file info
        converted_size = os.path.getsize(output_path)
        video_info = get_video_info(output_path)
        
        # Save conversion record
        conversion_entry = {
            "id": str(uuid.uuid4()),
            "original_file": req.filename,
            "converted_file": output_filename,
            "output_format": req.output_format,
            "quality": req.quality,
            "resolution": req.resolution,
            "file_size": converted_size,
            "conversion_time": datetime.now().isoformat(),
            "video_info": video_info
        }
        
        return {
            "converted_filename": output_filename,
            "file_size": converted_size,
            "video_info": video_info,
            "download_url": f"http://localhost:8000/downloads/{output_filename}",
            "message": "Video converted successfully"
        }
        
    except Exception as e:
        logger.error(f"Conversion error: {e}")
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")

@app.get("/api/uploaded-videos")
async def get_uploaded_videos():
    """Get list of uploaded videos"""
    try:
        uploaded_videos = []
        pattern = os.path.join(DOWNLOADS_DIR, "*_original.*")
        
        for file_path in glob.glob(pattern):
            filename = os.path.basename(file_path)
            file_id = filename.split('_original')[0]
            file_size = os.path.getsize(file_path)
            video_info = get_video_info(file_path)
            
            uploaded_videos.append({
                "file_id": file_id,
                "filename": filename,
                "file_size": file_size,
                "video_info": video_info,
                "upload_time": datetime.fromtimestamp(os.path.getctime(file_path)).isoformat()
            })
        
        return {"uploaded_videos": uploaded_videos}
    except Exception as e:
        logger.error(f"Error getting uploaded videos: {e}")
        return {"uploaded_videos": []}

@app.delete("/api/uploaded-videos/{file_id}")
async def delete_uploaded_video(file_id: str):
    """Delete uploaded video and its conversions"""
    try:
        # Find and delete original file
        original_pattern = os.path.join(DOWNLOADS_DIR, f"{file_id}_original.*")
        original_files = glob.glob(original_pattern)
        
        # Find and delete converted files
        converted_pattern = os.path.join(DOWNLOADS_DIR, f"{file_id}_converted.*")
        converted_files = glob.glob(converted_pattern)
        
        deleted_files = []
        
        for file_path in original_files + converted_files:
            try:
                os.remove(file_path)
                deleted_files.append(os.path.basename(file_path))
            except Exception as e:
                logger.error(f"Error deleting {file_path}: {e}")
        
        return {
            "message": "Video files deleted successfully",
            "deleted_files": deleted_files
        }
        
    except Exception as e:
        logger.error(f"Error deleting video: {e}")
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")
# Add this WebSocket endpoint to your backend
@app.websocket("/ws/convert/{conversion_id}")
async def websocket_convert(websocket: WebSocket, conversion_id: str):
    await websocket.accept()
    
    try:
        # Wait for conversion start message
        data = await websocket.receive_json()
        filename = data.get("filename")
        output_format = data.get("output_format")
        quality = data.get("quality")
        resolution = data.get("resolution")
        
        if not filename:
            await websocket.send_json({"status": "error", "message": "No filename provided"})
            return
        
        # Find original file
        original_pattern = os.path.join(DOWNLOADS_DIR, f"{filename}_original.*")
        original_files = glob.glob(original_pattern)
        
        if not original_files:
            await websocket.send_json({"status": "error", "message": "Original video not found"})
            return
        
        original_path = original_files[0]
        output_filename = f"{filename}_converted.{output_format}"
        output_path = os.path.join(DOWNLOADS_DIR, output_filename)
        
        await websocket.send_json({"status": "initializing", "message": "Starting conversion..."})
        
        # Enhanced conversion function with progress reporting
        async def convert_with_progress():
            try:
                # Get original file size for progress calculation
                original_size = os.path.getsize(original_path)
                
                ffmpeg_cmd = [
                    FFMPEG_PATH, 
                    '-i', original_path,
                    '-progress', 'pipe:1',  # Send progress to stdout
                    '-loglevel', 'info'
                ]
                
                # Set video quality
                if quality != "auto" and quality != "original":
                    if quality == "high":
                        ffmpeg_cmd.extend(['-crf', '18'])
                    elif quality == "medium":
                        ffmpeg_cmd.extend(['-crf', '23'])
                    elif quality == "low":
                        ffmpeg_cmd.extend(['-crf', '28'])
                    elif quality == "smallest":
                        ffmpeg_cmd.extend(['-crf', '32'])
                
                # Set resolution
                if resolution != "original":
                    ffmpeg_cmd.extend(['-vf', f'scale={resolution}'])
                
                # Set output format options
                if output_format == "mp4":
                    ffmpeg_cmd.extend([
                        '-c:v', 'libx264',
                        '-c:a', 'aac',
                        '-movflags', '+faststart',
                        '-preset', 'medium'
                    ])
                elif output_format == "webm":
                    ffmpeg_cmd.extend([
                        '-c:v', 'libvpx-vp9',
                        '-c:a', 'libopus',
                        '-b:v', '1M',
                        '-crf', '30'
                    ])
                elif output_format == "avi":
                    ffmpeg_cmd.extend([
                        '-c:v', 'mpeg4',
                        '-c:a', 'mp3',
                        '-q:v', '5'
                    ])
                elif output_format == "mov":
                    ffmpeg_cmd.extend([
                        '-c:v', 'libx264',
                        '-c:a', 'aac',
                        '-preset', 'medium'
                    ])
                
                ffmpeg_cmd.extend(['-y', output_path])
                
                logger.info(f"Starting conversion with command: {' '.join(ffmpeg_cmd)}")
                
                # Start FFmpeg process
                process = await asyncio.create_subprocess_exec(
                    *ffmpeg_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                
                # Read progress from stdout
                while True:
                    line = await process.stdout.readline()
                    if not line:
                        break
                    
                    line_str = line.decode().strip()
                    
                    # Parse progress information
                    if line_str.startswith('out_time='):
                        # Extract time progress
                        time_str = line_str.split('=')[1]
                        # Send progress update
                        await websocket.send_json({
                            "status": "converting",
                            "message": "Converting video...",
                            "progress": 50  # Estimate 50% for time-based progress
                        })
                    
                    elif line_str.startswith('progress='):
                        progress_val = line_str.split('=')[1]
                        if progress_val == 'end':
                            break
                
                # Wait for process completion
                await process.wait()
                
                if process.returncode == 0:
                    converted_size = os.path.getsize(output_path)
                    video_info = get_video_info(output_path)
                    
                    await websocket.send_json({
                        "status": "completed",
                        "message": "Conversion completed successfully",
                        "converted_filename": output_filename,
                        "file_size": converted_size,
                        "video_info": video_info,
                        "download_url": f"http://localhost:8000/downloads/{output_filename}"
                    })
                else:
                    stderr = await process.stderr.read()
                    error_msg = stderr.decode() if stderr else "Unknown error"
                    await websocket.send_json({
                        "status": "error", 
                        "message": f"Conversion failed: {error_msg}"
                    })
                    
            except Exception as e:
                logger.error(f"Conversion error: {e}")
                await websocket.send_json({
                    "status": "error", 
                    "message": f"Conversion error: {str(e)}"
                })
        
        # Start conversion
        await convert_with_progress()
        
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for conversion: {conversion_id}")
    except Exception as e:
        logger.error(f"WebSocket conversion error: {e}")
        await websocket.send_json({
            "status": "error", 
            "message": f"WebSocket error: {str(e)}"
        })
    finally:
        await websocket.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)