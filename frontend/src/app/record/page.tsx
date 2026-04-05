"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Mic, Square, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

// Sonic Waveform Canvas bound to audio intensity
const AudioReactiveWaveform = ({ intensity }: { intensity: number }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        const mouse = { x: canvas.width / 2, y: canvas.height / 2 };
        let time = 0;

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        
        const draw = () => {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // Clear with trail
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const lineCount = 60;
            const segmentCount = 80;
            const height = canvas.height / 2;
            
            // Core multiplier based on voice intensity!
            const impact = 1 + (intensity * 8);

            for (let i = 0; i < lineCount; i++) {
                ctx.beginPath();
                const progress = i / lineCount;
                const colorIntensity = Math.sin(progress * Math.PI);
                ctx.strokeStyle = `rgba(0, 255, 192, ${colorIntensity * 0.5 * impact})`;
                ctx.lineWidth = 1.5 + (intensity * 2);

                for (let j = 0; j < segmentCount + 1; j++) {
                    const x = (j / segmentCount) * canvas.width;
                    
                    const distToMouse = Math.hypot(x - mouse.x, height - mouse.y);
                    const mouseEffect = Math.max(0, 1 - distToMouse / 400);

                    // Wave calculation bound to intensity
                    const noise = Math.sin(j * 0.1 + time + i * 0.2) * 20 * impact;
                    const spike = Math.cos(j * 0.2 + time + i * 0.1) * Math.sin(j * 0.05 + time) * 50 * impact;
                    const y = height + noise + spike * (1 + mouseEffect * 2);
                    
                    if (j === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.stroke();
            }

            time += 0.02 + (intensity * 0.1);
            animationFrameId = requestAnimationFrame(draw);
        };

        const handleMouseMove = (event: MouseEvent) => {
            mouse.x = event.clientX;
            mouse.y = event.clientY;
        };

        window.addEventListener('resize', resizeCanvas);
        window.addEventListener('mousemove', handleMouseMove);
        
        resizeCanvas();
        draw();

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', resizeCanvas);
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, [intensity]);

    return <canvas ref={canvasRef} className="absolute inset-0 z-0 w-full h-full" />;
};

export default function RecordPage() {
    const router = useRouter();
    const [isRecording, setIsRecording] = useState(false);
    const [audioIntensity, setAudioIntensity] = useState(0);
    const [analysisResult, setAnalysisResult] = useState<{emotion: string, confidence: string, transcript: string} | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<BlobPart[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number>(0);

    const updateIntensity = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        setAudioIntensity(average / 255);
        
        animationFrameRef.current = requestAnimationFrame(updateIntensity);
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioContextRef.current.createMediaStreamSource(stream);
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
            source.connect(analyserRef.current);
            
            updateIntensity();

            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };
            
            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                if (audioContextRef.current) audioContextRef.current.close();
                
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                await processAudio(blob, 'mic_recording.webm');
            };

            mediaRecorder.start();
            setIsRecording(true);
            setAnalysisResult(null);
        } catch (err) {
            console.error(err);
            alert('Microphone access denied.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            setIsProcessing(true);
            setTimeout(() => setAudioIntensity(0), 100);
        }
    };

    const processAudio = async (file: Blob, filename: string) => {
        const formData = new FormData();
        formData.append('audio', file, filename);

        try {
            const res = await fetch('/api/analyze-voice', { method: 'POST', body: formData });
            const data = await res.json();
            
            if (data.error) throw new Error(data.error);
            setAnalysisResult({
                emotion: data.emotion,
                confidence: data.confidence,
                transcript: data.transcript
            });
        } catch (err: any) {
            alert('Analysis Error: ' + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    useEffect(() => {
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
            }
        };
    }, []);

    // Outer shadow expands on loud sound
    const shadowSpread = 10 + (audioIntensity * 80);

    return (
        <div className="h-screen w-full bg-black flex flex-col items-center justify-center relative overflow-hidden">
            {/* The Audio Intensive Sonic Waveform Background */}
            <AudioReactiveWaveform intensity={audioIntensity} />

            <div className="absolute inset-0 bg-black/40 z-[1] pointer-events-none" />

            {/* Back Button */}
            <button 
                onClick={() => router.push('/')}
                className="absolute top-8 left-8 text-white/50 hover:text-white transition-colors flex items-center gap-2 z-20"
            >
                <ArrowLeft className="w-5 h-5" />
                Back
            </button>

            {/* Content overlay */}
            <div className="relative z-20 flex flex-col items-center justify-center w-full max-w-2xl px-6">
                <motion.h1 
                    initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                    className="text-4xl font-light text-white mb-24 tracking-wide shadow-black drop-shadow-lg"
                >
                    Speak your truth.
                </motion.h1>

                <div className="relative flex items-center justify-center">
                    {isRecording && (
                        <motion.div
                            className="absolute inset-0 rounded-full bg-teal-500/10 pointer-events-none"
                            animate={{ 
                                scale: 1 + (audioIntensity * 0.5),
                                boxShadow: `0 0 ${shadowSpread}px rgba(20, 184, 166, ${Math.max(0.2, audioIntensity)})`
                            }}
                            transition={{ type: "tween", ease: "linear", duration: 0.05 }}
                        />
                    )}

                    <button
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isProcessing}
                        className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center backdrop-blur-md transition-all duration-500 border-2 shadow-2xl
                            ${isRecording 
                                ? 'bg-red-500/10 border-red-500/60 text-red-500 hover:bg-red-500/20' 
                                : 'bg-white/5 border-white/20 text-white hover:bg-white/20 hover:scale-105'
                            }
                            ${isProcessing ? 'opacity-50 cursor-not-allowed scale-95' : ''}
                        `}
                    >
                        {isRecording ? (
                            <Square className="w-10 h-10 fill-current" />
                        ) : (
                            <Mic className="w-10 h-10" />
                        )}
                    </button>
                </div>

                <div className="mt-16 h-8 flex items-center justify-center text-slate-300 drop-shadow-md">
                    {isProcessing ? (
                        <span className="animate-pulse tracking-[0.2em] uppercase text-sm">Echovra AI analyzing...</span>
                    ) : isRecording ? (
                        <span className="text-red-400 uppercase tracking-widest text-sm animate-pulse font-medium">Recording</span>
                    ) : (
                        <span className="uppercase tracking-widest text-sm opacity-50">Tap to express</span>
                    )}
                </div>

                {/* Results Panel */}
                {analysisResult && (
                    <motion.div 
                        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
                        className="mt-12 p-8 bg-black/60 border border-teal-500/30 rounded-2xl backdrop-blur-2xl text-left w-full shadow-2xl relative overflow-hidden"
                    >
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-teal-500 to-transparent opacity-50" />
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <div className="text-[11px] text-slate-500 uppercase mb-2 tracking-[0.2em] font-semibold">Detected Emotion</div>
                                <div className="text-5xl font-bold text-white tracking-tight">{analysisResult.emotion}</div>
                            </div>
                            <div className="flex flex-col items-end">
                                <div className="text-[11px] text-slate-500 uppercase mb-2 tracking-[0.2em] font-semibold">Confidence</div>
                                <div className="font-mono text-xl text-teal-400 bg-teal-950/50 px-4 py-2 border border-teal-500/20 rounded-lg shadow-inner">
                                    {analysisResult.confidence}
                                </div>
                            </div>
                        </div>
                        <div className="w-full h-px bg-white/10 my-6" />
                        <div className="text-[11px] text-slate-500 uppercase mb-3 tracking-[0.2em] font-semibold">Decoded Transcript</div>
                        <div className="italic text-slate-300 text-lg leading-relaxed font-light">"{analysisResult.transcript}"</div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
