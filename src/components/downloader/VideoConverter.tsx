// components/VideoConverter.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Download, Trash2, Video, FileVideo, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";

interface UploadedVideo {
    file_id: string;
    filename: string;
    file_size: number;
    video_info: any;
    upload_time: string;
}

interface ConversionSettings {
    outputFormat: string;
    quality: string;
    resolution: string;
}

const VideoConverter = () => {
    const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([]);
    const [selectedVideo, setSelectedVideo] = useState<string>("");
    const [conversionSettings, setConversionSettings] = useState<ConversionSettings>({
        outputFormat: "mp4",
        quality: "auto",
        resolution: "original"
    });
    const [isConverting, setIsConverting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [conversionProgress, setConversionProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState("");
    const [convertedFile, setConvertedFile] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    const formats = [
        { value: "mp4", label: "MP4" },
        { value: "webm", label: "WebM" },
        { value: "avi", label: "AVI" },
        { value: "mov", label: "MOV" }
    ];

    const qualities = [
        { value: "auto", label: "Auto (Original)" },
        { value: "high", label: "High Quality" },
        { value: "medium", label: "Medium Quality" },
        { value: "low", label: "Low Quality" },
        { value: "smallest", label: "Smallest Size" }
    ];

    const resolutions = [
        { value: "original", label: "Original" },
        { value: "3840x2160", label: "4K (3840x2160)" },
        { value: "2560x1440", label: "2K (2560x1440)" },
        { value: "1920x1080", label: "1080p (1920x1080)" },
        { value: "1280x720", label: "720p (1280x720)" },
        { value: "854x480", label: "480p (854x480)" },
        { value: "640x360", label: "360p (640x360)" }
    ];

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Validate file type
        const allowedTypes = ['video/mp4', 'video/avi', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/x-flv', 'video/x-ms-wmv'];
        if (!allowedTypes.includes(file.type)) {
            toast({
                title: "Invalid File",
                description: "Please upload a valid video file (MP4, AVI, MOV, WebM, etc.)",
                variant: "destructive"
            });
            return;
        }

        // Validate file size (max 500MB)
        if (file.size > 500 * 1024 * 1024) {
            toast({
                title: "File Too Large",
                description: "Please upload a video smaller than 500MB",
                variant: "destructive"
            });
            return;
        }

        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await axios.post("http://127.0.0.1:8000/api/upload-video", formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            });

            toast({
                title: "Upload Successful",
                description: "Video uploaded successfully",
            });

            // Refresh uploaded videos list
            await fetchUploadedVideos();

            // Auto-select the uploaded video
            setSelectedVideo(response.data.file_id);

        } catch (error: any) {
            toast({
                title: "Upload Failed",
                description: error.response?.data?.detail || "Failed to upload video",
                variant: "destructive"
            });
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const fetchUploadedVideos = async () => {
        try {
            const response = await axios.get("http://127.0.0.1:8000/api/uploaded-videos");
            setUploadedVideos(response.data.uploaded_videos || []);
        } catch (error) {
            console.error("Error fetching uploaded videos:", error);
        }
    };

    const handleConvertVideo = async () => {
        if (!selectedVideo) {
            toast({
                title: "No Video Selected",
                description: "Please select a video to convert",
                variant: "destructive"
            });
            return;
        }

        setIsConverting(true);
        setConversionProgress(0);
        setStatusMessage("Starting conversion...");
        setConvertedFile(null);

        // Better progress simulation
        const progressSteps = [
            { progress: 10, message: "Initializing conversion..." },
            { progress: 25, message: "Analyzing video..." },
            { progress: 50, message: "Processing video..." },
            { progress: 75, message: "Encoding video..." },
            { progress: 90, message: "Finalizing..." },
            { progress: 100, message: "Complete!" }
        ];

        try {
            // Show initial progress
            setConversionProgress(progressSteps[0].progress);
            setStatusMessage(progressSteps[0].message);

            // Start progress simulation
            for (let i = 1; i < progressSteps.length - 1; i++) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between steps
                setConversionProgress(progressSteps[i].progress);
                setStatusMessage(progressSteps[i].message);
            }

            // Actual conversion call
            const response = await axios.post("http://127.0.0.1:8000/api/convert-video", {
                filename: selectedVideo,
                output_format: conversionSettings.outputFormat,
                quality: conversionSettings.quality,
                resolution: conversionSettings.resolution
            }, {
                timeout: 300000, // 5 minute timeout
            });

            // Show completion
            setConversionProgress(progressSteps[progressSteps.length - 1].progress);
            setStatusMessage(progressSteps[progressSteps.length - 1].message);
            setConvertedFile(response.data.converted_filename);

            toast({
                title: "Conversion Complete",
                description: "Video converted successfully",
            });

        } catch (error: any) {
            console.error("Conversion error:", error);
            toast({
                title: "Conversion Failed",
                description: error.response?.data?.detail || error.message || "Failed to convert video",
                variant: "destructive"
            });
        } finally {
            setIsConverting(false);
        }
    };

    const handleDownloadConverted = async (filename: string) => {
        try {
            const response = await axios.get(
                `http://127.0.0.1:8000/downloads/${filename}`,
                { responseType: 'blob' }
            );

            const blob = new Blob([response.data]);
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);

            toast({
                title: "Download Complete",
                description: "Converted video downloaded successfully"
            });

        } catch (error: any) {
            toast({
                title: "Download Failed",
                description: "Failed to download converted video",
                variant: "destructive"
            });
        }
    };

    const handleDeleteVideo = async (fileId: string) => {
        try {
            await axios.delete(`http://127.0.0.1:8000/api/uploaded-videos/${fileId}`);

            toast({
                title: "Video Deleted",
                description: "Video and its conversions deleted successfully"
            });

            await fetchUploadedVideos();

            if (selectedVideo === fileId) {
                setSelectedVideo("");
                setConvertedFile(null);
            }

        } catch (error: any) {
            toast({
                title: "Delete Failed",
                description: error.response?.data?.detail || "Failed to delete video",
                variant: "destructive"
            });
        }
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Load uploaded videos on component mount
    useEffect(() => {
        fetchUploadedVideos();
    }, []);

    return (
        <div className="space-y-6">
            {/* Upload Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Upload className="w-5 h-5" />
                        Upload Video
                    </CardTitle>
                    <CardDescription>
                        Upload a video file to convert it to different formats and qualities
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                            <Input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                accept="video/*"
                                className="hidden"
                                id="video-upload"
                                disabled={isUploading}
                            />
                            <Label htmlFor="video-upload" className="cursor-pointer">
                                <div className="flex flex-col items-center gap-2">
                                    {isUploading ? (
                                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                                    ) : (
                                        <FileVideo className="w-8 h-8 text-gray-400" />
                                    )}
                                    <span className="text-sm font-medium">
                                        {isUploading ? "Uploading..." : "Click to upload video"}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        Supported formats: MP4, AVI, MOV, WebM, MKV, FLV, WMV
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        Max file size: 500MB
                                    </span>
                                </div>
                            </Label>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Uploaded Videos List */}
            {uploadedVideos.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Uploaded Videos</CardTitle>
                        <CardDescription>
                            Select a video to convert
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {uploadedVideos.map((video) => (
                                <div
                                    key={video.file_id}
                                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer ${selectedVideo === video.file_id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                                        }`}
                                    onClick={() => setSelectedVideo(video.file_id)}
                                >
                                    <div className="flex items-center gap-3">
                                        <Video className="w-4 h-4 text-gray-500" />
                                        <div>
                                            <div className="font-medium text-sm">
                                                {video.filename.split('_original')[0]}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {formatFileSize(video.file_size)}
                                            </div>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteVideo(video.file_id);
                                        }}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Conversion Settings */}
            {selectedVideo && (
                <Card>
                    <CardHeader>
                        <CardTitle>Conversion Settings</CardTitle>
                        <CardDescription>
                            Configure output format, quality, and resolution
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <Label>Output Format</Label>
                                <Select
                                    value={conversionSettings.outputFormat}
                                    onValueChange={(value) => setConversionSettings(prev => ({ ...prev, outputFormat: value }))}
                                    disabled={isConverting}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {formats.map((format) => (
                                            <SelectItem key={format.value} value={format.value}>
                                                {format.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label>Quality</Label>
                                <Select
                                    value={conversionSettings.quality}
                                    onValueChange={(value) => setConversionSettings(prev => ({ ...prev, quality: value }))}
                                    disabled={isConverting}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {qualities.map((quality) => (
                                            <SelectItem key={quality.value} value={quality.value}>
                                                {quality.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label>Resolution</Label>
                                <Select
                                    value={conversionSettings.resolution}
                                    onValueChange={(value) => setConversionSettings(prev => ({ ...prev, resolution: value }))}
                                    disabled={isConverting}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {resolutions.map((resolution) => (
                                            <SelectItem key={resolution.value} value={resolution.value}>
                                                {resolution.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Conversion Progress */}
                        {isConverting && (
                            <div className="mt-4 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span>{statusMessage}</span>
                                    <span>{conversionProgress}%</span>
                                </div>
                                <Progress value={conversionProgress} className="h-2" />
                            </div>
                        )}

                        {/* Converted File Download */}
                        {convertedFile && (
                            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="font-medium text-sm">Conversion Complete!</div>
                                        <div className="text-xs text-green-600">Ready for download</div>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => handleDownloadConverted(convertedFile)}
                                    >
                                        <Download className="w-4 h-4 mr-2" />
                                        Download
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Convert Button */}
                        <div className="mt-6">
                            <Button
                                onClick={handleConvertVideo}
                                disabled={isConverting || !selectedVideo}
                                className="w-full"
                            >
                                {isConverting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Converting...
                                    </>
                                ) : (
                                    "Convert Video"
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default VideoConverter;