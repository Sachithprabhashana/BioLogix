import { useEffect, useRef, useState } from 'react';

interface WebcamCaptureProps {
    onPhotoCaptured: (file: File, previewUrl: string) => void;
    onCameraError: (message: string) => void;
}

export function WebcamCapture({ onPhotoCaptured, onCameraError }: WebcamCaptureProps) {
    const [cameraOpen, setCameraOpen] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach((track) => track.stop());
            videoRef.current.srcObject = null;
        }
        setCameraOpen(false);
    };

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' },
                audio: false,
            });
            setCameraOpen(true);
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            }, 50);
        } catch {
            onCameraError('Unable to access webcam. Please check browser camera permissions.');
        }
    };

    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const previewUrl = canvas.toDataURL('image/jpeg', 0.9);
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    const file = new File([blob], 'webcam-checkin.jpg', { type: 'image/jpeg' });
                    onPhotoCaptured(file, previewUrl);
                }
                stopCamera();
            },
            'image/jpeg',
            0.9
        );
    };

    useEffect(() => {
        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    return (
        <div className="mt-2">
            {!cameraOpen ? (
                <button
                    type="button"
                    onClick={startCamera}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
                >
                    Use Webcam
                </button>
            ) : (
                <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900 p-3">
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="h-56 w-full rounded-md bg-black object-cover"
                    />
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={capturePhoto}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
                        >
                            Capture Photo
                        </button>
                        <button
                            type="button"
                            onClick={stopCamera}
                            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-700"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
}