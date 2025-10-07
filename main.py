
from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
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
import asyncio
import uuid

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

# Track active downloads for cancellation
active_downloads: Dict[str, Dict[str, Any]] = {}

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
        opts['http_headers'] = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
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

def find_best_format(formats: List[Dict], requested_height: int, format_type: str = 'video') -> Optional[Dict]:
    if not formats:
        return None
    
    if format_type == 'video':
        candidates = [fmt for fmt in formats if fmt.get('vcodec') != 'none']
    else:
        candidates = [fmt for fmt in formats if fmt.get('acodec') != 'none']
    
    if not candidates:
        return None
    
    processed = [extract_format_info(fmt) for fmt in candidates]
    valid = [f for f in processed if f['quality_score'] > 0]
    if not valid:
        return candidates[0]
    
    valid_sorted = sorted(valid, key=lambda x: (
        abs(x['quality_score'] - requested_height),
        -x['quality_score']
    ))
    
    best = valid_sorted[0]
    
    for fmt in candidates:
        if fmt.get('format_id') == best['format_id']:
            logger.info(f"Selected format: {best['format_id']} - {best['resolution']} ({best['ext']}) for requested {requested_height}p")
            return fmt
    
    return candidates[0]

def get_format_details(formats: List[Dict]) -> tuple:
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

@app.websocket("/ws/download/{download_id}")
async def websocket_download(websocket: WebSocket, download_id: str):
    await websocket.accept()
    active_downloads[download_id] = {"active": True, "websocket": websocket}

    try:
        data = await websocket.receive_json()
        url = data.get("url")
        format_type = data.get("type", "video")
        quality = data.get("quality", "720p")
        audio_format = data.get("format", "mp3")

        platform = detect_platform(url)
        logger.info(f"WebSocket download started (ID: {download_id}) for {platform}: {url}")

        await websocket.send_json({"status": "initializing", "message": "Starting download..."})

        ydl_opts = BASE_YDL_OPTS.copy()
        ydl_opts.update(get_platform_opts(platform))
        ydl_opts['noplaylist'] = True

        loop = asyncio.get_event_loop()  # ✅ capture current loop for safe send

        def progress_hook(d):
            """Thread-safe progress updates for yt_dlp"""
            if not active_downloads.get(download_id, {}).get("active", False):
                raise yt_dlp.utils.DownloadCancelled("Download cancelled by user")

            if d['status'] == 'downloading':
                downloaded_bytes = d.get('downloaded_bytes', 0)
                total_bytes = d.get('total_bytes') or d.get('total_bytes_estimate')

                if total_bytes:
                    percent = (downloaded_bytes / total_bytes) * 100
                else:
                    percent = 0.0

                msg = {
                    "status": "downloading",
                    "percent": round(percent, 2),
                    "total": d.get('_total_bytes_str', 'Unknown'),
                    "speed": d.get('_speed_str', '0MiB/s'),
                    "eta": d.get('_eta_str', 'Unknown'),
                    "fragment_index": d.get('fragment_index', 0),
                    "fragment_count": d.get('fragment_count', 0)
                }

                # ✅ use run_coroutine_threadsafe instead of create_task
                asyncio.run_coroutine_threadsafe(websocket.send_json(msg), loop)

            elif d['status'] == 'finished':
                asyncio.run_coroutine_threadsafe(
                    websocket.send_json({"status": "processing", "message": "Processing file..."}),
                    loop
                )

        ydl_opts['progress_hooks'] = [progress_hook]

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        base_filename = clean_filename(info.get('title', 'video'))

        if format_type == "audio":
            ydl_opts['outtmpl'] = os.path.join(DOWNLOADS_DIR, f"{base_filename}.%(ext)s")
            ydl_opts['format'] = 'bestaudio/best'
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': audio_format,
                'preferredquality': '192',
            }]
            final_ext = audio_format
        else:
            requested_height = parse_quality_request(quality)
            formats = info.get('formats', [])
            best_format = find_best_format(formats, requested_height, 'video')

            if best_format:
                ydl_opts['format'] = f"{best_format['format_id']}+bestaudio/best"
            else:
                ydl_opts['format'] = 'best'

            ydl_opts['outtmpl'] = os.path.join(DOWNLOADS_DIR, f"{base_filename}.%(ext)s")
            ydl_opts['merge_output_format'] = 'mp4'
            final_ext = 'mp4'

        # ✅ Run yt-dlp in thread to avoid blocking event loop
        def run_download():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

        await asyncio.to_thread(run_download)

        if not active_downloads.get(download_id, {}).get("active", False):
            await websocket.send_json({"status": "cancelled", "message": "Download cancelled"})
            return

        possible_files = glob.glob(os.path.join(DOWNLOADS_DIR, f"{base_filename}*.{final_ext}"))
        if not possible_files:
            for ext in ['mp4', 'webm', 'mkv', 'mp3', 'm4a', 'opus']:
                possible_files = glob.glob(os.path.join(DOWNLOADS_DIR, f"{base_filename}*.{ext}"))
                if possible_files:
                    break

        if not possible_files:
            await websocket.send_json({"status": "error", "message": "Downloaded file not found"})
            return

        filename = os.path.basename(possible_files[0])
        await websocket.send_json({
            "status": "completed",
            "message": "Download completed successfully",
            "filename": filename
        })

    except yt_dlp.utils.DownloadCancelled:
        logger.info(f"Download {download_id} cancelled by user")
        await websocket.send_json({"status": "cancelled", "message": "Download cancelled by user"})
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for download {download_id}")
    except Exception as e:
        logger.error(f"WebSocket download error: {e}", exc_info=True)
        try:
            await websocket.send_json({"status": "error", "message": str(e)})
        except:
            pass
    finally:
        active_downloads.pop(download_id, None)
        try:
            await websocket.close()
        except:
            pass

@app.post("/api/cancel/{download_id}")
async def cancel_download(download_id: str):
    if download_id in active_downloads:
        active_downloads[download_id]["active"] = False
        logger.info(f"Cancellation requested for download {download_id}")
        
        # Try to close websocket
        try:
            ws = active_downloads[download_id].get("websocket")
            if ws:
                await ws.send_json({"status": "cancelled", "message": "Download cancelled by user"})
        except:
            pass
        
        return {"status": "cancelled", "message": "Download cancellation requested"}
    return {"status": "not_found", "message": "Download not found"}

import asyncio
from urllib.parse import quote
async def delayed_cleanup(filepath: str, delay: int = 10):
    """Wait a few seconds before deleting file to let the client finish downloading."""
    await asyncio.sleep(delay)
    if os.path.exists(filepath):
        os.remove(filepath)
        print(f"🧹 Cleaned up after {delay}s: {filepath}")

@app.get("/downloads/{filename}")
async def serve_download(filename: str, background_tasks: BackgroundTasks):
    """Serve downloaded file and cleanup after"""
    file_path = os.path.join(DOWNLOADS_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    # Schedule cleanup
    background_tasks.add_task(cleanup_file, file_path)
    
    ext = os.path.splitext(filename)[1].lower()
    media_types = {
        '.mp4': 'video/mp4',
        '.mp3': 'audio/mpeg',
        '.m4a': 'audio/mp4',
        '.webm': 'video/webm',
        '.mkv': 'video/x-matroska',
        '.jpg': 'image/jpeg',
        '.png': 'image/png',
    }
    media_type = media_types.get(ext, 'application/octet-stream')
    
    quoted_filename = quote(filename)  # ✅ Fix special chars
    headers = {"Content-Disposition": f'attachment; filename="{quoted_filename}"; filename*=UTF-8\'\'{quoted_filename}'}
    
    return FileResponse(
        path=file_path,
        media_type=media_type,
        headers=headers
    )


@app.get("/")
async def root():
    return {
        "status": "running",
        "message": "Universal Multi-Platform Video Downloader API",
        "cookies": "✓ Loaded" if os.path.exists(COOKIES_FILE) else "Not loaded",
        "supported_platforms": ["YouTube", "TikTok", "Twitter/X", "Instagram", "Facebook", "Reddit", "Vimeo", "Dailymotion"]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)