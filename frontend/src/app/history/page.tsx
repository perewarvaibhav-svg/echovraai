"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, Activity, BrainCircuit } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function HistoryDashboard() {
    const router = useRouter();
    const [history, setHistory] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://echovraai-production.up.railway.app';
                const res = await fetch(`${BACKEND}/api/history`);
                const data = await res.json();
                setHistory(data);
            } catch (err) {
                console.error('Failed to fetch history', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchHistory();
    }, []);

    // Color definitions for emotions
    const getEmotionColor = (emotion: string) => {
        const colors: Record<string, string> = {
            'Happy': 'text-green-400 bg-green-500/10 border-green-500/20',
            'Sad': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
            'Angry': 'text-red-400 bg-red-500/10 border-red-500/20',
            'Fearful': 'text-purple-400 bg-purple-500/10 border-purple-500/20',
            'Disgust': 'text-orange-400 bg-orange-500/10 border-orange-500/20',
            'Surprised': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
            'Neutral': 'text-slate-300 bg-slate-500/10 border-slate-500/20'
        };
        return colors[emotion] || colors['Neutral'];
    };

    return (
        <div className="min-h-screen w-full bg-black flex flex-col p-8 md:p-16 relative overflow-x-hidden">
            {/* Background elements */}
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] bg-teal-900/20 rounded-full blur-[120px] pointer-events-none" />
            
            <button 
                onClick={() => router.push('/')}
                className="text-white/50 hover:text-white transition-colors flex items-center gap-2 z-20 w-max mb-12"
            >
                <ArrowLeft className="w-5 h-5" />
                Back to Home
            </button>

            <div className="flex items-center gap-4 mb-12 z-20 relative">
                <BrainCircuit className="w-10 h-10 text-teal-500" />
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-white">Echovra AI Dashboard</h1>
                    <p className="text-slate-400 mt-1">Real-time analysis cloud telemetry</p>
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center mt-32 relative z-20">
                    <Activity className="w-12 h-12 text-teal-500 animate-pulse mb-4" />
                    <span className="text-slate-400 tracking-widest uppercase text-sm">Querying Cloud Database...</span>
                </div>
            ) : (
                <motion.div 
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 z-20 relative"
                >
                    {history.length === 0 ? (
                        <div className="col-span-full text-center py-24 border border-white/5 bg-white/5 rounded-2xl backdrop-blur-md">
                            <p className="text-slate-400">No recordings logged to the cloud yet.</p>
                        </div>
                    ) : (
                        history.map((item, idx) => (
                            <motion.div 
                                key={item.id || idx}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.05 }}
                                className="bg-black/40 border border-white/10 rounded-2xl p-6 backdrop-blur-xl relative overflow-hidden group hover:border-teal-500/30 transition-all duration-300"
                            >
                                {/* Top Header */}
                                <div className="flex justify-between items-start mb-4">
                                    <div className={`px-3 py-1 rounded-full border text-xs font-semibold uppercase tracking-wider ${getEmotionColor(item.emotion)}`}>
                                        {item.emotion}
                                    </div>
                                    <div className="text-xs text-slate-500 flex items-center gap-1 font-mono">
                                        <Clock className="w-3 h-3" />
                                        {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </div>
                                </div>
                                
                                {/* Transcript */}
                                <p className="text-white/80 text-lg italic font-light line-clamp-3 mb-6">
                                    "{item.transcript}"
                                </p>
                                
                                {/* Confidence Score */}
                                <div className="absolute bottom-6 right-6">
                                    <div className="text-[10px] text-slate-500 uppercase tracking-widest text-right mb-1">Confidence</div>
                                    <div className="font-mono text-teal-400 bg-teal-950/40 px-2 py-1 rounded border border-teal-500/20 text-sm">
                                        {item.confidence.toFixed(1)}%
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    )}
                </motion.div>
            )}
        </div>
    );
}
